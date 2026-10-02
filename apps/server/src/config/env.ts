import { z } from 'zod'

/**
 * Configuración del servidor validada con Zod (guía §4.15). Solo se validan aquí las variables que
 * ya usa el código; las de fases futuras (Better Auth, Cloudinary, Gmail…) están documentadas en
 * `apps/server/.env.example` y se añaden a este esquema en la fase que las necesita.
 */

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

const NODE_ENVS = ['development', 'test', 'production'] as const
export type NodeEnv = (typeof NODE_ENVS)[number]

const bool = z.enum(['1', '0', 'true', 'false'], { error: 'debe ser 1, 0, true o false' })

const EnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS, { error: 'debe ser development, test o production' }).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce
    .number({ error: 'debe ser un número' })
    .int({ error: 'debe ser un entero' })
    .min(1, { error: 'debe estar entre 1 y 65535' })
    .max(65535, { error: 'debe estar entre 1 y 65535' })
    .default(3000),
  /** URL pública de la web (`https://battle.otherpeople.es`); su origen se permite siempre. */
  BB_PUBLIC_URL: z.string().optional(),
  /**
   * Orígenes extra permitidos en escrituras, separados por comas (comprobación de `Origin`, §4.13).
   * Por defecto `http://localhost:5173` fuera de producción; en producción, ninguno además del de
   * `BB_PUBLIC_URL` (un `localhost` permitido en producción no tiene sentido).
   */
  ALLOWED_ORIGINS: z.string().optional(),
  /** libSQL: `file:./data/local.db` en local, `libsql://…` en Turso, `:memory:` en tests. */
  DATABASE_URL: z.string().min(1).default('file:./data/local.db'),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  /**
   * Carpeta de migraciones, si no es la de por defecto. Solo hace falta en la función de Vercel,
   * donde el código va empaquetado (ver `src/serverless.ts`).
   */
  MIGRATIONS_DIR: z.string().optional(),
  /** Reloj de prueba (`x-bb-test-now`, §4.12). Prohibido en producción. */
  BB_TEST_CLOCK: bool.default('0'),
  LOG_LEVEL: z.enum(LOG_LEVELS, { error: `debe ser uno de: ${LOG_LEVELS.join(', ')}` }).default('info'),
  /** Detrás de un proxy (Vercel, Caddy) la IP real llega en `X-Forwarded-For`. */
  TRUST_PROXY: bool.default('0'),
})

export interface AppConfig {
  env: NodeEnv
  host: string
  port: number
  /** URL pública de la web, sin barra final. */
  publicUrl: string
  /** Orígenes (`esquema://host[:puerto]`) aceptados en escrituras; incluye el de `publicUrl`. */
  allowedOrigins: readonly string[]
  databaseUrl: string
  databaseAuthToken?: string
  /** Carpeta de migraciones forzada con `MIGRATIONS_DIR`; sin definir, la de por defecto. */
  migrationsDir?: string
  /** Activa la cabecera `x-bb-test-now`. Nunca en producción (lo impide `loadEnv`). */
  testClock: boolean
  logLevel: LogLevel
  trustProxy: boolean
}

export interface EnvIssue {
  variable: string
  message: string
}

/** Configuración no válida. El mensaje agrupa todos los problemas y nunca incluye valores. */
export class EnvError extends Error {
  readonly issues: readonly EnvIssue[]

  constructor(issues: readonly EnvIssue[]) {
    const lines = issues.map((i) => `  - ${i.variable}: ${i.message}`)
    super(
      `Configuración del servidor no válida (${issues.length} ${issues.length === 1 ? 'problema' : 'problemas'}):\n${lines.join('\n')}`,
    )
    this.name = 'EnvError'
    this.issues = issues
  }
}

/**
 * Guarda de §4.12: el reloj de prueba no puede existir en producción. La aplica `loadEnv` y, como
 * defensa en profundidad, también `registerClock` (`plugins/clock.ts`) con cualquier configuración.
 */
export const TEST_CLOCK_IN_PRODUCTION: EnvIssue = {
  variable: 'BB_TEST_CLOCK',
  message: 'no se puede activar con NODE_ENV=production (guía §4.12)',
}

const DEV_PUBLIC_URL = 'http://localhost:5173'
const truthy = (v: string) => v === '1' || v === 'true'

/** Normaliza un origen; devuelve `null` si no es `http(s)://host[:puerto]` sin ruta. */
function parseOrigin(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null
  return url.origin
}

/**
 * Valida el entorno y construye la configuración. Es pura: recibe la fuente (inyectable en tests) y
 * no lee `process.env` por su cuenta. Las variables vacías (`VAR=` en un `.env`) cuentan como
 * ausentes. Lanza `EnvError` con todos los problemas a la vez.
 */
export function loadEnv(source: Readonly<Record<string, string | undefined>>): AppConfig {
  const cleaned: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') cleaned[key] = value.trim()
  }

  const issues: EnvIssue[] = []
  const parsed = EnvSchema.safeParse(cleaned)
  if (!parsed.success)
    for (const issue of parsed.error.issues)
      issues.push({ variable: issue.path.join('.') || '(entorno)', message: issue.message })

  // Las comprobaciones cruzadas usan los valores crudos para informar de todo en un solo error.
  const production = cleaned.NODE_ENV === 'production'
  const testClock = truthy(cleaned.BB_TEST_CLOCK ?? '0')

  if (production && testClock) issues.push(TEST_CLOCK_IN_PRODUCTION)

  let publicUrl = DEV_PUBLIC_URL
  if (cleaned.BB_PUBLIC_URL === undefined) {
    if (production) issues.push({ variable: 'BB_PUBLIC_URL', message: 'es obligatoria en producción' })
  } else {
    const origin = parseOrigin(cleaned.BB_PUBLIC_URL.replace(/\/+$/, ''))
    if (!origin) issues.push({ variable: 'BB_PUBLIC_URL', message: 'debe ser una URL http(s) sin ruta' })
    else publicUrl = origin
  }

  const allowedOrigins = new Set<string>()
  for (const raw of (cleaned.ALLOWED_ORIGINS ?? (production ? '' : DEV_PUBLIC_URL)).split(',')) {
    const item = raw.trim()
    if (!item) continue
    const origin = parseOrigin(item)
    if (!origin) {
      issues.push({
        variable: 'ALLOWED_ORIGINS',
        message: 'cada elemento debe ser un origen http(s)://host[:puerto] sin ruta',
      })
      break
    }
    allowedOrigins.add(origin)
  }
  allowedOrigins.add(publicUrl)

  if (!parsed.success || issues.length > 0) throw new EnvError(issues)
  const e = parsed.data

  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    publicUrl,
    allowedOrigins: [...allowedOrigins],
    databaseUrl: e.DATABASE_URL,
    databaseAuthToken: e.DATABASE_AUTH_TOKEN,
    migrationsDir: e.MIGRATIONS_DIR,
    testClock,
    logLevel: e.LOG_LEVEL,
    trustProxy: truthy(e.TRUST_PROXY),
  }
}
