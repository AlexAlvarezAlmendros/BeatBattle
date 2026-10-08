import { createHash } from 'node:crypto'
import { and, asc, count, desc, eq, gt, inArray, lte, min, sql } from 'drizzle-orm'
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
  type Decision,
  DRAIN_MAX_PER_RUN,
  decide,
  nextSlotAt,
  planBudget,
  QUOTA_WINDOW_MS,
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
      priority: info.priority,
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
}

export interface DrainResult {
  sent: number
  deferred: number
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
  const result: DrainResult = { sent: 0, deferred: 0, skipped: 0, suppressed: 0, failed: 0, retrying: 0 }
  const { db, mailer } = deps
  if (!mailer) return result
  const now = deps.now()

  const dueWhere = and(
    eq(emailOutbox.status, 'queued'),
    lte(emailOutbox.notBefore, now),
    options.only ? inArray(emailOutbox.id, [...options.only]) : undefined,
  )
  const due = await db
    .select({
      id: emailOutbox.id,
      family: emailOutbox.family,
      priority: emailOutbox.priority,
      createdAt: emailOutbox.createdAt,
    })
    .from(emailOutbox)
    .where(dueWhere)
    .orderBy(asc(emailOutbox.priority), asc(emailOutbox.createdAt))
    .limit(500)
  if (due.length === 0) return result

  const windowStart = now - QUOTA_WINDOW_MS
  const [window] = await db
    .select({
      total: count(),
      service: sql<number>`coalesce(sum(case when ${emailOutbox.family} = 'service' then 1 else 0 end), 0)`,
      oldest: min(emailOutbox.sentAt),
    })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, 'sent'), gt(emailOutbox.sentAt, windowStart)))

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
    await db
      .update(emailOutbox)
      .set({ status: 'sent', sentAt, providerId, attempts: row.attempts + 1 })
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
    await db
      .update(emailOutbox)
      .set(at === null ? { status: 'failed', attempts } : { status: 'queued', attempts, notBefore: at })
      .where(eq(emailOutbox.id, row.id))
    return at === null ? 'failed' : 'retrying'
  }
}
