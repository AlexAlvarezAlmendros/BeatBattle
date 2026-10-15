import { createHash } from 'node:crypto'
import { and, asc, count, desc, eq, gt, gte, inArray, lte, min, ne, or, sql } from 'drizzle-orm'
import type { BatchStatement } from '../db/batch'
import type { Db } from '../db/client'
import {
  emailConsent,
  emailOutbox,
  emailPref,
  emailStat,
  emailSubscriber,
  emailSuppression,
  user,
} from '../db/schema'
import { type EmailKind, kindInfo } from './catalog'
import { type Mailer, RecipientNotAllowedError } from './mailer'
import {
  capWeekStart,
  type Decision,
  DRAIN_MAX_PER_RUN,
  type DueEmail,
  decide,
  nextSlotAt,
  planBudget,
  planWeeklyCap,
  QUOTA_WINDOW_MS,
  quietUntil,
  type Recipient,
  retryAt,
} from './policy'

/**
 * Cola de salida (guía §4.19.3, tarea 2.8). Todo email nace con `enqueueEmail` **dentro del `batch`** del
 * hecho que lo provoca: si la operación falla, no hay email; si el envío falla, la operación no se pierde.
 * `emailDrain` los envía dentro del cupo, aplicando al enviar preferencias, consentimiento y supresiones.
 */

/** Hash con el que se guarda una dirección suprimida (§4.14: nunca la dirección en claro). */
export function emailHash(address: string): string {
  return createHash('sha256').update(address.trim().toLowerCase()).digest('hex')
}

export type EmailTarget = { userId: string } | { subscriberId: string } | { address: string }

export interface EnqueueInput {
  id: string
  kind: EmailKind
  target: EmailTarget
  /** Única por destinatario, tipo y referencia (`RF-NOTIF-02`): `battle.monday:<usuario>:2026-w41`. */
  idempotencyKey: string
  payload: Record<string, unknown>
  now: number
  /** Primer instante en que puede salir (por defecto, ya). */
  notBefore?: number
  /**
   * Prioridad dentro de su tipo (por defecto, la del catálogo): el Lunes de batalla sale primero a quien
   * participó, luego al jurado, al resto de cuentas y a los suscriptores (§2.12.2).
   */
  priority?: number
}

/**
 * La sentencia que encola un email, para meterla en el `batch` del hecho. Si la clave ya existe no hace
 * nada (`RF-NOTIF-02`: reencolar o reintentar no duplica).
 */
export function enqueueEmail(db: Db, input: EnqueueInput): BatchStatement {
  const info = kindInfo(input.kind)
  const target = input.target
  return db
    .insert(emailOutbox)
    .values({
      id: input.id,
      idempotencyKey: input.idempotencyKey,
      userId: 'userId' in target ? target.userId : null,
      subscriberId: 'subscriberId' in target ? target.subscriberId : null,
      toAddress: 'address' in target ? target.address : null,
      kind: input.kind,
      family: info.family,
      priority: input.priority ?? info.priority,
      payload: JSON.stringify(input.payload),
      status: 'queued',
      notBefore: input.notBefore ?? input.now,
      createdAt: input.now,
    })
    .onConflictDoNothing({ target: emailOutbox.idempotencyKey })
}

export interface Rendered {
  subject: string
  html: string
  text: string
}

export type OutboxRow = typeof emailOutbox.$inferSelect

/**
 * Renderiza un email al enviarlo, con los datos guardados del hecho (`payload`) y la URL de baja si la
 * lleva (§4.19.3: la plantilla se renderiza al enviar). La da `renderEmail` (tarea 2.9).
 */
export type RenderEmail = (
  row: OutboxRow,
  context: { to: string; unsubscribeUrl?: string },
) => Promise<Rendered>

/** URL de baja en un clic de un destinatario y un tipo (tarea 2.10). */
export type UnsubscribeUrl = (address: string, kind: EmailKind) => string

