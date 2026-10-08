import { z } from 'zod'

/**
 * Preferencias y consentimientos de email (guía §2.12.4, §4.19.3, tarea 2.12): lo que enseñan el registro
 * y Ajustes → Emails, y lo que guarda el servidor. Un interruptor por aviso; marketing y la newsletter del
 * sello van por **consentimiento** (casillas desmarcadas por defecto, historial que nunca se sobrescribe).
 */

/** Interruptores de los avisos de la batalla (todos activos por defecto). */
export const NOTICE_KEYS = [
  'dropOn',
  'resultsOn',
  'reminderOn',
  'juryCallOn',
  'firstVotesOn',
  'labelPickOn',
  'progressOn',
  'seasonOn',
] as const
export type NoticeKey = (typeof NOTICE_KEYS)[number]

/**
 * Versión del texto de cada consentimiento tal como se muestra (`RF-NOTIF-16`): si cambia el texto de la
 * casilla, cambia la versión, y el historial dice qué aceptó cada uno.
 */
export const CONSENT_TEXT_VERSIONS = {
  marketing: 'marketing-2026-10',
  otp_newsletter: 'otp-newsletter-2026-10',
} as const

const notices = z.object(
  Object.fromEntries(NOTICE_KEYS.map((key) => [key, z.boolean()])) as Record<NoticeKey, z.ZodBoolean>,
)

export const EmailPrefsSchema = notices.extend({
  mondayFormat: z.enum(['combined', 'separate']),
  marketing: z.boolean(),
  otpNewsletter: z.boolean(),
})
export type EmailPrefs = z.infer<typeof EmailPrefsSchema>

/** Lo que se puede cambiar desde Ajustes → Emails (todo opcional: solo lo que cambia). */
export const EmailPrefsUpdateSchema = EmailPrefsSchema.partial().strict()
export type EmailPrefsUpdate = z.infer<typeof EmailPrefsUpdateSchema>

/** Las casillas del registro: los avisos (marcados por defecto) y los dos consentimientos (desmarcados). */
export const SignupConsentsSchema = z
  .object({
    notices: notices.partial().default({}),
    marketing: z.boolean().default(false),
    otpNewsletter: z.boolean().default(false),
  })
  .strict()
export type SignupConsents = z.infer<typeof SignupConsentsSchema>

export const DEFAULT_EMAIL_PREFS: EmailPrefs = {
  dropOn: true,
  resultsOn: true,
  reminderOn: true,
  juryCallOn: true,
  firstVotesOn: true,
  labelPickOn: true,
  progressOn: true,
  seasonOn: true,
  mondayFormat: 'combined',
  marketing: false,
  otpNewsletter: false,
}
