import {
  canVote,
  fairSeed,
  juryQueue,
  listenThresholdMs,
  phaseOf,
  VOTES_PER_HOUR_LIMIT,
} from '@beatbattle/rules'
import type {
  EntryStats,
  JuryQueue,
  ListenQualify,
  ListenStart,
  MyVotes,
  ReportRequest,
  Ticker,
  TickerEvent,
  Vote,
} from '@beatbattle/shared'
import { and, asc, count, desc, eq, exists, gt, isNotNull, lte, ne, sql } from 'drizzle-orm'
import type { BatchStatement } from '../../db/batch'
import type { Db } from '../../db/client'
import { entry, ipSignal, listen, report, vote, week } from '../../db/schema'
import { appError } from '../../lib/errors'
import { ipHash } from '../../lib/ipHash'
import type { RateLimiter } from '../../lib/rateLimit'
import type { EntriesService } from '../entries/service'

/**
 * Escuchar y votar (guía §2.6, §2.7, §4.7.3, §4.11; tareas 5.4–5.8): el recibo de escucha, el voto, la
 * denuncia, las escuchas, las estadísticas del dueño, la cola del Modo Jurado y mis votos. Las reglas las
 * comprueba siempre el servidor; el cliente solo evita pedir lo que no se puede.
 */

const HOUR_MS = 60 * 60 * 1000
/** Escuchas contadas por IP y entrada en una hora (`RF-PLAY-07`): más es repetir en bucle. */
export const PLAYS_PER_IP_ENTRY_PER_HOUR = 3
/** Una sesión de escucha (`playId`) cuenta una vez; la clave dura un día. */
const PLAY_SESSION_TTL_MS = 24 * HOUR_MS
/** Entradas nuevas que da la crónica como mucho. */
export const TICKER_MAX_ENTRIES = 5
const DAY_MS = 24 * HOUR_MS
/** Denuncias por usuario y hora (además de una por entrada, `RF-VOTE-12`). */
export const REPORTS_PER_HOUR = 20

export interface VotesDeps {
  db: Db
  entries: EntriesService
  rateLimiter: RateLimiter
  newId: () => string
  /** Secreto del hash de las IP (§4.14). */
  ipSecret: string
}

type WeekRow = typeof week.$inferSelect
type EntryRow = typeof entry.$inferSelect

