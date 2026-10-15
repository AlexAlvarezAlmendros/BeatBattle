/**
 * `pnpm --filter @beatbattle/server admin:grant <email>` (guía §2.14): da el rol `admin` a una cuenta que ya
 * existe (tiene que haber entrado al menos una vez). Para el primer admin de un entorno, que nadie puede dar
 * desde el panel. Lee la BD de `DATABASE_URL` (por defecto, la copia local de producción en
 * `.env.production`) y no aplica migraciones: la base ya tiene que estar creada por el servidor. Dice a qué
 * base va antes de escribir y nunca enseña el token.
 */
import { loadEnv } from '../config/env'
import { createDb } from '../db/client'
import { systemClock } from '../lib/clock'
import { uuidv7 } from '../lib/ids'
import { grantAdmin } from '../modules/admin/grant'

const email = process.argv[2]
if (!email?.includes('@')) {
  console.error('Uso: pnpm --filter @beatbattle/server admin:grant <email>')
  process.exit(1)
}
const config = loadEnv(process.env)
const target = config.databaseUrl.replace(/^(libsql|https?):\/\/([^/?]+).*$/, '$1://$2')
console.log(`Base de datos: ${target}`)
const db = await createDb(config.databaseUrl, config.databaseAuthToken)
const now = systemClock.now()
const result = await grantAdmin(db, { email, now, auditId: uuidv7(now) })
db.$client.close()
if (result.status === 'not-found') {
  console.error(`No hay ninguna cuenta con ${email}: entra una vez (con email, Google o Discord) y repite.`)
  process.exit(1)
}
console.log(
  result.status === 'granted'
    ? `Hecho: la cuenta ${result.userId} ya es admin (queda en audit_log). Vuelve a cargar /admin.`
    : `La cuenta ${result.userId} ya era admin.`,
)
