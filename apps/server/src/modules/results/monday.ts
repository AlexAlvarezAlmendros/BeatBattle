import { localDateOf, zonedInstant } from '@beatbattle/rules'
import { and, desc, eq, gt, inArray, isNull, lte } from 'drizzle-orm'
import { type BatchStatement, runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { emailPref, emailSubscriber, entry, result, sample, user, vote, week } from '../../db/schema'
import { enqueueEmail } from '../../email/outbox'
import { scoreText } from '../../media/ogKit'
import { sealedWeekGame } from '../game/notices'
import type { SampleStorage } from '../storage/samples'
import { DROP_EMAIL_AT, dropMailAt, dropPayload, liveWeek } from '../weeks/schedule'
import { resultCardUrl } from './cardRoute'

/**
 * El **Lunes de batalla** (§2.12.2, `RF-NOTIF-07`; tarea 6.9). Cada `tick` desde las 08:00 del lunes reparte,
 * por destinatario, lo que le toca de la semana que acaba de sellarse y de la que abre:
 *
 * - **Combinado** (por defecto): `battle.monday`, con el resultado personal (o el podio) arriba y el drop
 *   abajo. Si a las 08:00 la semana anterior sigue sin sellar, espera hasta 2 h; si sigue sin sellar,
 *   sale solo `battle.drop` y los resultados llegan después, en `battle.results`, al sellar.
 * - **Separado** (Ajustes → Emails): `battle.drop` a las 08:00 y `battle.results` a las 08:00 o al sellar.
 * - `battle.results` es para quien participó o votó esa semana; el combinado, para todas las cuentas
 *   verificadas y los suscriptores sin cuenta (estos, sin la parte personal, §2.12.3).
 *
 * Debajo del resultado o del podio, «tu partida» (§2.12.7; tarea 7.31): el XP que el sellado de esa semana le ha dado,
 * el oído de oro y la racha; solo de la semana sellada y nunca a los suscriptores.
 *
 * Que el combinado salga o no se decide con `sealed_at`, que no cambia: un destinatario recibe el combinado
 * o el par drop + resultados, nunca los dos. Las claves de idempotencia son por destinatario y semana, así
 * que repetir el `tick` no duplica (`RF-NOTIF-02`). Nada de la semana sale antes de su sellado (`RF-NOTIF-13`).
 *
 * Prioridad de envío dentro del cupo diario (§2.12.2): participantes, jurados, resto de cuentas y suscriptores;
 * lo que no quepa sale al día siguiente.
 */

/** Lo que espera el combinado al sellado antes de salir sin resultados (§2.12.2). */
export const RESULTS_WAIT_MS = 2 * 60 * 60 * 1000
/** Pasada una semana del cierre, ya no se reparten sus resultados por email. */
const RESULTS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const ENQUEUE_CHUNK = 200

/** Prioridad de cada grupo (la del catálogo para los avisos del lunes es 10). */
const PRIORITY = { participant: 10, juror: 11, account: 12, subscriber: 13 } as const

export interface MondayDeps {
  db: Db
  storage: SampleStorage | null
  publicUrl: string
  newId: () => string
  /** Firma de la tarjeta de resultado (§4.19.5). */
  cardSecret: string
}

export interface MondayResult {
  monday: number
  drop: number
  results: number
}

type WeekRow = typeof week.$inferSelect

/** La semana cerrada más reciente, si cerró hace menos de una semana. */
async function closedWeek(db: Db, now: number) {
  const [row] = await db
    .select({ week, sampleTitle: sample.title })
    .from(week)
    .innerJoin(sample, eq(sample.id, week.sampleId))
    .where(and(lte(week.voteEndsAt, now), gt(week.voteEndsAt, now - RESULTS_WINDOW_MS)))
    .orderBy(desc(week.voteEndsAt))
    .limit(1)
  return row ?? null
}

/** El día en Madrid de un instante, como texto comparable. */
function localDateKey(ms: number): string {
  const { year, month, day } = localDateOf(ms)
  return `${year}-${month}-${day}`
}

/** Las 08:00 del día en que cierra la votación (el lunes, en Madrid). */
const resultsMailAt = (w: WeekRow) => zonedInstant(localDateOf(w.voteEndsAt), DROP_EMAIL_AT)

/** El snapshot vigente, el podio y quién votó: lo que hace falta para los resultados de cada destinatario. */
async function resultsOf(db: Db, w: WeekRow) {
  const rows = await db
    .select({ result, entryTitle: entry.title, userId: entry.userId })
    .from(result)
    .innerJoin(entry, eq(entry.id, result.entryId))
    .where(and(eq(result.weekId, w.id), eq(result.revision, w.resultRevision)))
  const podiumRows = rows
    .filter((row) => row.result.position !== null && row.result.position <= 3)
    .sort((a, b) => (a.result.position ?? 0) - (b.result.position ?? 0))
  const people = podiumRows.length
    ? await db
        .select({
          id: user.id,
          username: user.username,
          displayUsername: user.displayUsername,
          name: user.name,
        })
        .from(user)
        .where(
          inArray(
            user.id,
            podiumRows.map((row) => row.userId),
          ),
        )
    : []
  const nameOf = new Map(people.map((p) => [p.id, p.displayUsername || p.username || p.name]))
  const voters = await db.selectDistinct({ userId: vote.userId }).from(vote).where(eq(vote.weekId, w.id))
  const game = await sealedWeekGame(db, w)
  return {
    game,
    byUser: new Map(rows.map((row) => [row.userId, row])),
    podium: podiumRows.map((row) => ({
      position: row.result.position as number,
      title: row.entryTitle,
      producer: nameOf.get(row.userId) ?? null,
      score: scoreText(row.result.scoreMilli),
    })),
    jurors: new Set(voters.map((row) => row.userId)),
    empty: rows.length === 0,
  }
}

/** Encola lo del lunes que toque ahora. */
export async function scheduleMondayEmails(deps: MondayDeps, now: number): Promise<MondayResult> {
  const { db } = deps
  const out: MondayResult = { monday: 0, drop: 0, results: 0 }
  const storage = deps.storage
  const live = storage ? await liveWeek(db, now) : null
  const dropDue = live !== null && now >= dropMailAt(live.week.startsAt)
  const closed = await closedWeek(db, now)
  const prev = closed && now >= resultsMailAt(closed.week) ? closed : null
  if (!dropDue && !prev) return out

  const drop = dropDue && live && storage ? dropPayload({ ...deps, storage }, live) : null
  // El combinado junta las dos semanas del mismo lunes: la que cierra y la que abre.
  const paired =
    drop !== null &&
    live !== null &&
    prev !== null &&
    localDateKey(prev.week.voteEndsAt) === localDateKey(live.week.startsAt)
  const sealed = prev?.week.sealedAt ?? null
  const deadline = prev ? resultsMailAt(prev.week) + RESULTS_WAIT_MS : 0
  const sealedInTime = sealed !== null && sealed <= deadline
  const waiting = paired && sealed === null && now < deadline
  const results = prev && sealed !== null ? await resultsOf(db, prev.week) : null

  const block = (userId: string | null) => {
    if (!prev || !results) return null
    const own = userId ? results.byUser.get(userId) : undefined
    return {
      weekNumber: prev.week.number,
      slug: prev.week.slug,
      sampleTitle: prev.sampleTitle,
      corrected: prev.week.resultRevision > 1,
      podium: results.podium,
      mine:
        own && userId
          ? {
              position: own.result.position,
              title: own.entryTitle,
              score: scoreText(own.result.scoreMilli),
              votes: own.result.votes,
              cardUrl: resultCardUrl(deps.publicUrl, deps.cardSecret, prev.week.slug, userId),
            }
          : null,
      empty: results.empty,
      game: userId ? results.game(userId, own?.result.position != null) : null,
    }
  }

  const statements: BatchStatement[] = []
  const accounts = await db
    .select({ id: user.id, format: emailPref.mondayFormat })
    .from(user)
    .leftJoin(emailPref, eq(emailPref.userId, user.id))
    .where(eq(user.emailVerified, true))
  for (const account of accounts) {
    const participant = results?.byUser.has(account.id) ?? false
    const juror = results?.jurors.has(account.id) ?? false
    const priority = participant ? PRIORITY.participant : juror ? PRIORITY.juror : PRIORITY.account
    const target = { userId: account.id }
    const combined = (account.format ?? 'combined') === 'combined'
    if (paired && combined && waiting) continue
    if (paired && combined && sealedInTime && drop && prev) {
      statements.push(
        enqueueEmail(db, {
          id: deps.newId(),
          kind: 'battle.monday',
          target,
          idempotencyKey: `battle.monday:user:${account.id}:${drop.slug}`,
          payload: { results: block(account.id), drop: { ...drop, subscriber: false } },
          priority,
          now,
        }),
      )
      out.monday += 1
      continue
    }
    if (drop) {
      statements.push(
        enqueueEmail(db, {
          id: deps.newId(),
          kind: 'battle.drop',
          target,
          idempotencyKey: `battle.drop:user:${account.id}:${drop.slug}`,
          payload: { ...drop, subscriber: false },
          priority,
          now,
        }),
      )
      out.drop += 1
    }
    if (prev && results && (participant || juror)) {
      statements.push(
        enqueueEmail(db, {
          id: deps.newId(),
          kind: 'battle.results',
          target,
          idempotencyKey: `battle.results:user:${account.id}:${prev.week.slug}`,
          payload: block(account.id) as Record<string, unknown>,
          priority,
          now,
        }),
      )
      out.results += 1
    }
  }

  if (drop && !waiting) {
    const subscribers = await db
      .select({ id: emailSubscriber.id })
      .from(emailSubscriber)
      .where(and(eq(emailSubscriber.status, 'confirmed'), isNull(emailSubscriber.mergedUserId)))
    for (const row of subscribers) {
      const target = { subscriberId: row.id }
      if (paired && sealedInTime) {
        statements.push(
          enqueueEmail(db, {
            id: deps.newId(),
            kind: 'battle.monday',
            target,
            idempotencyKey: `battle.monday:subscriber:${row.id}:${drop.slug}`,
            payload: { results: block(null), drop: { ...drop, subscriber: true } },
            priority: PRIORITY.subscriber,
            now,
          }),
        )
        out.monday += 1
      } else {
        statements.push(
          enqueueEmail(db, {
            id: deps.newId(),
            kind: 'battle.drop',
            target,
            idempotencyKey: `battle.drop:subscriber:${row.id}:${drop.slug}`,
            payload: { ...drop, subscriber: true },
            priority: PRIORITY.subscriber,
            now,
          }),
        )
        out.drop += 1
      }
    }
  }
  for (let i = 0; i < statements.length; i += ENQUEUE_CHUNK)
    await runBatch(db, statements.slice(i, i + ENQUEUE_CHUNK))
  return out
}