export interface DrainDeps {
  db: Db
  mailer: Mailer | null
  now: () => number
  render: RenderEmail
  unsubscribeUrl: UnsubscribeUrl
  dailyLimit: number
  /**
   * Avisa de un envío fallido (para el registro): el id de la cola, el tipo, el intento y el error, nunca la
   * dirección (§4.13 «Registros»).
   */
  onSendError?: (info: { id: string; kind: string; attempts: number; final: boolean; error: string }) => void
}

export interface DrainResult {
  sent: number
  deferred: number
  /** Retenidos por las horas de silencio hasta las 08:00 (`RF-NOTIF-08`). */
  held: number
  skipped: number
  suppressed: number
  failed: number
  retrying: number
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Suma uno a una estadística agregada (`email_stat`). */
async function bumpStat(db: Db, scope: string, metric: string, at: number, by = 1): Promise<void> {
  if (by === 0) return
  await db
    .insert(emailStat)
    .values({ scope, day: day(at), metric, count: by })
    .onConflictDoUpdate({
      target: [emailStat.scope, emailStat.day, emailStat.metric],
      set: { count: sql`${emailStat.count} + ${by}` },
    })
}

/** A quién va y qué permite: cuenta, suscriptor sin cuenta o dirección suelta. `null` si ya no existe. */
async function resolveRecipient(db: Db, row: OutboxRow): Promise<Recipient | null> {
  let address: string | null = null
  let prefs: Recipient['prefs'] = null
  let marketingConsent = false
  let subscriberActive = true
  if (row.userId) {
    const [account] = await db.select({ email: user.email }).from(user).where(eq(user.id, row.userId))
    if (!account) return null
    address = account.email
    const [pref] = await db.select().from(emailPref).where(eq(emailPref.userId, row.userId))
    // Sin fila, los valores por defecto: todos los avisos activos y sin marketing.
    prefs = pref ? { ...pref, updatedAt: String(pref.updatedAt) } : {}
    marketingConsent = pref?.marketingOn ?? false
  } else if (row.subscriberId) {
    const [subscriber] = await db
      .select()
      .from(emailSubscriber)
      .where(eq(emailSubscriber.id, row.subscriberId))
    if (!subscriber) return null
    address = subscriber.email
    subscriberActive = subscriber.status === 'confirmed'
    const [last] = await db
      .select({ granted: emailConsent.granted })
      .from(emailConsent)
      .where(and(eq(emailConsent.subscriberId, row.subscriberId), eq(emailConsent.purpose, 'marketing')))
      .orderBy(desc(emailConsent.createdAt))
      .limit(1)
    marketingConsent = last?.granted ?? false
  } else if (row.toAddress) {
    address = row.toAddress
  }
  if (!address) return null
  const [suppression] = await db
    .select({ reason: emailSuppression.reason })
    .from(emailSuppression)
    .where(eq(emailSuppression.emailHash, emailHash(address)))
  return { email: address, prefs, marketingConsent, suppressed: suppression !== undefined, subscriberActive }
}

type Candidate = DueEmail & { userId: string | null; subscriberId: string | null }

/**
 * Horas de silencio y tope semanal (§2.12.4, `RF-NOTIF-08`), antes del cupo: entre las 22:00 y las 08:00 lo
 * que no es de servicio se retiene hasta las 08:00; y a cada destinatario (cuenta o suscriptor) le sale como
 * mucho `WEEKLY_CAP` a la semana, por prioridad: lo que no cabe queda `skipped` (`weekly_cap`). Devuelve lo
 * que sigue adelante.
 */
async function applyQuietAndCap(
  db: Db,
  candidates: readonly Candidate[],
  now: number,
  result: DrainResult,
): Promise<DueEmail[]> {
  const service = candidates.filter((email) => email.family === 'service')
  let rest = candidates.filter((email) => email.family !== 'service')
  const until = quietUntil(now)
  if (until !== null && rest.length > 0) {
    await db
      .update(emailOutbox)
      .set({ notBefore: until })
      .where(
        and(
          inArray(
            emailOutbox.id,
            rest.map((email) => email.id),
          ),
          eq(emailOutbox.status, 'queued'),
        ),
      )
    result.held = rest.length
    rest = []
  }
  const keyOf = (email: Pick<Candidate, 'userId' | 'subscriberId'>) =>
    email.userId ? `u:${email.userId}` : email.subscriberId ? `s:${email.subscriberId}` : null
  const groups = new Map<string, Candidate[]>()
  const loose: Candidate[] = []
  for (const email of rest) {
    const key = keyOf(email)
    if (key === null) loose.push(email)
    else groups.set(key, [...(groups.get(key) ?? []), email])
  }
  const allowed: DueEmail[] = [...service, ...loose]
  if (groups.size > 0) {
    const userIds = rest.flatMap((email) => (email.userId ? [email.userId] : []))
    const subscriberIds = rest.flatMap((email) =>
      !email.userId && email.subscriberId ? [email.subscriberId] : [],
    )
    const sent = await db
      .select({ userId: emailOutbox.userId, subscriberId: emailOutbox.subscriberId, n: count() })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.status, 'sent'),
          ne(emailOutbox.family, 'service'),
          gte(emailOutbox.sentAt, capWeekStart(now)),
          or(
            userIds.length > 0 ? inArray(emailOutbox.userId, userIds) : undefined,
            subscriberIds.length > 0 ? inArray(emailOutbox.subscriberId, subscriberIds) : undefined,
          ),
        ),
      )
      .groupBy(emailOutbox.userId, emailOutbox.subscriberId)
    const sentBy = new Map<string, number>()
    for (const row of sent) {
      const key = keyOf(row)
      if (key) sentBy.set(key, (sentBy.get(key) ?? 0) + row.n)
    }
    const skip: string[] = []
    for (const [key, emails] of groups) {
      const plan = planWeeklyCap({ sentThisWeek: sentBy.get(key) ?? 0, due: emails })
      const byId = new Map(emails.map((email) => [email.id, email]))
      for (const id of plan.allow) allowed.push(byId.get(id) as Candidate)
      skip.push(...plan.skip)
    }
    if (skip.length > 0) {
      await db
        .update(emailOutbox)
        .set({ status: 'skipped', skipReason: 'weekly_cap' })
        .where(and(inArray(emailOutbox.id, skip), eq(emailOutbox.status, 'queued')))
      result.skipped += skip.length
    }
  }
  return allowed
}

