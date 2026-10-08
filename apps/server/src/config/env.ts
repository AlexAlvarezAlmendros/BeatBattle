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
  /** Cloudinary (§4.8): las tres juntas o ninguna (sin ellas no hay almacenamiento de audio). */
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  /** Prefijo de carpetas por entorno (`RF-STO-06`): `beatbattle` solo en producción. */
  BB_CLOUDINARY_PREFIX: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, { error: 'solo minúsculas, números y guiones' })
    .default('beatbattle-dev'),
  /** Entorno de Vercel (`production`, `preview`, `development`): las previews también van con NODE_ENV=production. */
  VERCEL_ENV: z.string().optional(),
  /** Email (§4.19.1): Mailpit en local (`smtp://127.0.0.1:1025`); nunca en producción ni en preview. */
  SMTP_URL: z.string().optional(),
  /** Dirección del Google Workspace de `otherpeople.es` y su contraseña de aplicación: las dos o ninguna. */
  GMAIL_USER: z.email({ error: 'debe ser una dirección de email' }).optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  EMAIL_FROM_NAME: z.string().default('Beat Battle · Other People'),
  /** Sin exigir dominio con punto: en local vale `beatbattle@localhost`. */
  EMAIL_FROM_ADDRESS: z
    .string()
    .regex(/^[^@\s]+@[^@\s]+$/, { error: 'debe ser una dirección de email' })
    .optional(),
  MAIL_REPLY_TO: z.email({ error: 'debe ser una dirección de email' }).optional(),
  /** Cupo en ventana móvil de 24 h (§4.19.1): 1.900 con el Workspace. */
  MAIL_DAILY_LIMIT: z.coerce
    .number({ error: 'debe ser un número' })
    .int({ error: 'debe ser un entero' })
    .min(1, { error: 'debe ser al menos 1' })
    .default(1900),
  /** Clave HMAC de los enlaces de baja (§4.19.6). */
  UNSUBSCRIBE_SECRET: z.string().min(32, { error: 'debe tener al menos 32 caracteres' }).optional(),
  /** Preview: los únicos destinatarios permitidos (direcciones o `@dominio`, separados por comas). */
  MAIL_PREVIEW_ALLOWLIST: z.string().optional(),
  /** Secreto de Better Auth (§4.9): firma sesiones y tokens. Obligatorio en producción. */
  BETTER_AUTH_SECRET: z.string().min(32, { error: 'debe tener al menos 32 caracteres' }).optional(),
  /** OAuth (§4.9, `RF-AUTH-05`): cada proveedor, con su id y su secreto juntos o sin ninguno. */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
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
  /** Cloudinary (§4.8.1); `null` sin credenciales (hasta que el entorno las tenga). */
  storage: StorageConfig | null
  /** Email (§4.19.1). */
  mail: MailConfig
  /** Cuentas (§4.9). */
  auth: AuthConfig
}

export interface OAuthClient {
  clientId: string
  clientSecret: string
}

export interface AuthConfig {
  secret: string
  /** Cookies `__Secure-` (solo HTTPS): en producción y preview. */
  secureCookies: boolean
  google: OAuthClient | null
  discord: OAuthClient | null
}

/** Secreto de Better Auth de desarrollo y tests: nunca vale en producción (`loadEnv` exige otro). */
export const DEV_AUTH_SECRET = 'beatbattle-dev-auth-secret-no-usar-en-produccion'

/**
 * Transporte de email: `memory` en los tests, `workspace` con las credenciales del Workspace, `smtp`
 * (Mailpit) en local y `null` sin nada configurado (los emails se quedan en la cola, en `queued`).
 */
export type MailTransport = 'workspace' | 'smtp' | 'memory' | null

export interface MailConfig {
  transport: MailTransport
  smtpUrl?: string
  workspace?: { user: string; pass: string }
  sender: { name: string; address: string; replyTo?: string }
  dailyLimit: number
  /** Clave de los tokens de baja; fuera de producción, una fija de desarrollo si no hay. */
  unsubscribeSecret: string
  /** Solo en la preview: destinatarios permitidos. `null` fuera de ella. */
  previewAllowlist: readonly string[] | null
}

/** Clave de baja de desarrollo y tests: nunca vale en producción (`loadEnv` la exige allí). */
export const DEV_UNSUBSCRIBE_SECRET = 'beatbattle-dev-unsubscribe-secret-no-usar-en-produccion'

export interface StorageConfig {
  cloudName: string
  apiKey: string
  apiSecret: string
  /** `beatbattle` en producción; `beatbattle-dev` o `beatbattle-preview-<pr>` fuera (`RF-STO-06`). */
  prefix: string
}

