import { localDateOf, scheduleWeek, zonedInstant } from '@beatbattle/rules'
import { and, eq, gt, isNull, lte } from 'drizzle-orm'
import { type BatchStatement, runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { emailSubscriber, sample, user, week } from '../../db/schema'
import { enqueueEmail } from '../../email/outbox'
import type { SampleStorage } from '../storage/samples'

/**
 * Avisos programados de la semana (§4.12 `emailSchedule` y `adminAlerts`; tareas 3.12 y 3.13).
 *
 * - **Drop** (`battle.drop`): el lunes a las 08:00 de Madrid, a cada cuenta verificada (sus preferencias se
 *   aplican al enviar, `RF-NOTIF-01`) y a cada suscriptor confirmado sin cuenta (`RF-NOTIF-09`). Hasta la
 *   Fase 6 no hay «Lunes de batalla» combinado: el lunes sale este. La clave de idempotencia es por
 *   destinatario y semana, así que el `tick` lo puede intentar cada 15 minutos sin duplicar.
 * - **Hueco en el calendario** (`admin.calendar_gap`, `RF-DROP-04`): un lunes sin semana a 72 h o menos
 *   avisa a cada admin, una vez por lunes.
 */

/** Hora del email del drop (§2.12, §4.12): lunes 08:00 en Madrid. */
export const DROP_EMAIL_AT = { hour: 8, minute: 0, second: 0 } as const
/** Antelación del aviso de hueco en el calendario (`RF-DROP-04`). */
export const CALENDAR_GAP_NOTICE_MS = 72 * 60 * 60 * 1000
const ENQUEUE_CHUNK = 200

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

/** Encola `battle.drop` de la semana abierta si ya son las 08:00 de su lunes. Devuelve los encolados. */
export async function scheduleDropEmails(deps: ScheduleDeps, now: number): Promise<number> {
  const { db } = deps
  if (!deps.storage) return 0
  const [live] = await db
    .select({ week, sample })
    .from(week)
    .innerJoin(sample, eq(sample.id, week.sampleId))
    .where(and(lte(week.startsAt, now), gt(week.submitEndsAt, now)))
    .limit(1)
  if (!live) return 0
  const mailAt = zonedInstant(localDateOf(live.week.startsAt), DROP_EMAIL_AT)
  if (now < mailAt) return 0

  const cover = deps.storage.coverUrl(live.sample.coverPublicId, 512)
  const payload = {
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
  const accounts = await db.select({ id: user.id }).from(user).where(eq(user.emailVerified, true))
  const subscribers = await db
    .select({ id: emailSubscriber.id })
    .from(emailSubscriber)
    .where(and(eq(emailSubscriber.status, 'confirmed'), isNull(emailSubscriber.mergedUserId)))
  const statements: BatchStatement[] = [
    ...accounts.map((row) =>
      enqueueEmail(db, {
        id: deps.newId(),
        kind: 'battle.drop',
        target: { userId: row.id },
        idempotencyKey: `battle.drop:user:${row.id}:${live.week.slug}`,
        payload: { ...payload, subscriber: false },
        now,
      }),
    ),
    ...subscribers.map((row) =>
      enqueueEmail(db, {
        id: deps.newId(),
        kind: 'battle.drop',
        target: { subscriberId: row.id },
        idempotencyKey: `battle.drop:subscriber:${row.id}:${live.week.slug}`,
        payload: { ...payload, subscriber: true },
        now,
      }),
    ),
  ]
  for (let i = 0; i < statements.length; i += ENQUEUE_CHUNK)
    await runBatch(db, statements.slice(i, i + ENQUEUE_CHUNK))
  return statements.length
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
