import { timingSafeEqual } from 'node:crypto'
import type { DataEnvelope } from '@beatbattle/shared'
import { lte } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client'
import { ipSignal, usernameRedirect } from '../../db/schema'
import { type DrainDeps, type DrainResult, emailDrain } from '../../email/outbox'
import { appError } from '../../lib/errors'
import { IP_SIGNAL_RETENTION_MS } from '../../lib/ipHash'
import { withLease } from '../../lib/lease'
import type { AlertsService } from '../alerts/service'
import { type EntriesTickResult, entriesTick } from '../entries/cleanup'
import type { EntriesService } from '../entries/service'
import { scheduleProgressEmails } from '../game/progress'
import { type ReprocessSummary, reprocessDone, reprocessGame } from '../game/reprocess'
import { type MondayResult, scheduleMondayEmails } from '../results/monday'
import { closeDueSeasons } from '../seasons/closing'
import type { EntryStorage } from '../storage/entries'
import { type NoticeResult, scheduleBattleNotices } from '../votes/notices'
import { type ScheduleDeps, scheduleGapAlerts } from '../weeks/schedule'
import { sealDueWeeks } from '../weeks/seal'
import type { WeeksService } from '../weeks/service'

/** Lo que puede durar un `tick` antes de que otro lo dé por perdido (la función tiene 10 s). */
const TICK_LEASE_MS = 5 * 60 * 1000

export interface TickResult {
  /**
   * El reprocesado de la capa de juego (tarea 7.16): solo con `BB_GAME_REPROCESS` y hasta que termina una vez;
   * `null` si no toca.
   */
  gameReprocess: ReprocessSummary | null
  sealed: string[]
  /** Temporadas que el `tick` ha dado por cerradas, con sus campeones (tarea 7.11, hueco G7). */
  closedSeasons: string[]
  /** Lunes de batalla: combinados, drops y resultados encolados (tarea 6.9). */
  mondayEmails: MondayResult
  /** Recordatorios y llamadas al jurado encolados (tarea 5.12). */
  battleNotices: NoticeResult
  /** Cuentas con progreso del día (`game.progress`, tarea 7.29), contadas cada vez que se mira el tramo. */
  progressEmails: number
  calendarGaps: string[]
  cleaned: { unconfirmedAlerts: number; usernameRedirects: number; ipSignals: number }
  /** Intents caducados, entradas en `processing` y huérfanos (tarea 4.9); `null` sin almacenamiento. */
  entries: EntriesTickResult | null
  drain: DrainResult | null
  /** Tareas que han fallado (las demás siguen). */
  errors: string[]
}

export interface CronDeps extends ScheduleDeps {
  db: Db
  cronSecret: string | null
  /** Paso opcional: reprocesar la capa de juego una vez (`BB_GAME_REPROCESS`, apagado por defecto). */
  gameReprocess?: boolean
  /** Firma de la tarjeta de resultado del Lunes de batalla. */
  cardSecret: string
  drain: DrainDeps
  weeks: WeeksService
  alerts: AlertsService
  entries: EntriesService
  entryStorage: EntryStorage | null
}

function bearerMatches(header: string | undefined, secret: string): boolean {
  const given = Buffer.from(header?.startsWith('Bearer ') ? header.slice(7) : '')
  const expected = Buffer.from(secret)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * `GET /api/cron/tick` (§4.12; tarea 3.12): lo llaman Vercel Cron (una vez al día) y el flujo programado
 * de GitHub Actions (cada 15 min) con `Authorization: Bearer <CRON_SECRET>`. Idempotente y con *lease*:
 * dos a la vez no se pisan (el segundo responde `skipped`). Cada tarea va aparte: si una falla, las demás
 * siguen y el fallo queda en `errors`.
 */
export function cronRoutes(app: FastifyInstance, deps: CronDeps): void {
  app.get('/api/cron/tick', async (req): Promise<DataEnvelope<TickResult | { skipped: true }>> => {
    if (!deps.cronSecret) throw appError('SERVICE_UNAVAILABLE', 'El cron no está configurado (CRON_SECRET).')
    if (!bearerMatches(req.headers.authorization, deps.cronSecret))
      throw appError('UNAUTHORIZED', 'Falta el secreto del cron.')
    const now = req.now
    const holder = deps.newId()
    const result = await withLease(deps.db, { name: 'tick', holder, ttlMs: TICK_LEASE_MS, now }, async () => {
      const out: TickResult = {
        gameReprocess: null,
        sealed: [],
        closedSeasons: [],
        mondayEmails: { monday: 0, drop: 0, results: 0 },
        battleNotices: { reminders: 0, juryCalls: 0 },
        progressEmails: 0,
        calendarGaps: [],
        cleaned: { unconfirmedAlerts: 0, usernameRedirects: 0, ipSignals: 0 },
        entries: null,
        drain: null,
        errors: [],
      }
      const step = async (name: string, run: () => Promise<void>) => {
        try {
          await run()
        } catch (error) {
          out.errors.push(name)
          req.log.error({ err: error, task: name }, 'tarea del tick fallida')
        }
      }
      // Antes de sellar: así lo que ya pasó (el campeón de una temporada que cierra el `tick`) lleva el instante de su
      // hecho y no el de ahora. Una sola vez; después, no hace nada aunque siga encendido.
      await step('gameReprocess', async () => {
        if (!deps.gameReprocess || (await reprocessDone(deps.db))) return
        out.gameReprocess = await reprocessGame({ db: deps.db, now, newId: deps.newId, apply: true })
      })
      await step('sealWeeks', async () => {
        out.sealed = await sealDueWeeks(deps.db, { now, holder })
        // Con todo sellado, las temporadas cuyo trimestre ha acabado (sin semana el último lunes, §2.9).
        out.closedSeasons = await closeDueSeasons(deps.db, { now, newId: deps.newId })
      })
      await step('emailSchedule', async () => {
        out.mondayEmails = await scheduleMondayEmails(deps, now)
        out.battleNotices = await scheduleBattleNotices(deps, now)
        out.progressEmails = await scheduleProgressEmails(deps, now)
      })
      await step('adminAlerts', async () => {
        out.calendarGaps = await scheduleGapAlerts({ ...deps, gapsWithin: deps.weeks.gapsWithin }, now)
      })
      await step('cleanup', async () => {
        out.cleaned.unconfirmedAlerts = await deps.alerts.purgeUnconfirmed(now)
        const redirects = await deps.db
          .delete(usernameRedirect)
          .where(lte(usernameRedirect.expiresAt, now))
          .returning({ old: usernameRedirect.old })
        out.cleaned.usernameRedirects = redirects.length
        const signals = await deps.db
          .delete(ipSignal)
          .where(lte(ipSignal.seenAt, now - IP_SIGNAL_RETENTION_MS))
          .returning({ userId: ipSignal.userId })
        out.cleaned.ipSignals = signals.length
      })
      await step('entries', async () => {
        if (!deps.entryStorage) return
        out.entries = await entriesTick(
          {
            db: deps.db,
            storage: deps.entryStorage,
            entries: deps.entries,
            newId: deps.newId,
            publicUrl: deps.publicUrl,
          },
          now,
        )
      })
      await step('emailDrain', async () => {
        out.drain = await emailDrain({ ...deps.drain, now: () => now })
      })
      return out
    })
    return { data: result ?? { skipped: true } }
  })
}
