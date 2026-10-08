/**
 * `pnpm --filter @beatbattle/server bounces`: pasa `bounceScan` una vez contra el buzón del Workspace
 * (§4.19.2). Hasta que llegue el `tick` con *lease* (Fase 3), se lanza a mano. Necesita GMAIL_USER y
 * GMAIL_APP_PASSWORD en el entorno.
 */
import { loadEnv } from '../config/env'
import { createDb } from '../db/client'
import { runMigrations } from '../db/migrate'
import { bounceScan, openGoogleBounceMailbox } from '../email/bounces'
import { systemClock } from '../lib/clock'

const config = loadEnv(process.env)
if (!config.mail.workspace) {
  console.error('Faltan GMAIL_USER y GMAIL_APP_PASSWORD: bounceScan lee el buzón del Workspace.')
  process.exit(1)
}
const db = await createDb(config.databaseUrl, config.databaseAuthToken)
await runMigrations(db, config.migrationsDir)
const mailbox = await openGoogleBounceMailbox(config.mail.workspace)
try {
  console.log(await bounceScan({ db, mailbox, now: systemClock.now() }))
} finally {
  await mailbox.close()
}