export function createVotesService(deps: VotesDeps) {
  const { db } = deps

  /** Una entrada activa de una semana ya empezada; si no, 404 (oculta, retirada o futura no existe). */
  async function activeEntry(id: string, now: number): Promise<{ row: EntryRow; w: WeekRow }> {
    const found = await deps.entries.withWeek(id)
    if (found.row.status !== 'active' || found.w.startsAt > now)
      throw appError('NOT_FOUND', 'No existe esa entrada.')
    return found
  }

  /** Lo común a escuchar para votar y votar: la fase lo permite y no es la propia. */
  function assertVotable(userId: string, row: EntryRow, w: WeekRow, now: number): void {
    if (!canVote(w, now)) throw appError('VOTING_CLOSED', 'Las votaciones de esta semana están cerradas.')
    if (row.userId === userId) throw appError('OWN_ENTRY', 'No puedes votar tu propia entrada.')
  }

  /** El recibo de escucha de un usuario para una entrada (uno por pareja: el primero que se abrió). */
  async function receiptOf(userId: string, entryId: string) {
    const [row] = await db
      .select()
      .from(listen)
      .where(and(eq(listen.userId, userId), eq(listen.entryId, entryId)))
      .orderBy(asc(listen.startedAt))
      .limit(1)
    return row
  }

  /** La semana en juego (empezada y con los votos abiertos), o la de `slug`. */
  async function weekFor(slug: string | undefined, now: number): Promise<WeekRow | undefined> {
    if (slug) {
      const [w] = await db.select().from(week).where(eq(week.slug, slug))
      return w && w.startsAt <= now ? w : undefined
    }
    const [w] = await db
      .select()
      .from(week)
      .where(and(lte(week.startsAt, now), gt(week.voteEndsAt, now)))
      .orderBy(desc(week.startsAt))
      .limit(1)
    return w
  }

  return {
    // ── 5.4: recibo de escucha ──────────────────────────────────────────────────────────────────

    /**
     * `POST /api/entries/:id/listen` (§4.7.3): apunta el inicio de la escucha. Hay un recibo por usuario y
     * entrada: volver a empezar no lo reinicia (el tiempo de reloj cuenta desde la primera vez).
     */
    async startListen(userId: string, entryId: string, now: number): Promise<ListenStart> {
      const { row, w } = await activeEntry(entryId, now)
      assertVotable(userId, row, w, now)
      const thresholdMs = listenThresholdMs(row.durationMs)
      const existing = await receiptOf(userId, entryId)
      if (existing) return { listenId: existing.id, thresholdMs, startedAt: existing.startedAt }
      const id = deps.newId()
      await db.insert(listen).values({ id, userId, entryId, startedAt: now })
      return { listenId: id, thresholdMs, startedAt: now }
    },

    /**
     * `POST /api/entries/:id/listen/qualify` (`RF-VOTE-04`): el cliente dice que ha escuchado el umbral; el
     * servidor comprueba que ha pasado ese tiempo de reloj desde el inicio. Si no, 409 con lo que falta.
     */
    async qualify(userId: string, entryId: string, listenId: string, now: number): Promise<ListenQualify> {
      const { row, w } = await activeEntry(entryId, now)
      assertVotable(userId, row, w, now)
      const [receipt] = await db
        .select()
        .from(listen)
        .where(and(eq(listen.id, listenId), eq(listen.userId, userId), eq(listen.entryId, entryId)))
      if (!receipt) throw appError('LISTEN_REQUIRED', 'Escucha el beat para poder votarlo.')
      if (receipt.qualifiedAt !== null) return { qualifiedAt: receipt.qualifiedAt }
      const remainingMs = receipt.startedAt + listenThresholdMs(row.durationMs) - now
      if (remainingMs > 0)
        throw appError('LISTEN_REQUIRED', 'Aún no has escuchado lo suficiente.', { details: { remainingMs } })
      await db.update(listen).set({ qualifiedAt: now }).where(eq(listen.id, receipt.id))
      return { qualifiedAt: now }
    },

    // ── 5.5: el voto ────────────────────────────────────────────────────────────────────────────

    /**
     * `PUT /api/entries/:id/vote` (§2.7, §4.11): estrellas enteras de 1 a 5 (`RF-VOTE-01`, en la ruta), una
     * por usuario y entrada y repetir actualiza (`RF-VOTE-02`), nunca la propia (`RF-VOTE-03`), con el recibo
     * cumplido (`RF-VOTE-04`), en `open` o `voting` (`RF-VOTE-05`) y 120 por hora (`RF-VOTE-11`). Las
     * comprobaciones dan el error que toca; el `INSERT … SELECT` condicionado las repite dentro del `batch`
     * para que una carrera (la semana que cierra, la entrada que se retira) no cuele un voto.
     */
    async vote(
      userId: string,
      entryId: string,
      stars: number,
      ip: string | null,
      now: number,
      extra: (info: {
        row: EntryRow
        w: WeekRow
        created: boolean
      }) => Promise<BatchStatement[]> = async () => [],
    ): Promise<Vote> {
      await deps.rateLimiter.enforce({
        key: `vote:user:${userId}`,
        limit: VOTES_PER_HOUR_LIMIT,
        windowMs: HOUR_MS,
        now,
      })
      const { row, w } = await activeEntry(entryId, now)
      assertVotable(userId, row, w, now)
      const receipt = await receiptOf(userId, entryId)
      if (receipt?.qualifiedAt == null) {
        const remainingMs = receipt
          ? Math.max(0, receipt.startedAt + listenThresholdMs(row.durationMs) - now)
          : listenThresholdMs(row.durationMs)
        throw appError('LISTEN_REQUIRED', 'Escucha el beat para poder votarlo.', { details: { remainingMs } })
      }
      const [previous] = await db
        .select({ createdAt: vote.createdAt })
        .from(vote)
        .where(and(eq(vote.userId, userId), eq(vote.entryId, entryId)))
      const guarded = db
        .insert(vote)
        .select(
          db
            .select({
              userId: sql<string>`${userId}`.as('user_id'),
              entryId: entry.id,
              weekId: entry.weekId,
              stars: sql<number>`${stars}`.as('stars'),
              voided: sql<boolean>`0`.as('voided'),
              voidedReason: sql<string | null>`null`.as('voided_reason'),
              createdAt: sql<number>`${now}`.as('created_at'),
              updatedAt: sql<number>`${now}`.as('updated_at'),
            })
            .from(entry)
            .innerJoin(week, eq(week.id, entry.weekId))
            .where(
              and(
                eq(entry.id, entryId),
                eq(entry.status, 'active'),
                ne(entry.userId, userId),
                lte(week.startsAt, now),
                gt(week.voteEndsAt, now),
                exists(
                  db
                    .select({ one: sql`1` })
                    .from(listen)
                    .where(
                      and(
                        eq(listen.userId, userId),
                        eq(listen.entryId, entryId),
                        isNotNull(listen.qualifiedAt),
                      ),
                    ),
                ),
              ),
            ),
        )
        .onConflictDoUpdate({
          target: [vote.userId, vote.entryId],
          set: { stars, updatedAt: now },
        })
        .returning({ entryId: vote.entryId })
      const signal = ipHash(ip, deps.ipSecret, now)
      const rest: BatchStatement[] = [
        ...(signal
          ? [
              db
                .insert(ipSignal)
                .values({ userId, ipHash: signal, seenAt: now })
                .onConflictDoUpdate({ target: [ipSignal.userId, ipSignal.ipHash], set: { seenAt: now } }),
            ]
          : []),
        ...(await extra({ row, w, created: !previous })),
      ]
      const [inserted] = await db.batch([guarded, ...rest])
      if (inserted.length === 0)
        throw appError('CONFLICT', 'No se ha podido guardar el voto. Vuelve a intentarlo.')
      return { entryId, stars, createdAt: previous?.createdAt ?? now, updatedAt: now }
    },

    /** `DELETE /api/entries/:id/vote` (`RF-VOTE-13`): quitar el voto hasta el cierre; la entrada vuelve a la cola. */
    async unvote(userId: string, entryId: string, now: number): Promise<void> {
      const { w } = await deps.entries.withWeek(entryId)
      if (!canVote(w, now)) throw appError('VOTING_CLOSED', 'Las votaciones de esta semana están cerradas.')
      await db.delete(vote).where(and(eq(vote.userId, userId), eq(vote.entryId, entryId)))
    },

    // ── 5.6: denunciar ──────────────────────────────────────────────────────────────────────────

    /** `POST /api/entries/:id/report` (`RF-VOTE-12`): una por usuario y entrada; va a la cola de la F10. */
    async report(
      userId: string,
      entryId: string,
      input: ReportRequest,
      now: number,
    ): Promise<{ id: string }> {
      await deps.rateLimiter.enforce({
        key: `report:user:${userId}`,
        limit: REPORTS_PER_HOUR,
        windowMs: HOUR_MS,
        now,
      })
      const { row } = await activeEntry(entryId, now)
      if (row.userId === userId) throw appError('OWN_ENTRY', 'No puedes denunciar tu propia entrada.')
      const id = deps.newId()
      const inserted = await db
        .insert(report)
        .values({
          id,
          reporterId: userId,
          entryId,
          reason: input.reason,
          details: input.details || null,
          status: 'open',
          createdAt: now,
        })
        .onConflictDoNothing({ target: [report.reporterId, report.entryId] })
        .returning({ id: report.id })
      if (inserted.length === 0) throw appError('REPORT_EXISTS', 'Ya has denunciado esta entrada.')
      return { id }
    },

    // ── 5.7: escuchas y estadísticas del dueño ──────────────────────────────────────────────────

    /**
     * `POST /api/entries/:id/play` (`RF-PLAY-07`): ≥ 10 s seguidos, una vez por sesión de escucha
     * (`playId`) y como mucho `PLAYS_PER_IP_ENTRY_PER_HOUR` por IP y entrada. Es estadística, no un recibo
     * de voto: lo que no cuenta se ignora sin error. Devuelve si ha contado.
     */
    async play(entryId: string, playId: string, ip: string | null, now: number): Promise<boolean> {
      await activeEntry(entryId, now)
      const session = await deps.rateLimiter.check({
        key: `play:session:${playId}`,
        limit: 1,
        windowMs: PLAY_SESSION_TTL_MS,
        now,
      })
      if (!session.allowed) return false
      const signal = ipHash(ip, deps.ipSecret, now) ?? 'sin-ip'
      const perIp = await deps.rateLimiter.check({
        key: `play:ip:${signal}:${entryId}`,
        limit: PLAYS_PER_IP_ENTRY_PER_HOUR,
        windowMs: HOUR_MS,
        now,
      })
      if (!perIp.allowed) return false
      await db
        .update(entry)
        .set({ playCount: sql`${entry.playCount} + 1` })
        .where(eq(entry.id, entryId))
      return true
    },

    /** `GET /api/entries/:id/stats` (§2.7): al dueño, cuántos votos y escuchas lleva; nunca la media. */
    async stats(userId: string, entryId: string): Promise<EntryStats> {
      const { row } = await deps.entries.withWeek(entryId)
      if (row.userId !== userId || row.status === 'withdrawn')
        throw appError('NOT_FOUND', 'No existe esa entrada.')
      const [votes] = await db
        .select({ n: count() })
        .from(vote)
        .where(and(eq(vote.entryId, entryId), eq(vote.voided, false)))
      return { votes: votes?.n ?? 0, plays: row.playCount }
    },

    // ── 5.8: cola del Modo Jurado y mis votos ───────────────────────────────────────────────────

    /**
     * `GET /api/jury/queue?week=` (`RF-VOTE-09`): las activas, ajenas y sin votar de la semana en juego, en
     * Ronda justa; y la ronda: cuántas puede puntuar en total y cuántas ha puntuado. Fuera de `open` y
     * `voting`, la cola está vacía.
     */
    async juryQueue(userId: string, slug: string | undefined, now: number): Promise<JuryQueue> {
      const w = await weekFor(slug, now)
      if (!w) throw appError('NOT_FOUND', 'No hay semana en juego.')
      const rows = await db
        .select()
        .from(entry)
        .where(and(eq(entry.weekId, w.id), eq(entry.status, 'active')))
      const others = rows.filter((row) => row.userId !== userId)
      const counts = await db
        .select({ entryId: vote.entryId, n: count() })
        .from(vote)
        .where(and(eq(vote.weekId, w.id), eq(vote.voided, false)))
        .groupBy(vote.entryId)
      const mine = await db
        .select({ entryId: vote.entryId })
        .from(vote)
        .where(and(eq(vote.weekId, w.id), eq(vote.userId, userId)))
      const voted = new Set(mine.map((v) => v.entryId))
      const queue = canVote(w, now)
        ? juryQueue(others, new Map(counts.map((c) => [c.entryId, c.n])), voted, fairSeed(w.id, { userId }))
        : []
      return {
        weekSlug: w.slug,
        round: { done: others.filter((row) => voted.has(row.id)).length, total: others.length },
        queue: await deps.entries.presentAll(queue, w),
      }
    },

    // ── 5.9: la crónica de la arena ─────────────────────────────────────────────────────────────

    /**
     * `GET /api/weeks/:slug/ticker?since=` (§3.8.3): las últimas entradas por su alias (nunca quién las ha
     * subido), los días que quedan hasta el cierre de la fase y los votos de **toda** la semana. Ninguna
     * cifra de una entrada concreta (`RF-PLAY-05`).
     */
    async ticker(slug: string, since: number | undefined, now: number): Promise<Ticker> {
      const w = await weekFor(slug, now)
      if (!w) throw appError('NOT_FOUND', 'No existe esa semana.')
      const recent = await db
        .select({ id: entry.id, alias: entry.alias, at: entry.submittedAt })
        .from(entry)
        .where(
          and(
            eq(entry.weekId, w.id),
            eq(entry.status, 'active'),
            ...(since === undefined ? [] : [gt(entry.submittedAt, since)]),
          ),
        )
        .orderBy(desc(entry.submittedAt))
        .limit(TICKER_MAX_ENTRIES)
      const [votes] = await db
        .select({ n: count() })
        .from(vote)
        .where(and(eq(vote.weekId, w.id), eq(vote.voided, false)))
      const phase = phaseOf(w, now)
      const events: TickerEvent[] = recent.map((item) => ({ kind: 'entry', ...item }))
      if (phase === 'open' || phase === 'voting') {
        const end = phase === 'open' ? w.submitEndsAt : w.voteEndsAt
        events.push({
          kind: 'closing',
          phase: phase === 'open' ? 'submit' : 'vote',
          days: Math.floor((end - now) / DAY_MS),
        })
      }
      events.push({ kind: 'votes', count: votes?.n ?? 0 })
      return { weekSlug: w.slug, now, events }
    },

    /** `GET /api/me/votes?week=`: mis votos de la semana (la mía, sin medias de nadie). */
    async myVotes(userId: string, slug: string | undefined, now: number): Promise<MyVotes> {
      const w = await weekFor(slug, now)
      if (!w) throw appError('NOT_FOUND', 'No hay semana en juego.')
      const rows = await db
        .select({
          entryId: vote.entryId,
          stars: vote.stars,
          createdAt: vote.createdAt,
          updatedAt: vote.updatedAt,
        })
        .from(vote)
        .where(and(eq(vote.weekId, w.id), eq(vote.userId, userId)))
        .orderBy(asc(vote.createdAt))
      return { weekSlug: w.slug, votes: rows }
    },
  }
}

export type VotesService = ReturnType<typeof createVotesService>
