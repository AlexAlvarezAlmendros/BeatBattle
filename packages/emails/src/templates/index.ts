import { accountDeleted } from './accountDeleted'
import { authChangeEmail } from './authChangeEmail'
import { authReset } from './authReset'
import { authSecurity } from './authSecurity'
import { authVerify } from './authVerify'
import { authWelcome } from './authWelcome'

export type { AccountDeletedPayload } from './accountDeleted'
export type { AuthChangeEmailPayload } from './authChangeEmail'
export type { AuthResetPayload } from './authReset'
export type { AuthSecurityPayload, SecurityChange } from './authSecurity'
export type { AuthVerifyPayload } from './authVerify'
export type { AuthWelcomePayload } from './authWelcome'

/** Plantillas por id del catálogo (§2.12). Cada fase añade las suyas. */
export const TEMPLATES = {
  'auth.verify': authVerify,
  'auth.reset': authReset,
  'auth.welcome': authWelcome,
  'auth.security': authSecurity,
  'auth.change_email': authChangeEmail,
  'account.deleted': accountDeleted,
} as const

export type TemplateKind = keyof typeof TEMPLATES
