import { localDateOf, scheduleWeek, zonedInstant } from '@beatbattle/rules'
import { and, eq, gt, lte } from 'drizzle-orm'
import { type BatchStatement, runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { sample, user, week } from '../../db/schema'
import { enqueueEmail } from '../../email/outbox'
import type { SampleStorage } from '../storage/samples'

/**
 * Avisos programados de la semana (§4.12 `emailSchedule` y `adminAlerts`; tareas 3.12 y 3.13).
 *
 * - **Drop**: lo que dice del sample nuevo el email del lunes; el reparto (combinado o separado, la espera al
 *   sellado) lo hace `results/monday.ts` (tarea 6.9).
 * - **Hueco en el calendario** (`admin.calendar_gap`, `RF-DROP-04`): un lunes sin semana a 72 h o menos
 *   avisa a cada admin, una vez por lunes.
 */

/** Hora del email del drop (§2.12, §4.12): lunes 08:00 en Madrid. */
export const DROP_EMAIL_AT = { hour: 8, minute: 0, second: 0 } as const
/** Antelación del aviso de hueco en el calendario (`RF-DROP-04`). */
export const CALENDAR_GAP_NOTICE_MS = 72 * 60 * 60 * 1000

/** «domingo 11 de octubre a las 20:00» en Madrid. */
export function madridLongDateTime(ms: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(ms)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.weekday} ${parts.day} de ${parts.month} a las ${parts.hour}:${parts.minute}`
}

/** «lunes 12 de octubre» en Madrid. */
export function madridLongDate(ms: number): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
    .format(ms)
    .replace(',', '')
}

export interface ScheduleDeps {
  db: Db
  storage: SampleStorage | null
  publicUrl: string
  newId: () => string
}

/** La semana abierta ahora con su sample, o nada. */
export async function liveWeek(db: Db, now: number) {
  const [live] = await db
    .select({ week, sample })
    .from(week)
    .innerJoin(sample, eq(sample.id, week.sampleId))
    .where(and(lte(week.startsAt, now), gt(week.submitEndsAt, now)))
    .limit(1)
  return live ?? null
}

/** El instante del email del drop de una semana: las 08:00 de su lunes en Madrid. */
export const dropMailAt = (startsAt: number) => zonedInstant(localDateOf(startsAt), DROP_EMAIL_AT)

/** Lo que dice `battle.drop` (y la mitad de abajo de `battle.monday`) de la semana abierta. */
export function dropPayload(
  deps: Pick<ScheduleDeps, 'publicUrl'> & { storage: SampleStorage },
  live: NonNullable<Awaited<ReturnType<typeof liveWeek>>>,
) {
  const cover = deps.storage.coverUrl(live.sample.coverPublicId, 512)
  return {
    weekNumber: live.week.number,
    slug: live.week.slug,
    title: live.sample.title,
    credits: live.sample.credits,
    bpm: live.sample.bpm,
    musicalKey: live.sample.musicalKey,
    genre: live.sample.genreHint,
    challenge: live.week.challenge,
    coverUrl: cover.startsWith('http') ? cover : `${deps.publicUrl}${cover}`,
    closesText: madridLongDateTime(live.week.submitEndsAt),
  }
}

/** Avisa a los admins de cada lunes sin semana en las próximas 72 h (`RF-DROP-04`). */
export async function scheduleGapAlerts(
  deps: ScheduleDeps & { gapsWithin: (now: number, horizonMs: number) => Promise<string[]> },
  now: number,
): Promise<string[]> {
  const { db } = deps
  const gaps = (await deps.gapsWithin(now, CALENDAR_GAP_NOTICE_MS)).filter((monday) => {
    const [year, month, day] = monday.split('-').map(Number) as [number, number, number]
    return scheduleWeek({ year, month, day }).startsAt > now
  })
  if (gaps.length === 0) return []
  const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, 'admin'))
  const statements: BatchStatement[] = []
  for (const monday of gaps) {
    const [year, month, day] = monday.split('-').map(Number) as [number, number, number]
    const startsAt = scheduleWeek({ year, month, day }).startsAt
    for (const admin of admins)
      statements.push(
        enqueueEmail(db, {
          id: deps.newId(),
          kind: 'admin.calendar_gap',
          target: { userId: admin.id },
          idempotencyKey: `admin.calendar_gap:${admin.id}:${monday}`,
          payload: {
            mondayText: madridLongDate(startsAt),
            hoursLeft: Math.round((startsAt - now) / 3_600_000),
          },
          now,
        }),
      )
  }
  await runBatch(db, statements)
  return gaps
}
