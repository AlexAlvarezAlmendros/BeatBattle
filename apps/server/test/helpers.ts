import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { type AppConfig, type LogLevel, loadEnv } from '../src/config/env'
import type { Db } from '../src/db/client'
import { createTestDb } from '../src/db/testDb'
import { type FixedClock, fixedClock } from '../src/lib/clock'

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
}

export async function makeApp(options: MakeAppOptions = {}): Promise<TestApp> {
  const logs: string[] = []
  const config = testConfig({ ...options.config, logLevel: options.logLevel ?? 'silent' })
  const db = options.db ?? (await createTestDb())
  const clock = fixedClock(T0)
  const app = buildApp({ config, db, clock, logStream: { write: (line) => logs.push(line) } })
  options.routes?.(app)
  await app.ready()
  return { app, db, clock, config, logs }
}
