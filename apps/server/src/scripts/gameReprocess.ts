/**
 * `pnpm --filter @beatbattle/server game:reprocess [-- --apply [--remote]]` (guía §2.10, §4.11; tarea 7.16): reparte el
 * XP y los logros de lo que ya pasó (descargas, entradas, votos, semanas selladas y temporadas cerradas) a las cuentas
 * que jugaron antes de que existiera la capa de juego. Idempotente: repetirlo, o lanzarlo sobre una base en la que los
 * ganchos en vivo ya escribieron, no cambia nada (`RF-GAME-01`).
 *
 * - Sin `--apply`, solo dice lo que haría (no sella, no guarda el corte, no escribe).
 * - Lee la BD de `DATABASE_URL` (el `.env` local). Contra una base remota (`libsql://`, `https://`) exige además
 *   `--remote`: **producción, solo con la confirmación del usuario** y como dice `docs/deploy/beta.md`.
 * - No aplica migraciones: la base ya tiene que tener la `0008_capa_de_juego` (la aplica el servidor al arrancar).
 *
 * Dice a qué base va antes de nada y nunca enseña el token.
 */
import { achievementById, isAchievementId } from '@beatbattle/rules'
import { loadEnv } from '../config/env'
import { createDb } from '../db/client'
import { systemClock } from '../lib/clock'
import { createUuidV7 } from '../lib/ids'
import { reprocessGame } from '../modules/game/reprocess'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const config = loadEnv(process.env)
const remote = /^(libsql|https?|wss?):\/\//.test(config.databaseUrl)
const target = config.databaseUrl.replace(/^(libsql|https?|wss?):\/\/([^/?]+).*$/, '$1://$2')
console.log(`Base de datos: ${target}${remote ? ' (remota)' : ''}`)
if (apply && remote && !args.has('--remote')) {
  console.error(
    'Es una base remota: añade --remote para escribir en ella. Producción, solo con la confirmación del usuario ' +
      '(docs/deploy/beta.md, «La capa de juego»).',
  )
  process.exit(1)
}

const db = await createDb(config.databaseUrl, config.databaseAuthToken)
const now = systemClock.now()
const ids = createUuidV7()
const summary = await reprocessGame({ db, now, newId: () => ids(now), apply })
db.$client.close()
if (!summary) {
  console.error('Otro reprocesado está en marcha (lease gameReprocess): prueba dentro de unos minutos.')
  process.exit(1)
}

const iso = (ms: number) => new Date(ms).toISOString()
console.log(apply ? 'Reprocesado aplicado.' : 'Simulación (sin --apply no se escribe nada).')
console.log(
  `Corte: ${iso(summary.cutoff)} (lo anterior es del reprocesado; lo de después, de los ganchos en vivo)`,
)
if (summary.sealed.length > 0) console.log(`Selladas antes: ${summary.sealed.join(', ')}`)
console.log(`Cuentas con algo nuevo: ${summary.accounts} · XP: +${summary.xp} · rachas: ${summary.streaks}`)
for (const [kind, n] of Object.entries(summary.movements)) console.log(`  movimientos ${kind}: ${n}`)
for (const [id, n] of Object.entries(summary.achievements))
  console.log(`  logro ${id} (${isAchievementId(id) ? achievementById(id).rarity : '?'}): ${n}`)
if (summary.accounts === 0 && summary.streaks === 0) console.log('Nada que añadir: el libro ya está al día.')
