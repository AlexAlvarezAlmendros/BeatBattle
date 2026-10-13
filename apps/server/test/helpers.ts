import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { type AppConfig, type LogLevel, loadEnv } from '../src/config/env'
import type { Db } from '../src/db/client'
import { createTestDb } from '../src/db/testDb'
import type { MemoryMailer } from '../src/email/mailer'
import { type FixedClock, fixedClock } from '../src/lib/clock'
import type { AudioMeasurement } from '../src/media/measure'
import type { ImageStorage } from '../src/modules/storage/cloudinary'
import type { SampleStorage } from '../src/modules/storage/samples'

/** Origen permitido por defecto en tests (el de Vite en local). */
export const ORIGIN = 'http://localhost:5173'
/** Lunes 5 de octubre de 2026, 10:00 UTC. */
export const T0 = Date.UTC(2026, 9, 5, 10, 0, 0)

/**
 * Configuración de tests: BD en memoria y registro silencioso. Vive aquí y no en `src/`: el código de
 * producción solo obtiene su configuración de `loadEnv`. Los `overrides` pueden fabricar
 * combinaciones que `loadEnv` rechaza (p. ej. producción con el reloj de prueba); para eso está la
 * segunda guarda de `registerClock`.
 */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadEnv({ NODE_ENV: 'test', DATABASE_URL: ':memory:', LOG_LEVEL: 'silent' }),
    ...overrides,
  }
}

export interface TestApp {
  app: FastifyInstance
  db: Db
  clock: FixedClock
  config: AppConfig
  /** Líneas JSON del registro (solo si se pidió `logLevel`). */
  logs: string[]
}

export interface MakeAppOptions {
  config?: Partial<AppConfig>
  /** Nivel del registro capturado en `logs` (por defecto, silencio). */
  logLevel?: LogLevel
  /** Rutas extra de prueba, registradas antes de `ready()`. */
  routes?: (app: FastifyInstance) => void
  db?: Db
  /** Imágenes falsas (avatares); por defecto, ninguna. */
  images?: ImageStorage | null
  /** Samples (almacenamiento falso en disco); por defecto, ninguno. */
  samples?: SampleStorage | null
  /** Medición del audio (por defecto, ffmpeg de verdad). */
  measure?: (source: ReadableStream<Uint8Array>) => Promise<AudioMeasurement>
  /** Presupuesto de la medición de una entrada antes de dejarla en `processing`. */
  measureBudgetMs?: number
}

export async function makeApp(options: MakeAppOptions = {}): Promise<TestApp> {
  const logs: string[] = []
  const config = testConfig({ ...options.config, logLevel: options.logLevel ?? 'silent' })
  const db = options.db ?? (await createTestDb())
  const clock = fixedClock(T0)
  const app = buildApp({
    config,
    db,
    clock,
    images: options.images ?? null,
    samples: options.samples ?? null,
    measure: options.measure,
    measureBudgetMs: options.measureBudgetMs,
    logStream: { write: (line) => logs.push(line) },
  })
  options.routes?.(app)
  await app.ready()
  return { app, db, clock, config, logs }
}

/** Contraseña de las cuentas de prueba (14 caracteres, fuera de cualquier filtración simulada). */
export const TEST_PASSWORD = 'lluvia en gràcia 92'

/**
 * Crea una cuenta y la verifica con el enlace del email (el `Mailer` en memoria), como un usuario real.
 * Devuelve su id y la cookie de sesión. `verify: false` deja la cuenta sin verificar y entra igualmente
 * creando la sesión a mano (para probar `EMAIL_NOT_VERIFIED`).
 */
export async function createAccount(
  t: TestApp,
  {
    email,
    username,
    verify = true,
    ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
  }: { email: string; username: string; verify?: boolean; ip?: string },
): Promise<{ id: string; cookie: string }> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: ORIGIN },
    remoteAddress: ip,
    payload: { email, password: TEST_PASSWORD, name: username, username, callbackURL: '/verificar' },
  })
  if (res.statusCode !== 200) throw new Error(`registro: ${res.statusCode} ${res.body}`)
  const { user } = res.json() as { user: { id: string } }
  if (!verify) {
    const session = await t.app.auth.api
      .signInUsername({ body: { username, password: TEST_PASSWORD } })
      .catch(() => null)
    if (session) throw new Error('una cuenta sin verificar no debería poder entrar')
    const ctx = await t.app.auth.$context
    const created = await ctx.internalAdapter.createSession(user.id)
    const token = created.token
    const signed = await signCookie(token, t.config.auth.secret)
    return { id: user.id, cookie: `bb.session_token=${signed}` }
  }
  const mailer = t.app.email.mailer as MemoryMailer
  const link = mailer.lastTo(email)?.text.match(/https?:\/\/\S+verify-email\?\S+/)?.[0]
  if (!link) throw new Error('no llegó el email de verificación')
  const url = new URL(link)
  const verified = await t.app.inject({ method: 'GET', url: url.pathname + url.search })
  const cookie = String(verified.headers['set-cookie'] ?? '').match(/bb\.session_token=[^;]+/)?.[0]
  if (!cookie) throw new Error('la verificación no dio sesión')
  return { id: user.id, cookie }
}

/** Firma una cookie como Better Auth (HMAC-SHA256 en base64, `valor.firma`). */
async function signCookie(value: string, secret: string): Promise<string> {
  const { createHmac } = await import('node:crypto')
  const signature = createHmac('sha256', secret).update(value).digest('base64')
  return encodeURIComponent(`${value}.${signature}`)
}
