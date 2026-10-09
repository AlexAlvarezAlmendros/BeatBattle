import { USERNAME_MAX, usernameCandidate, usernameProblem } from '@beatbattle/shared'
import { and, eq, gt } from 'drizzle-orm'
import type { Db } from '../db/client'
import { user, usernameRedirect } from '../db/schema'

/**
 * El nombre de productor de una cuenta nueva que entra con Google o Discord (tarea 2.22): el proveedor no
 * da uno, así que se saca de su nombre o, si no vale, de la parte local del email, y se le añade un número
 * si está cogido, es reservado o es el anterior de alguien durante su redirección (`RF-PRF-03`). Se puede
 * cambiar después en Ajustes → Perfil.
 */
export async function pickSocialUsername(
  db: Db,
  name: string | null | undefined,
  email: string,
  now: number,
) {
  // Un origen que da un nombre reservado («Ádmin» → «admin») se descarta entero: «admin2» también suplantaría.
  const base =
    [name, email.split('@')[0]]
      .map((raw) => (raw ? usernameCandidate(raw) : null))
      .find((candidate) => candidate !== null && usernameProblem(candidate) === null) ?? 'productor'
  for (let n = 0; n < 1000; n++) {
    const suffix = n === 0 ? '' : String(n + 1)
    const candidate = `${base.slice(0, USERNAME_MAX - suffix.length).replace(/[._]+$/g, '')}${suffix}`
    if (usernameProblem(candidate)) continue
    const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.username, candidate)).limit(1)
    if (taken) continue
    const [held] = await db
      .select({ old: usernameRedirect.old })
      .from(usernameRedirect)
      .where(and(eq(usernameRedirect.old, candidate), gt(usernameRedirect.expiresAt, now)))
      .limit(1)
    if (held) continue
    return candidate
  }
  throw new Error('No se ha podido elegir un nombre de productor libre')
}
