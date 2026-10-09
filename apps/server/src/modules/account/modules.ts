import { describeUserAgent } from '@beatbattle/shared'
import { eq, inArray, like, or, sql } from 'drizzle-orm'
import {
  account,
  appRateLimit,
  emailConsent,
  emailOutbox,
  emailPref,
  emailSubscriber,
  producerProfile,
  session,
  user,
  usernameRedirect,
  verification,
} from '../../db/schema'
import type { AccountDataModule } from './registry'

/**
 * Los módulos de datos de la Fase 2. El orden importa al borrar: hijos antes que padres, y la cuenta
 * (`user`) la última.
 */

/** Perfil de productor, redirecciones de nombre y avatar (§2.3). */
const profile: AccountDataModule = {
  name: 'profile',
  async exportData({ db, userId, images }) {
    const [row] = await db.select().from(producerProfile).where(eq(producerProfile.userId, userId))
    const redirects = await db
      .select({ old: usernameRedirect.old, expiresAt: usernameRedirect.expiresAt })
      .from(usernameRedirect)
      .where(eq(usernameRedirect.userId, userId))
    if (!row) return null
    return {
      cardNumber: row.cardNumber,
      bio: row.bio,
      city: row.city,
      links: JSON.parse(row.links) as unknown,
      accent: row.accent,
      avatarUrl: row.avatarPublicId && images ? images.imageUrl(row.avatarPublicId, { size: 1024 }) : null,
      xp: row.xp,
      usernameChangedAt: row.usernameChangedAt,
      createdAt: row.createdAt,
      previousUsernames: redirects,
    }
  },
  async cleanup({ db, userId, images }) {
    const [row] = await db
      .select({ avatarPublicId: producerProfile.avatarPublicId })
      .from(producerProfile)
      .where(eq(producerProfile.userId, userId))
    const avatar = row?.avatarPublicId
    return {
      statements: [
        db.delete(usernameRedirect).where(eq(usernameRedirect.userId, userId)),
        db.delete(producerProfile).where(eq(producerProfile.userId, userId)),
      ],
      external:
        avatar && images ? [{ describe: `avatar ${avatar}`, run: () => images.removeImage(avatar) }] : [],
    }
  },
}

/**
 * Email (§2.12, §4.19): preferencias, historial de consentimientos, lo que hay en la cola para la cuenta o
 * su dirección, y la suscripción a la alerta con el mismo email. Las supresiones (solo el hash) **se
 * conservan**, para respetar bajas y rebotes (§4.14); las estadísticas ya son agregadas.
 */
const email: AccountDataModule = {
  name: 'email',
  async exportData({ db, userId, email: address }) {
    const [prefs] = await db.select().from(emailPref).where(eq(emailPref.userId, userId))
    const consents = await db
      .select({
        purpose: emailConsent.purpose,
        granted: emailConsent.granted,
        textVersion: emailConsent.textVersion,
        source: emailConsent.source,
        ipHash: emailConsent.ipHash,
        createdAt: emailConsent.createdAt,
      })
      .from(emailConsent)
      .where(eq(emailConsent.userId, userId))
      .orderBy(emailConsent.createdAt)
    const sent = await db
      .select({
        kind: emailOutbox.kind,
        status: emailOutbox.status,
        createdAt: emailOutbox.createdAt,
        sentAt: emailOutbox.sentAt,
      })
      .from(emailOutbox)
      .where(or(eq(emailOutbox.userId, userId), sql`lower(${emailOutbox.toAddress}) = ${address}`))
      .orderBy(emailOutbox.createdAt)
    const [subscriber] = await db
      .select({ status: emailSubscriber.status, createdAt: emailSubscriber.createdAt })
      .from(emailSubscriber)
      .where(sql`lower(${emailSubscriber.email}) = ${address}`)
    return {
      preferences: prefs ? { ...prefs, userId: undefined } : null,
      consents,
      emails: sent,
      dropAlertSubscription: subscriber ?? null,
    }
  },
  async cleanup({ db, userId, email: address }) {
    const subscribers = await db
      .select({ id: emailSubscriber.id })
      .from(emailSubscriber)
      .where(or(sql`lower(${emailSubscriber.email}) = ${address}`, eq(emailSubscriber.mergedUserId, userId)))
    const subscriberIds = subscribers.map((row) => row.id)
    const bySubscriber = subscriberIds.length > 0
    return {
      statements: [
        db.delete(emailConsent).where(eq(emailConsent.userId, userId)),
        ...(bySubscriber
          ? [
              db.delete(emailConsent).where(inArray(emailConsent.subscriberId, subscriberIds)),
              db.delete(emailOutbox).where(inArray(emailOutbox.subscriberId, subscriberIds)),
              db.delete(emailSubscriber).where(inArray(emailSubscriber.id, subscriberIds)),
            ]
          : []),
        db
          .delete(emailOutbox)
          .where(or(eq(emailOutbox.userId, userId), sql`lower(${emailOutbox.toAddress}) = ${address}`)),
        db.delete(emailPref).where(eq(emailPref.userId, userId)),
      ],
    }
  },
}

/**
 * La cuenta de Better Auth (§4.9): sesiones (navegador resumido y fechas; la IP y el *user agent* entero
 * también son suyos), proveedores vinculados (sin tokens), los tokens de verificación pendientes y la
 * propia cuenta, que se borra la última.
 */
const auth: AccountDataModule = {
  name: 'account',
  async exportData({ db, userId }) {
    const [row] = await db.select().from(user).where(eq(user.id, userId))
    const sessions = await db
      .select({
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(eq(session.userId, userId))
    const linked = await db
      .select({ providerId: account.providerId, createdAt: account.createdAt })
      .from(account)
      .where(eq(account.userId, userId))
    if (!row) return null
    return {
      email: row.email,
      emailVerified: row.emailVerified,
      username: row.username,
      displayUsername: row.displayUsername,
      name: row.name,
      createdAt: row.createdAt,
      sessions: sessions.map((item) => ({ ...item, device: describeUserAgent(item.userAgent) ?? null })),
      signInMethods: linked.map((item) => ({
        method: item.providerId === 'credential' ? 'password' : item.providerId,
        createdAt: item.createdAt,
      })),
    }
  },
  async cleanup({ db, userId }) {
    return {
      statements: [
        db.delete(session).where(eq(session.userId, userId)),
        db.delete(account).where(eq(account.userId, userId)),
        db.delete(verification).where(eq(verification.value, userId)),
        // Los contadores de la app por cuenta (`<regla>:user:<id>`) llevan el id.
        db.delete(appRateLimit).where(like(appRateLimit.key, `%:user:${userId}`)),
        db.delete(user).where(eq(user.id, userId)),
      ],
    }
  },
}

/**
 * Lo que aún no existe pero la exportación ya nombra (`RF-PRF-05`): entradas (Fase 4), votos (Fase 5) y
 * logros (Fase 7). Cada fase sustituye su parte por un módulo de verdad con su borrado.
 */
const pending: AccountDataModule = {
  name: 'game',
  async exportData() {
    return { entries: [], votes: [], achievements: [], xpEvents: [] }
  },
  async cleanup() {
    return { statements: [] }
  },
}

/** En el orden del borrado: la cuenta, la última. */
export const ACCOUNT_DATA: readonly AccountDataModule[] = [pending, profile, email, auth]
