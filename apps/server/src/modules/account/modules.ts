import { describeUserAgent } from '@beatbattle/shared'
import { and, eq, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm'
import {
  account,
  appRateLimit,
  emailConsent,
  emailOutbox,
  emailPref,
  emailSubscriber,
  entry,
  producerProfile,
  rulesAcceptance,
  sampleDownload,
  seenFlag,
  session,
  uploadIntent,
  user,
  usernameRedirect,
  verification,
  vote,
  week,
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

/** Bases aceptadas, descargas del sample y lo ya visto, por semana (§2.4, tarea 3.3). */
const weeks: AccountDataModule = {
  name: 'weeks',
  async exportData({ db, userId }) {
    const rules = await db
      .select({
        week: week.slug,
        rulesVersion: rulesAcceptance.rulesVersion,
        acceptedAt: rulesAcceptance.acceptedAt,
      })
      .from(rulesAcceptance)
      .innerJoin(week, eq(week.id, rulesAcceptance.weekId))
      .where(eq(rulesAcceptance.userId, userId))
    const downloads = await db
      .select({
        week: week.slug,
        kind: sampleDownload.kind,
        count: sampleDownload.count,
        firstAt: sampleDownload.firstAt,
        lastAt: sampleDownload.lastAt,
      })
      .from(sampleDownload)
      .innerJoin(week, eq(week.id, sampleDownload.weekId))
      .where(eq(sampleDownload.userId, userId))
    const seen = await db
      .select({ kind: seenFlag.kind, ref: seenFlag.ref, seenAt: seenFlag.seenAt })
      .from(seenFlag)
      .where(eq(seenFlag.userId, userId))
    return { rulesAccepted: rules, sampleDownloads: downloads, seen }
  },
  async cleanup({ db, userId }) {
    return {
      statements: [
        db.delete(rulesAcceptance).where(eq(rulesAcceptance.userId, userId)),
        db.delete(sampleDownload).where(eq(sampleDownload.userId, userId)),
        db.delete(seenFlag).where(eq(seenFlag.userId, userId)),
      ],
    }
  },
}

/**
 * Entradas y votos (§2.5, tarea 4.3). Al borrar la cuenta (`RF-PRF-04`): las entradas y los votos de
 * semanas sin sellar se borran (también los votos que otros dieron a esas entradas); las entradas de
 * semanas selladas se quedan con su clasificación y pasan a «Productor eliminado» (`user_id` =
 * `deleted:<id de la entrada>`, sin nada que lleve a la persona). Sus audios, ya sin fila, los barre la
 * limpieza de huérfanos del `tick` (tarea 4.9).
 */
const entries: AccountDataModule = {
  name: 'game',
  async exportData({ db, userId }) {
    const own = await db
      .select({
        week: week.slug,
        alias: entry.alias,
        title: entry.title,
        description: entry.description,
        bpm: entry.bpm,
        musicalKey: entry.musicalKey,
        daw: entry.daw,
        tags: entry.tags,
        format: entry.format,
        bytes: entry.bytes,
        durationMs: entry.durationMs,
        loudnessLufs: entry.loudnessLufs,
        truePeakDb: entry.truePeakDb,
        receiptNumber: entry.receiptNumber,
        status: entry.status,
        submittedAt: entry.submittedAt,
        updatedAt: entry.updatedAt,
      })
      .from(entry)
      .innerJoin(week, eq(week.id, entry.weekId))
      .where(eq(entry.userId, userId))
    const votes = await db
      .select({ week: week.slug, entryId: vote.entryId, stars: vote.stars, createdAt: vote.createdAt })
      .from(vote)
      .innerJoin(week, eq(week.id, vote.weekId))
      .where(eq(vote.userId, userId))
    return {
      entries: own.map(({ tags, ...item }) => ({ ...item, genres: JSON.parse(tags) as string[] })),
      votes,
      // La capa de juego (logros y XP) llega con la Fase 7.
      achievements: [],
      xpEvents: [],
    }
  },
  async cleanup({ db, userId }) {
    const unsealedWeeks = db.select({ id: week.id }).from(week).where(isNull(week.sealedAt))
    const sealedWeeks = db.select({ id: week.id }).from(week).where(isNotNull(week.sealedAt))
    const ownUnsealed = db
      .select({ id: entry.id })
      .from(entry)
      .where(and(eq(entry.userId, userId), inArray(entry.weekId, unsealedWeeks)))
    return {
      statements: [
        db.delete(vote).where(inArray(vote.entryId, ownUnsealed)),
        db.delete(vote).where(and(eq(vote.userId, userId), inArray(vote.weekId, unsealedWeeks))),
        db.delete(entry).where(and(eq(entry.userId, userId), inArray(entry.weekId, unsealedWeeks))),
        db
          .update(entry)
          .set({ userId: sql`'deleted:' || ${entry.id}` })
          .where(and(eq(entry.userId, userId), inArray(entry.weekId, sealedWeeks))),
        db.delete(uploadIntent).where(eq(uploadIntent.userId, userId)),
      ],
    }
  },
}

/** En el orden del borrado: la cuenta, la última. */
export const ACCOUNT_DATA: readonly AccountDataModule[] = [entries, weeks, profile, email, auth]
