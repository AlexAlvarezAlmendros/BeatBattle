import { buildApp } from './app'
import { EnvError, loadEnv } from './config/env'
import { createDb } from './db/client'

/** Arranque local y autoalojado: entorno → BD → app → escucha. En Vercel arranca `api/index.ts`. */
async function main(): Promise<void> {
  const config = loadEnv(process.env)
  const db = await createDb(config.databaseUrl, config.databaseAuthToken)
  const app = buildApp({ config, db })
  // cierre ordenado (Ctrl+C, `tsx watch`, Docker): termina las peticiones en curso y suelta la BD
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      app
        .close()
        .then(() => db.$client.close())
        .finally(() => process.exit(0))
    })
  await app.listen({ port: config.port, host: config.host })
}

main().catch((err: unknown) => {
  // la configuración no válida se explica sin pila; cualquier otro fallo de arranque, con ella
  console.error(err instanceof EnvError ? err.message : err)
  process.exit(1)
})
