import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { ERROR_STATUS, type ErrorEnvelope } from '@beatbattle/shared'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app'
import { EnvError, loadEnv } from './config/env'
import { createDb } from './db/client'
import { runMigrations } from './db/migrate'
import { safeError } from './lib/logger'
import { API_SECURITY_HEADERS } from './plugins/security'

/**
 * Arranque de la API como función de Vercel (guía §4.15). `api/index.ts` solo conecta esto con
 * `process.env`; la lógica vive aquí para poder probarla.
 */

type EnvSource = Readonly<Record<string, string | undefined>>

/**
 * Carpeta de migraciones dentro de la función, relativa a su directorio de trabajo. En la función
 * empaquetada `import.meta.url` no apunta al repo: las migraciones van como ficheros incluidos
 * (`vercel.json` → `functions["api/index.ts"].includeFiles = "apps/server/drizzle/**"`). Se puede
 * forzar otra con `MIGRATIONS_DIR`.
 */
export const BUNDLED_MIGRATIONS_DIR = 'apps/server/drizzle'

const present = (value: string | undefined): value is string => value !== undefined && value.trim() !== ''

/**
 * Entorno efectivo de la función a partir de `process.env`:
 * - `NODE_ENV=production` siempre, también en las previews: así la guarda de §4.12 impide el reloj
 *   de prueba aunque alguien defina `BB_TEST_CLOCK`.
 * - `TRUST_PROXY=1` salvo que se diga otra cosa: detrás del proxy de Vercel la IP real llega en
 *   `X-Forwarded-For` (Vercel la reescribe, no se puede falsear).
 * - En las previews (`VERCEL_ENV=preview`) la URL cambia por rama y por despliegue: se permiten en
 *   escrituras `https://$VERCEL_BRANCH_URL` y `https://$VERCEL_URL` (además de `ALLOWED_ORIGINS`) y,
 *   si `BB_PUBLIC_URL` no está definida, se usa la de la rama. Necesita las variables de sistema de
 *   Vercel expuestas, que es la opción por defecto del proyecto.
 */
export function serverlessEnv(source: EnvSource): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...source,
    NODE_ENV: 'production',
    TRUST_PROXY: present(source.TRUST_PROXY) ? source.TRUST_PROXY : '1',
  }
  if (source.VERCEL_ENV === 'preview') {
    const previewOrigins = [source.VERCEL_BRANCH_URL, source.VERCEL_URL]
      .filter(present)
      .map((host) => `https://${host.trim()}`)
    env.ALLOWED_ORIGINS = [source.ALLOWED_ORIGINS, ...previewOrigins].filter(present).join(',')
    if (!present(source.BB_PUBLIC_URL) && previewOrigins[0]) env.BB_PUBLIC_URL = previewOrigins[0]
  }
  return env
}

export interface BootOptions {
  /** Directorio de trabajo de la función: `process.cwd()` (`/var/task` en Vercel). */
  cwd?: string
}

/**
 * Arranque de una instancia: entorno → BD → migraciones → app lista. `MIGRATIONS_DIR` pasa por
 * `loadEnv` como cualquier otra variable, así que vacía (`MIGRATIONS_DIR=`) cuenta como no definida.
 */
export async function bootServerless(source: EnvSource, options: BootOptions = {}): Promise<FastifyInstance> {
  const config = loadEnv(serverlessEnv(source))
  const cwd = options.cwd ?? process.cwd()
  const db = await createDb(config.databaseUrl, config.databaseAuthToken)
  try {
    await runMigrations(db, resolve(cwd, config.migrationsDir ?? BUNDLED_MIGRATIONS_DIR))
    const app = buildApp({ config, db })
    await app.ready()
    return app
  } catch (err) {
    // un arranque fallido no deja la conexión abierta: el siguiente intento abre otra
    db.$client.close()
    throw err
  }
}

export type NodeHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** 503 con el sobre de error y las cabeceras de la API, sin pasar por Fastify (no ha arrancado). */
function sendUnavailable(res: ServerResponse): void {
  const body: ErrorEnvelope = { error: { code: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible.' } }
  res.writeHead(ERROR_STATUS.SERVICE_UNAVAILABLE, {
    ...API_SECURITY_HEADERS,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}

/**
 * Handler de Node de la función. La app se monta una vez por instancia, en la primera petición, y
 * las que llegan mientras arranca esperan a ese mismo arranque. Si falla (Turso no responde, dos
 * arranques en frío migrando a la vez, configuración no válida), esas peticiones reciben 503
 * `SERVICE_UNAVAILABLE` con el sobre y la siguiente lo vuelve a intentar: la instancia no se queda
 * rota hasta que Vercel la recicle. Al cargar el módulo no se arranca nada, así que tampoco quedan
 * rechazos sin manejar.
 */
export function createServerlessHandler(boot: () => Promise<FastifyInstance>): NodeHandler {
  let ready: Promise<FastifyInstance> | null = null

  const init = (): Promise<FastifyInstance> => {
    if (!ready)
      ready = boot().catch((err: unknown) => {
        ready = null
        // una línea por arranque fallido: la configuración no válida se explica sin valores y
        // cualquier otro fallo va saneado (sin SQL ni parámetros)
        console.error('No se pudo arrancar la API:', err instanceof EnvError ? err.message : safeError(err))
        throw err
      })
    return ready
  }

  return async (req, res) => {
    let app: FastifyInstance
    try {
      app = await init()
    } catch {
      sendUnavailable(res)
      return
    }
    app.server.emit('request', req, res)
  }
}
