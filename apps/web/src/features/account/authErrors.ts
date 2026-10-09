import { t } from '../../i18n'

/**
 * Los códigos de error de Better Auth y los nuestros (`EMAIL_DISPOSABLE`, `USERNAME_RESERVED`) en el texto de
 * la interfaz (§2.3). Con las mismas palabras que el campo al que se refieren.
 */
const KNOWN = [
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_USERNAME_OR_PASSWORD',
  'EMAIL_NOT_VERIFIED',
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  'USERNAME_IS_ALREADY_TAKEN',
  'USERNAME_RESERVED',
  'INVALID_USERNAME',
  'USERNAME_TOO_SHORT',
  'USERNAME_TOO_LONG',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'PASSWORD_COMPROMISED',
  'EMAIL_DISPOSABLE',
  'INVALID_EMAIL',
  'INVALID_TOKEN',
  'TOKEN_EXPIRED',
  'TOO_MANY_REQUESTS',
] as const
export type AuthErrorCode = (typeof KNOWN)[number]

/** El campo al que pertenece cada error (para pintarlo debajo de él); el resto va en el aviso del formulario. */
export const FIELD_OF: Partial<Record<AuthErrorCode, 'email' | 'username' | 'password'>> = {
  USER_ALREADY_EXISTS: 'email',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'email',
  EMAIL_DISPOSABLE: 'email',
  INVALID_EMAIL: 'email',
  USERNAME_IS_ALREADY_TAKEN: 'username',
  USERNAME_RESERVED: 'username',
  INVALID_USERNAME: 'username',
  USERNAME_TOO_SHORT: 'username',
  USERNAME_TOO_LONG: 'username',
  PASSWORD_TOO_SHORT: 'password',
  PASSWORD_TOO_LONG: 'password',
  PASSWORD_COMPROMISED: 'password',
}

export function authErrorCode(
  error: { code?: string; status?: number } | null | undefined,
): AuthErrorCode | 'UNKNOWN' {
  if (!error) return 'UNKNOWN'
  if (error.status === 429) return 'TOO_MANY_REQUESTS'
  return (KNOWN as readonly string[]).includes(error.code ?? '') ? (error.code as AuthErrorCode) : 'UNKNOWN'
}

/** `INVALID_EMAIL_OR_PASSWORD` → `invalidEmailOrPassword` (las claves de i18n van en camelCase). */
const keyOf = (code: string) =>
  code.toLowerCase().replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())

export function authErrorText(code: AuthErrorCode | 'UNKNOWN'): string {
  // biome-ignore lint/suspicious/noExplicitAny: la clave sale del código, que es de la lista de arriba
  return t(`account.errors.${keyOf(code)}` as any)
}
