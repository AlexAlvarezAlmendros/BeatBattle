import {
  type Accent,
  normalizeProfileLink,
  type OwnProfile,
  PROFILE_LINK_KINDS,
  type ProfileLinkKind,
  type ProfileLinks,
  type ProfileUpdateSchema,
  type PublicProfile,
  USERNAME_CHANGE_DAYS,
  usernameProblem,
} from '@beatbattle/shared'
import { and, eq, gt, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { producerProfile, user, usernameRedirect } from '../../db/schema'
import { appError } from '../../lib/errors'

/**
 * Perfil de productor (guía §2.3, §3.8.10, tarea 2.18): el público (`/p/:username`), el propio para
 * Ajustes → Perfil, su edición y el cambio de nombre, una vez cada 30 días y con redirección desde el
 * anterior durante otros 30 (`RF-PRF-03`). El instante entra como argumento (`req.now`).
 */

const DAY_MS = 24 * 60 * 60 * 1000
const CHANGE_MS = USERNAME_CHANGE_DAYS * DAY_MS

type Row = {
  id: string
  username: string | null
  displayUsername: string | null
  name: string
  createdAt: Date
  banned: boolean | null
  cardNumber: number
  xp: number
  bio: string | null
  city: string | null
  links: string
  accent: Accent
  usernameChangedAt: number | null
}

const columns = {
  id: user.id,
  username: user.username,
  displayUsername: user.displayUsername,
  name: user.name,
  createdAt: user.createdAt,
  banned: user.banned,
  cardNumber: producerProfile.cardNumber,
  xp: producerProfile.xp,
  bio: producerProfile.bio,
  city: producerProfile.city,
  links: producerProfile.links,
  accent: producerProfile.accent,
  usernameChangedAt: producerProfile.usernameChangedAt,
}

function parseLinks(raw: string): ProfileLinks {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    const links: ProfileLinks = {}
    for (const kind of PROFILE_LINK_KINDS)
      if (typeof value[kind] === 'string') links[kind] = value[kind] as string
    return links
  } catch {
    return {}
  }
}

function toPublic(row: Row): PublicProfile {
  const username = row.username ?? ''
  return {
    username,
    displayUsername: row.displayUsername || username || row.name,
    cardNumber: row.cardNumber,
    joinedAt: row.createdAt.getTime(),
    xp: row.xp,
    bio: row.bio,
    city: row.city,
    links: parseLinks(row.links),
    accent: row.accent,
    // El avatar llega con la subida firmada a Cloudinary (tarea 2.19).
    avatarUrl: null,
  }
}

async function findBy(db: Db, where: SQL): Promise<Row | undefined> {
  const [row] = await db
    .select(columns)
    .from(user)
    .innerJoin(producerProfile, eq(producerProfile.userId, user.id))
    .where(where)
  return row
}

export type PublicLookup = { profile: PublicProfile } | { redirectTo: string } | null

/**
 * El perfil público de un nombre, sin distinguir mayúsculas. Si el nombre es el anterior de alguien
 * (redirección vigente), dice a cuál ir. Una cuenta suspendida no tiene perfil público.
 */
export async function findPublicProfile(db: Db, raw: string, now: number): Promise<PublicLookup> {
  const name = raw.toLowerCase()
  const row = await findBy(db, eq(user.username, name))
  if (row) return row.banned ? null : { profile: toPublic(row) }
  const [redirect] = await db
    .select({ username: user.username, banned: user.banned })
    .from(usernameRedirect)
    .innerJoin(user, eq(user.id, usernameRedirect.userId))
    .where(and(eq(usernameRedirect.old, name), gt(usernameRedirect.expiresAt, now)))
  if (!redirect?.username || redirect.banned) return null
  return { redirectTo: redirect.username }
}

export async function getOwnProfile(db: Db, userId: string, now: number): Promise<OwnProfile> {
  const row = await findBy(db, eq(user.id, userId))
  if (!row) throw appError('NOT_FOUND', 'No hay perfil para esta cuenta.')
  const availableAt = row.usernameChangedAt === null ? null : row.usernameChangedAt + CHANGE_MS
  return {
    ...toPublic(row),
    usernameChangeAvailableAt: availableAt !== null && availableAt > now ? availableAt : null,
  }
}