/**
 * Envía lo que toca (`status = queued` y `not_before ≤ ahora`), por prioridad y dentro del cupo diario en
 * ventana móvil de 24 h con la reserva de servicio (`RF-NOTIF-17`). Lo llaman el `tick` (Fase 3) y, justo
 * después de su `batch`, quien encola un email de servicio (`only`, para que salga en la misma petición).
 * Sin transporte no hace nada: los emails siguen en cola.
 */
export async function emailDrain(
  deps: DrainDeps,
  options: { only?: readonly string[] } = {},
): Promise<DrainResult> {
  const result: DrainResult = {
    sent: 0,
    deferred: 0,
    held: 0,
    skipped: 0,
    suppressed: 0,
    failed: 0,
    retrying: 0,
  }
  const { db, mailer } = deps
  if (!mailer) return result
  const now = deps.now()

  const dueWhere = and(
    eq(emailOutbox.status, 'queued'),
    lte(emailOutbox.notBefore, now),
    options.only ? inArray(emailOutbox.id, [...options.only]) : undefined,
  )
  const candidates = await db
    .select({
      id: emailOutbox.id,
      family: emailOutbox.family,
      priority: emailOutbox.priority,
      createdAt: emailOutbox.createdAt,
      userId: emailOutbox.userId,
      subscriberId: emailOutbox.subscriberId,
    })
    .from(emailOutbox)
    .where(dueWhere)
    .orderBy(asc(emailOutbox.priority), asc(emailOutbox.createdAt))
    .limit(500)
  if (candidates.length === 0) return result
  const due = await applyQuietAndCap(db, candidates, now, result)
  if (due.length === 0) return result

  const windowStart = now - QUOTA_WINDOW_MS
  const [window] = await db
    .select({
      total: count(),
      service: sql<number>`coalesce(sum(case when ${emailOutbox.family} = 'service' then 1 else 0 end), 0)`,
      oldest: min(emailOutbox.sentAt),
    })
    .from(emailOutbox)
    // Lo enviado en las últimas 24 h hasta ahora: con el reloj de prueba (que va y vuelve) puede haber envíos
    // «del futuro», que no cuentan en esta ventana.
    .where(
      and(eq(emailOutbox.status, 'sent'), gt(emailOutbox.sentAt, windowStart), lte(emailOutbox.sentAt, now)),
    )

  const plan = planBudget({
    limit: deps.dailyLimit,
    sentInWindow: window?.total ?? 0,
    serviceSentInWindow: Number(window?.service ?? 0),
    due,
    maxThisRun: DRAIN_MAX_PER_RUN,
  })

  if (plan.defer.length > 0) {
    await db
      .update(emailOutbox)
      .set({ notBefore: nextSlotAt(now, window?.oldest ?? null) })
      .where(and(inArray(emailOutbox.id, plan.defer), eq(emailOutbox.status, 'queued')))
    result.deferred = plan.defer.length
    await bumpStat(db, 'all', 'deferred', now, plan.defer.length)
  }

  for (const id of plan.send) {
    // Reclamarla: si otro proceso ya la ha cogido, no se envía dos veces.
    const [row] = await db
      .update(emailOutbox)
      .set({ status: 'sending' })
      .where(and(eq(emailOutbox.id, id), eq(emailOutbox.status, 'queued')))
      .returning()
    if (!row) continue
    const outcome = await deliver(deps, mailer, row)
    result[outcome] += 1
  }
  return result
}

