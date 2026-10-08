import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { emailConsent, emailPref, emailStat, emailSubscriber, emailSuppression, user } from '../db/schema'
import { EMAIL_CATALOG, type EmailKind, kindInfo } from './catalog'
import { emailHash } from './outbox'

/**
 * Bajas (guía §2.12.4 y §4.19.6, tarea 2.10). Cada email que no es de servicio lleva un token firmado con
 * HMAC (`UNSUBSCRIBE_SECRET`) sobre destinatario + tipo, **sin caducidad** y sin pedir sesión: sirve para
 * la baja en un clic de la cabecera (`List-Unsubscribe`, RFC 8058) y para la página de baja del pie.
 */

interface TokenBody {
  /** Destinatario, en minúsculas. */
  e: string
  k: EmailKind
}

const b64 = (value: Buffer | string) => Buffer.from(value).toString('base64url')

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function createUnsubscribeToken(secret: string, address: string, kind: EmailKind): string {
  const body = b64(JSON.stringify({ e: address.trim().toLowerCase(), k: kind } satisfies TokenBody))
  return `${body}.${sign(secret, body)}`
}

/** El destinatario y el tipo de un token válido, o `null` (firma mala, tipo desconocido o de servicio). */
export function readUnsubscribeToken(
  secret: string,
  token: string,
): { address: string; kind: EmailKind } | null {
  const [body, signature, extra] = token.split('.')
  if (!body || !signature || extra !== undefined) return null
  const expected = Buffer.from(sign(secret, body))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<TokenBody>
    if (typeof parsed.e !== 'string' || typeof parsed.k !== 'string' || !(parsed.k in EMAIL_CATALOG))
      return null
    if (kindInfo(parsed.k as EmailKind).family === 'service') return null
    return { address: parsed.e, kind: parsed.k as EmailKind }
  } catch {
    return null
  }
}

export interface UnsubscribeLinks {
  /** La de la cabecera `List-Unsubscribe` (`POST`, RFC 8058). */
  oneClick(address: string, kind: EmailKind): string
  /** La del pie: la página de la web que deja elegir ese tipo o todo lo no esencial. */
  page(address: string, kind: EmailKind): string
}

export function createUnsubscribeLinks(options: { publicUrl: string; secret: string }): UnsubscribeLinks {
  const token = (address: string, kind: EmailKind) =>
    encodeURIComponent(createUnsubscribeToken(options.secret, address, kind))
  return {
    oneClick: (address, kind) =>
      `${options.publicUrl}/api/unsubscribe/one-click?token=${token(address, kind)}`,
    page: (address, kind) => `${options.publicUrl}/baja?token=${token(address, kind)}`,
  }
}

/** La página de baja que corresponde a una URL de baja en un clic (mismo token). */
export function pageFromOneClick(oneClickUrl: string, publicUrl: string): string {
  const token = new URL(oneClickUrl).searchParams.get('token') ?? ''
  return `${publicUrl}/baja?token=${encodeURIComponent(token)}`
}

/** «aina@example.com» → «a•••@example.com»: la página de baja dice a quién sin enseñarlo entero. */
export function maskEmail(address: string): string {
  const [local = '', domain = ''] = address.split('@')
  return `${local.slice(0, 1)}•••@${domain}`
}

export type UnsubscribeScope = 'kind' | 'all'

/** Interruptores de `email_pref` (todos los avisos) y su valor «apagado». */
const ALL_PREFS_OFF = {
  dropOn: false,
  resultsOn: false,
  reminderOn: false,
  juryCallOn: false,
  firstVotesOn: false,
  labelPickOn: false,
  progressOn: false,
  seasonOn: false,
  marketingOn: false,
} as const

/** Versión del texto de la baja que queda en el historial de consentimientos (`RF-NOTIF-16`). */
export const UNSUBSCRIBE_TEXT_VERSION = 'baja-2026-10'

/**
 * Aplica una baja, con efecto inmediato (`RF-NOTIF-05`): de ese tipo (sus interruptores, o el
 * consentimiento si es marketing) o de todo lo no esencial (todos los avisos, el marketing y la supresión
 * de la dirección, que se guarda solo como hash). Vale para cuentas y para suscriptores sin cuenta.
 */
export async function applyUnsubscribe(
  db: Db,
  input: { address: string; kind: EmailKind; scope: UnsubscribeScope; now: number; newId: () => string },
): Promise<void> {
  const { address, kind, scope, now } = input
  const info = kindInfo(kind)
  const [account] = await db.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${address}`)
  const [subscriber] = await db
    .select({ id: emailSubscriber.id })
    .from(emailSubscriber)
    .where(sql`lower(${emailSubscriber.email}) = ${address}`)

  const marketingOff = scope === 'all' || info.family === 'marketing'
  const prefsOff =
    scope === 'all' ? ALL_PREFS_OFF : Object.fromEntries(info.prefs.map((key) => [key, false] as const))

  if (account) {
    const set = { ...prefsOff, ...(marketingOff ? { marketingOn: false } : {}), updatedAt: now }
    await db
      .insert(emailPref)
      .values({ userId: account.id, ...set })
      .onConflictDoUpdate({ target: emailPref.userId, set })
  }
  if (marketingOff && (account || subscriber))
    await db.insert(emailConsent).values({
      id: input.newId(),
      userId: account?.id ?? null,
      subscriberId: account ? null : (subscriber?.id ?? null),
      purpose: 'marketing',
      granted: false,
      textVersion: UNSUBSCRIBE_TEXT_VERSION,
      source: 'baja',
      createdAt: now,
    })
  // El suscriptor de la alerta solo recibe avisos del drop: darse de baja de ellos es darse de baja.
  if (subscriber && (scope === 'all' || info.family === 'battle'))
    await db
      .update(emailSubscriber)
      .set({ status: 'unsubscribed' })
      .where(eq(emailSubscriber.id, subscriber.id))
  if (scope === 'all')
    await db
      .insert(emailSuppression)
      .values({ emailHash: emailHash(address), reason: 'unsubscribed_all', createdAt: now })
      .onConflictDoNothing()

  await db
    .insert(emailStat)
    .values({
      scope: `kind:${kind}`,
      day: new Date(now).toISOString().slice(0, 10),
      metric: 'unsubscribed',
      count: 1,
    })
    .onConflictDoUpdate({
      target: [emailStat.scope, emailStat.day, emailStat.metric],
      set: { count: sql`${emailStat.count} + 1` },
    })
}