/** Aplica los cambios del perfil (solo lo que llega). Un enlace que no es de su sitio se rechaza entero. */
export async function updateProfile(
  db: Db,
  userId: string,
  patch: z.output<typeof ProfileUpdateSchema>,
  now: number,
): Promise<OwnProfile> {
  const set: Partial<typeof producerProfile.$inferInsert> = {}
  if (patch.bio !== undefined) set.bio = patch.bio
  if (patch.city !== undefined) set.city = patch.city
  if (patch.accent !== undefined) set.accent = patch.accent
  if (patch.links !== undefined) {
    const [current] = await db
      .select({ links: producerProfile.links })
      .from(producerProfile)
      .where(eq(producerProfile.userId, userId))
    const links = parseLinks(current?.links ?? '{}')
    for (const [kind, value] of Object.entries(patch.links) as [ProfileLinkKind, string | null][]) {
      if (value === null || value.trim() === '') {
        delete links[kind]
        continue
      }
      const normalized = normalizeProfileLink(kind, value)
      if (!normalized) throw appError('INVALID_LINK', 'Ese enlace no es de su sitio.', { details: { kind } })
      links[kind] = normalized
    }
    set.links = JSON.stringify(links)
  }
  if (Object.keys(set).length > 0)
    await db.update(producerProfile).set(set).where(eq(producerProfile.userId, userId))
  return getOwnProfile(db, userId, now)
}

/**
 * Cambia el nombre de productor (`RF-PRF-03`): una vez cada 30 días, y el anterior lleva al nuevo otros
 * 30 (nadie más puede cogerlo mientras). Cambiar solo mayúsculas («kairo» → «Kairo») no cuenta como
 * cambio. Todo en un `batch`.
 */
export async function changeUsername(db: Db, userId: string, raw: string, now: number): Promise<OwnProfile> {
  const problem = usernameProblem(raw)
  if (problem === 'USERNAME_RESERVED') throw appError('USERNAME_RESERVED', 'Ese nombre está reservado.')
  if (problem) throw appError('USERNAME_INVALID', 'Ese nombre no cumple el formato.')
  const next = raw.toLowerCase()
  const row = await findBy(db, eq(user.id, userId))
  if (!row) throw appError('NOT_FOUND', 'No hay perfil para esta cuenta.')
  const current = row.username ?? ''

  if (next === current) {
    await db
      .update(user)
      .set({ displayUsername: raw, updatedAt: new Date(now) })
      .where(eq(user.id, userId))
    return getOwnProfile(db, userId, now)
  }
  if (row.usernameChangedAt !== null && now < row.usernameChangedAt + CHANGE_MS)
    throw appError('USERNAME_CHANGE_TOO_SOON', 'Ya cambiaste el nombre hace menos de 30 días.', {
      details: { availableAt: row.usernameChangedAt + CHANGE_MS },
    })
  const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.username, next))
  const [held] = await db
    .select({ userId: usernameRedirect.userId })
    .from(usernameRedirect)
    .where(and(eq(usernameRedirect.old, next), gt(usernameRedirect.expiresAt, now)))
  if (owner || (held && held.userId !== userId))
    throw appError('USERNAME_TAKEN', 'Ese nombre ya lo tiene otro productor.')

  try {
    await runBatch(db, [
      // El nombre que se coge deja de redirigir (era mío, o había caducado).
      db.delete(usernameRedirect).where(eq(usernameRedirect.old, next)),
      db
        .update(user)
        .set({ username: next, displayUsername: raw, updatedAt: new Date(now) })
        .where(eq(user.id, userId)),
      db
        .insert(usernameRedirect)
        .values({ old: current, userId, expiresAt: now + CHANGE_MS })
        .onConflictDoUpdate({ target: usernameRedirect.old, set: { userId, expiresAt: now + CHANGE_MS } }),
      db.update(producerProfile).set({ usernameChangedAt: now }).where(eq(producerProfile.userId, userId)),
    ])
  } catch (error) {
    if (/UNIQUE/i.test(String(error)))
      throw appError('USERNAME_TAKEN', 'Ese nombre ya lo tiene otro productor.')
    throw error
  }
  return getOwnProfile(db, userId, now)
}