type Outcome = 'sent' | 'skipped' | 'suppressed' | 'failed' | 'retrying'

async function deliver(deps: DrainDeps, mailer: Mailer, row: OutboxRow): Promise<Outcome> {
  const { db } = deps
  const kind = row.kind as EmailKind
  const info = kindInfo(kind)
  const recipient = await resolveRecipient(db, row)
  if (!recipient) {
    await db
      .update(emailOutbox)
      .set({ status: 'skipped', skipReason: 'no_recipient' })
      .where(eq(emailOutbox.id, row.id))
    return 'skipped'
  }
  const decision: Decision = decide(info, recipient)
  if (decision.action === 'suppress') {
    await db.update(emailOutbox).set({ status: 'suppressed' }).where(eq(emailOutbox.id, row.id))
    return 'suppressed'
  }
  if (decision.action === 'skip') {
    await db
      .update(emailOutbox)
      .set({ status: 'skipped', skipReason: decision.reason })
      .where(eq(emailOutbox.id, row.id))
    return 'skipped'
  }
  try {
    const unsubscribeUrl = info.family === 'service' ? undefined : deps.unsubscribeUrl(recipient.email, kind)
    const rendered = await deps.render(row, { to: recipient.email, unsubscribeUrl })
    const { providerId } = await mailer.send({ id: row.id, to: recipient.email, ...rendered, unsubscribeUrl })
    const sentAt = deps.now()
    // Una dirección suelta (sin cuenta ni suscripción, p. ej. `account.deleted`) no se guarda más allá del
    // envío (§4.14): la fila se queda sin dirección ni datos.
    const scrub = row.toAddress ? { toAddress: null, payload: '{}' } : {}
    await db
      .update(emailOutbox)
      .set({ status: 'sent', sentAt, providerId, attempts: row.attempts + 1, ...scrub })
      .where(eq(emailOutbox.id, row.id))
    await bumpStat(db, `kind:${kind}`, 'sent', sentAt)
    return 'sent'
  } catch (error) {
    if (error instanceof RecipientNotAllowedError) {
      await db
        .update(emailOutbox)
        .set({ status: 'skipped', skipReason: 'preview_allowlist' })
        .where(eq(emailOutbox.id, row.id))
      return 'skipped'
    }
    const attempts = row.attempts + 1
    const at = retryAt(deps.now(), attempts)
    deps.onSendError?.({
      id: row.id,
      kind,
      attempts,
      final: at === null,
      error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : 'desconocido',
    })
    await db
      .update(emailOutbox)
      .set(at === null ? { status: 'failed', attempts } : { status: 'queued', attempts, notBefore: at })
      .where(eq(emailOutbox.id, row.id))
    return at === null ? 'failed' : 'retrying'
  }
}
