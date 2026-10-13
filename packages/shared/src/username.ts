/**
 * Nombre de productor (`username`, guía §2.3, `RF-AUTH-06`): 3–20 caracteres de `[a-z0-9_.]`, único sin
 * distinguir mayúsculas (se guarda en minúsculas; `displayUsername` conserva cómo lo escribió) y fuera
 * de la lista de reservados. Lo usan el servidor (Better Auth) y la web (el formulario de registro).
 */

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20

/** Caracteres permitidos, ya en minúsculas. */
const USERNAME_CHARS = /^[a-z0-9_.]+$/

/**
 * Nombres que nadie puede elegir: el sello, el juego, sus papeles y las rutas de la web (para que
 * `/p/<nombre>` nunca se confunda con una pantalla). Se comparan en minúsculas y sin puntos ni guiones
 * bajos, así que `o.t.p` y `beat_battle` también chocan.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  // El sello y el juego
  'otp',
  'otherpeople',
  'otherpeoplerecords',
  'beatbattle',
  'battle',
  'sello',
  // Papeles
  'admin',
  'administrador',
  'administrator',
  'root',
  'jurado',
  'moderador',
  'moderator',
  'mod',
  'staff',
  'soporte',
  'support',
  'sistema',
  'system',
  'oficial',
  'official',
  'anunciador',
  // Rutas y palabras de la web
  'api',
  'ajustes',
  'entrar',
  'registro',
  'verificar',
  'recuperar',
  'semana',
  'semanas',
  'subir',
  'perfil',
  'temporada',
  'legal',
  'dev',
  'null',
  'undefined',
  'productoreliminado',
]

const normalizedReserved = new Set(RESERVED_USERNAMES.map((name) => name.replace(/[._]/g, '')))

export type UsernameProblem =
  | 'USERNAME_TOO_SHORT'
  | 'USERNAME_TOO_LONG'
  | 'INVALID_USERNAME'
  | 'USERNAME_RESERVED'

/** Lo que falla de un nombre (en el orden en que se le explica al usuario), o `null` si vale. */
export function usernameProblem(raw: string): UsernameProblem | null {
  const username = raw.toLowerCase()
  if (username.length < USERNAME_MIN) return 'USERNAME_TOO_SHORT'
  if (username.length > USERNAME_MAX) return 'USERNAME_TOO_LONG'
  if (!USERNAME_CHARS.test(username)) return 'INVALID_USERNAME'
  if (normalizedReserved.has(username.replace(/[._]/g, ''))) return 'USERNAME_RESERVED'
  return null
}

export const isAllowedUsername = (username: string): boolean => usernameProblem(username) === null

/**
 * Un nombre de productor válido a partir de un texto libre (el nombre que da Google o Discord, o la parte
 * local del email): sin tildes, en minúsculas, solo `[a-z0-9_.]`, sin puntos ni guiones bajos en los
 * extremos y como mucho de 20 caracteres. Si no queda nada usable, `null` (quien llama elige otro origen).
 * No mira si está libre ni si es reservado: eso lo decide el servidor.
 */
export function usernameCandidate(raw: string): string | null {
  const base = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.]/g, '')
    .replace(/[._]{2,}/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, USERNAME_MAX)
    .replace(/[._]+$/g, '')
  return base.length >= USERNAME_MIN ? base : null
}
