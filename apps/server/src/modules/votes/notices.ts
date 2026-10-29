import { addDays, localDateOf, zonedInstant } from '@beatbattle/rules'
import { and, eq, gt, inArray, lte } from 'drizzle-orm'
import { type BatchStatement, runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { entry, sample, sampleDownload, user, vote, week } from '../../db/schema'
import { enqueueEmail } from '../../email/outbox'
import { streaksAtRisk } from '../game/notices'
import { madridLongDateTime } from '../weeks/schedule'

/**
 * Avisos de la batalla que programa el `tick` (§2.12, §4.12 `emailSchedule`; tarea 5.12). La clave de
 * idempotencia es por destinatario y semana, así que el `tick` los puede intentar cada 15 minutos sin
 * duplicar. Preferencias, horas de silencio y tope semanal se aplican al enviar (`RF-NOTIF-08`).
 *
 * - **Recordatorio** (`battle.reminder`): el sábado a las 18:00, a quien descargó el sample y no tiene
 *   entrada viva; con racha de 3 semanas o más (la de las semanas selladas), en su versión «racha en peligro»
 *   (§2.12.7; tarea 7.31).
 * - **Llamada al jurado** (`battle.jury_call`): el domingo a las 17:00, a quien ha votado esta semana y le
 *   quedan al menos `JURY_CALL_MIN_REMAINING` entradas por puntuar.
 */

/** Sábado a las 18:00 de la semana (días desde el lunes y hora de pared en Madrid). */
export const REMINDER_AT = { daysFromMonday: 5, hour: 18, minute: 0, second: 0 } as const
/** Domingo a las 17:00. */
export const JURY_CALL_AT = { daysFromMonday: 6, hour: 17, minute: 0, second: 0 } as const
/** Entradas por puntuar a partir de las que sale la llamada al jurado (§2.12). */
export const JURY_CALL_MIN_REMAINING = 3

const HOUR_MS = 60 * 60 * 1000
const ENQUEUE_CHUNK = 200
const LIVE = ['processing', 'active', 'hidden'] as const

export interface NoticeDeps {
  db: Db
  newId: () => string
}

export interface NoticeResult {
  reminders: number
  juryCalls: number
}

function at(monday: ReturnType<typeof localDateOf>, when: typeof REMINDER_AT | typeof JURY_CALL_AT): number {
  return zonedInstant(addDays(monday, when.daysFromMonday), when)
}

async function enqueueAll(db: Db, statements: BatchStatement[]): Promise<void> {
  for (let i = 0; i < statements.length; i += ENQUEUE_CHUNK)
    await runBatch(db, statements.slice(i, i + ENQUEUE_CHUNK))
}

export async function scheduleBattleNotices(deps: NoticeDeps, now: number): Promise<NoticeResult> {
  const { db } = deps
  const result: NoticeResult = { reminders: 0, juryCalls: 0 }
  const [live] = await db
    .select({ week, title: sample.title })
    .from(week)
    .innerJoin(sample, eq(sample.id, week.sampleId))
    .where(and(lte(week.startsAt, now), gt(week.voteEndsAt, now)))
    .limit(1)
  if (!live) return result
  const w = live.week
  const monday = localDateOf(w.startsAt)

  if (now >= at(monday, REMINDER_AT) && now < w.submitEndsAt) {
    const downloaders = await db
      .selectDistinct({ userId: sampleDownload.userId })
      .from(sampleDownload)
      .innerJoin(user, eq(user.id, sampleDownload.userId))
      .where(and(eq(sampleDownload.weekId, w.id), eq(user.emailVerified, true)))
    const inside = new Set(
      (
        await db
          .select({ userId: entry.userId })
          .from(entry)
          .where(and(eq(entry.weekId, w.id), inArray(entry.status, [...LIVE])))
      ).map((row) => row.userId),
    )
    const payload = {
      weekNumber: w.number,
      slug: w.slug,
      title: live.title,
      hoursLeft: Math.max(1, Math.round((w.submitEndsAt - now) / HOUR_MS)),
      closesText: madridLongDateTime(w.submitEndsAt),
    }
    const waiting = downloaders.filter((row) => !inside.has(row.userId)).map((row) => row.userId)
    const atRisk = await streaksAtRisk(db, waiting, w)
    const statements = waiting.map((userId) =>
      enqueueEmail(db, {
        id: deps.newId(),
        kind: 'battle.reminder',
        target: { userId },
        idempotencyKey: `battle.reminder:${userId}:${w.slug}`,
        payload: { ...payload, streak: atRisk.get(userId) ?? null },
        now,
      }),
    )
    await enqueueAll(db, statements)
    result.reminders = statements.length
  }

  if (now >= at(monday, JURY_CALL_AT)) {
    const active = await db
      .select({ id: entry.id, userId: entry.userId })
      .from(entry)
      .where(and(eq(entry.weekId, w.id), eq(entry.status, 'active')))
    const votes = await db
      .select({ userId: vote.userId, entryId: vote.entryId })
      .from(vote)
      .where(eq(vote.weekId, w.id))
    const byVoter = new Map<string, Set<string>>()
    for (const row of votes) byVoter.set(row.userId, (byVoter.get(row.userId) ?? new Set()).add(row.entryId))
    // Las votaciones cierran el lunes a las 00:00 exclusivo: se enseña el domingo a las 23:59.
    const closesText = madridLongDateTime(w.voteEndsAt - 1000)
    const statements: BatchStatement[] = []
    for (const [voterId, voted] of byVoter) {
      const remaining = active.filter((row) => row.userId !== voterId && !voted.has(row.id)).length
      if (remaining < JURY_CALL_MIN_REMAINING) continue
      statements.push(
        enqueueEmail(db, {
          id: deps.newId(),
          kind: 'battle.jury_call',
          target: { userId: voterId },
          idempotencyKey: `battle.jury_call:${voterId}:${w.slug}`,
          payload: { weekNumber: w.number, slug: w.slug, remaining, closesText },
          now,
        }),
      )
    }
    await enqueueAll(db, statements)
    result.juryCalls = statements.length
  }
  return result
}
