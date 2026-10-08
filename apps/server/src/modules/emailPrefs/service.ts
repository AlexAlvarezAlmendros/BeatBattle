import {
  CONSENT_TEXT_VERSIONS,
  DEFAULT_EMAIL_PREFS,
  type EmailPrefs,
  type EmailPrefsUpdate,
  NOTICE_KEYS,
  type SignupConsents,
} from '@beatbattle/shared'
import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { emailConsent, emailPref } from '../../db/schema'

type Purpose = 'marketing' | 'otp_newsletter'
type Source = 'registro' | 'ajustes'

export interface ConsentContext {
  now: number
  ipHash: string | null
  newId: () => string
}

async function lastConsent(db: Db, userId: string, purpose: Purpose): Promise<boolean> {
  const [row] = await db
    .select({ granted: emailConsent.granted })
    .from(emailConsent)
    .where(and(eq(emailConsent.userId, userId), eq(emailConsent.purpose, purpose)))
    .orderBy(desc(emailConsent.createdAt), desc(emailConsent.id))
    .limit(1)
  return row?.granted ?? false
}

/** Las preferencias de una cuenta, con los valores por defecto si no ha tocado nada (§2.12.4). */
export async function getEmailPrefs(db: Db, userId: string): Promise<EmailPrefs> {
  const [row] = await db.select().from(emailPref).where(eq(emailPref.userId, userId))
  const notices = Object.fromEntries(NOTICE_KEYS.map((key) => [key, row?.[key] ?? DEFAULT_EMAIL_PREFS[key]]))
  return {
    ...DEFAULT_EMAIL_PREFS,
    ...notices,
    mondayFormat: row?.mondayFormat ?? DEFAULT_EMAIL_PREFS.mondayFormat,
    marketing: await lastConsent(db, userId, 'marketing'),
    otpNewsletter: await lastConsent(db, userId, 'otp_newsletter'),
  }
}

/**
 * Cambia las preferencias. Los consentimientos que cambian se **añaden** al historial (fecha, versión del
 * texto, origen y hash de la IP; `RF-NOTIF-16`), nunca se sobrescriben, y `marketing_on` queda como espejo
 * del último de marketing.
 */
export async function updateEmailPrefs(
  db: Db,
  userId: string,
  patch: EmailPrefsUpdate,
  context: ConsentContext & { source: Source },
): Promise<EmailPrefs> {
  const current = await getEmailPrefs(db, userId)
  const consents: { purpose: Purpose; granted: boolean }[] = []
  if (patch.marketing !== undefined && patch.marketing !== current.marketing)
    consents.push({ purpose: 'marketing', granted: patch.marketing })
  if (patch.otpNewsletter !== undefined && patch.otpNewsletter !== current.otpNewsletter)
    consents.push({ purpose: 'otp_newsletter', granted: patch.otpNewsletter })

  const notices = Object.fromEntries(
    NOTICE_KEYS.filter((key) => patch[key] !== undefined).map((key) => [key, patch[key]]),
  )
  const set = {
    ...notices,
    ...(patch.mondayFormat ? { mondayFormat: patch.mondayFormat } : {}),
    marketingOn: patch.marketing ?? current.marketing,
    updatedAt: context.now,
  }
  const statements = [
    db
      .insert(emailPref)
      .values({ userId, ...set })
      .onConflictDoUpdate({ target: emailPref.userId, set }),
    ...consents.map((consent) =>
      db.insert(emailConsent).values({
        id: context.newId(),
        userId,
        purpose: consent.purpose,
        granted: consent.granted,
        textVersion: CONSENT_TEXT_VERSIONS[consent.purpose],
        source: context.source,
        ipHash: context.ipHash,
        createdAt: context.now,
      }),
    ),
  ]
  const [first, ...rest] = statements
  if (first) await db.batch([first, ...rest])
  return getEmailPrefs(db, userId)
}

/** Las casillas del registro: los avisos que desmarcó y los consentimientos que marcó (origen `registro`). */
export async function recordSignupConsents(
  db: Db,
  userId: string,
  consents: SignupConsents,
  context: ConsentContext,
): Promise<void> {
  await updateEmailPrefs(
    db,
    userId,
    { ...consents.notices, marketing: consents.marketing, otpNewsletter: consents.otpNewsletter },
    { ...context, source: 'registro' },
  )
}