/** El prefijo de producción: solo lo puede usar producción de verdad (`RF-STO-06`). */
export const PRODUCTION_PREFIX = 'beatbattle'

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

  // RF-STO-06: el prefijo de producción, solo en producción de verdad (en Vercel, también VERCEL_ENV).
  const realProduction =
    production && (cleaned.VERCEL_ENV === undefined || cleaned.VERCEL_ENV === 'production')
  if ((cleaned.BB_CLOUDINARY_PREFIX ?? 'beatbattle-dev') === PRODUCTION_PREFIX && !realProduction)
    issues.push({
      variable: 'BB_CLOUDINARY_PREFIX',
      message:
        '«beatbattle» es el prefijo de producción: fuera de ella, beatbattle-dev o beatbattle-preview-<pr> (RF-STO-06)',
    })
  const cloudinaryKeys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const
  const present = cloudinaryKeys.filter((key) => cleaned[key] !== undefined)
  if (present.length > 0 && present.length < cloudinaryKeys.length)
    for (const key of cloudinaryKeys.filter((k) => cleaned[k] === undefined))
      issues.push({ variable: key, message: 'las tres credenciales de Cloudinary van juntas' })

  // Email (§4.19.1).
  const preview = production && cleaned.VERCEL_ENV === 'preview'
  if ((cleaned.GMAIL_USER === undefined) !== (cleaned.GMAIL_APP_PASSWORD === undefined))
    for (const key of ['GMAIL_USER', 'GMAIL_APP_PASSWORD'] as const)
      if (cleaned[key] === undefined)
        issues.push({ variable: key, message: 'la dirección y la contraseña de aplicación van juntas' })
  if (production && cleaned.SMTP_URL !== undefined)
    issues.push({
      variable: 'SMTP_URL',
      message: 'solo en local (Mailpit): en producción y preview, el Workspace',
    })
  if (
    production &&
    cleaned.GMAIL_USER !== undefined &&
    cleaned.EMAIL_FROM_ADDRESS !== undefined &&
    cleaned.EMAIL_FROM_ADDRESS.toLowerCase() !== cleaned.GMAIL_USER.toLowerCase()
  )
    issues.push({
      variable: 'EMAIL_FROM_ADDRESS',
      message: 'debe ser la propia dirección del Workspace (remitente coherente con la cuenta, §4.19.1)',
    })
  if (production && cleaned.GMAIL_USER !== undefined && cleaned.UNSUBSCRIBE_SECRET === undefined)
    issues.push({
      variable: 'UNSUBSCRIBE_SECRET',
      message: 'es obligatoria para enviar emails en producción',
    })
  if (preview && cleaned.GMAIL_USER !== undefined && cleaned.MAIL_PREVIEW_ALLOWLIST === undefined)
    issues.push({
      variable: 'MAIL_PREVIEW_ALLOWLIST',
      message: 'la preview solo envía a una lista blanca: es obligatoria con el Workspace (§4.19.1)',
    })

  // Cuentas (§4.9).
  if (production && cleaned.BETTER_AUTH_SECRET === undefined)
    issues.push({ variable: 'BETTER_AUTH_SECRET', message: 'es obligatoria en producción' })
  for (const provider of ['GOOGLE', 'DISCORD'] as const) {
    const id = `${provider}_CLIENT_ID` as const
    const secret = `${provider}_CLIENT_SECRET` as const
    if ((cleaned[id] === undefined) !== (cleaned[secret] === undefined))
      issues.push({
        variable: cleaned[id] === undefined ? id : secret,
        message: 'el id y el secreto van juntos',
      })
  }

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
    storage:
      e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET
        ? {
            cloudName: e.CLOUDINARY_CLOUD_NAME,
            apiKey: e.CLOUDINARY_API_KEY,
            apiSecret: e.CLOUDINARY_API_SECRET,
            prefix: e.BB_CLOUDINARY_PREFIX,
          }
        : null,
    auth: {
      secret: e.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET,
      secureCookies: production,
      google:
        e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
          ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET }
          : null,
      discord:
        e.DISCORD_CLIENT_ID && e.DISCORD_CLIENT_SECRET
          ? { clientId: e.DISCORD_CLIENT_ID, clientSecret: e.DISCORD_CLIENT_SECRET }
          : null,
    },
    mail: {
      transport:
        e.NODE_ENV === 'test'
          ? 'memory'
          : e.GMAIL_USER && e.GMAIL_APP_PASSWORD
            ? 'workspace'
            : e.SMTP_URL
              ? 'smtp'
              : null,
      smtpUrl: e.SMTP_URL,
      workspace:
        e.GMAIL_USER && e.GMAIL_APP_PASSWORD ? { user: e.GMAIL_USER, pass: e.GMAIL_APP_PASSWORD } : undefined,
      sender: {
        name: e.EMAIL_FROM_NAME,
        address: e.EMAIL_FROM_ADDRESS ?? e.GMAIL_USER ?? 'beatbattle@localhost',
        replyTo: e.MAIL_REPLY_TO,
      },
      dailyLimit: e.MAIL_DAILY_LIMIT,
      unsubscribeSecret: e.UNSUBSCRIBE_SECRET ?? DEV_UNSUBSCRIBE_SECRET,
      previewAllowlist: preview
        ? (e.MAIL_PREVIEW_ALLOWLIST ?? '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : null,
    },
  }
}
