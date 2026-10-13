import { createHash } from 'node:crypto'
import { phaseOf } from '@beatbattle/rules'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { entry, result, sample, user, week } from '../../db/schema'

/**
 * Lo que enseña cada imagen OG (§2.15, §4.15; tarea 6.11): la semana, una entrada, los resultados y un perfil.
 * Solo datos públicos **en ese instante**: antes del sellado, ni autoría en semanas ciegas ni medias, votos o
 * posiciones (`RF-SHARE-04`, `RF-PLAY-05`); un perfil solo cuenta semanas selladas (si contara las abiertas,
 * diría quién está en una batalla ciega). La versión (`v`) es el hash de estos datos: la URL cambia cuando
 * cambia lo que se ve, así la imagen se cachea como inmutable (`RF-SHARE-02`).
 */

export const OG_KINDS = ['week', 'entry', 'results', 'profile'] as const
export type OgKind = (typeof OG_KINDS)[number]

type Podium = { position: number; title: string; producer: string | null }[]

export type OgData =
  | {
      kind: 'week'
      slug: string
      number: number
      sampleTitle: string
      credits: string
      bpm: number | null
      musicalKey: string | null
      phase: 'open' | 'voting' | 'sealing' | 'sealed'
      /** La cuenta atrás congelada: hasta cuándo dura la fase, en palabras. */
      deadline: string | null
      /** Del drop al cierre de votos (el `Event` de los datos estructurados). */
      startsAt: number
      endsAt: number
    }
  | {
      kind: 'entry'
      id: string
      weekNumber: number
      sampleTitle: string
      alias: string
      title: string
      bpm: number | null
      musicalKey: string | null
      coverSeed: string
      durationMs: number | null
      /** Solo si la semana no es ciega o ya está sellada. */
      producer: string | null
      /** Solo con la semana sellada. */
      result: { position: number | null; scoreMilli: number; votes: number } | null
      votingOpen: boolean
    }
  | {
      kind: 'results'
      slug: string
      number: number
      sampleTitle: string
      podium: Podium
      empty: boolean
      corrected: boolean
    }
  | {
      kind: 'profile'
      username: string
      displayName: string
      /** Semanas selladas en las que participó, podios y mejor puesto. */
      weeks: number
      podiums: number
      best: number | null
    }

const nameOf = (p: { username: string | null; displayUsername: string | null; name: string }) =>
  p.displayUsername || p.username || p.name

/** «dom 18 oct · 20:00» en Madrid: la cuenta atrás congelada cabe en la placa de la imagen. */
export function madridShort(ms: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(ms)
      .map((part) => [part.type, part.value.replace('.', '')]),
  )
  return `${parts.weekday} ${parts.day} ${parts.month} · ${parts.hour}:${parts.minute}`
}

async function weekData(db: Db, slug: string, now: number): Promise<OgData | null> {
  const [row] = await db
    .select({ week, sample })
    .from(week)
    .innerJoin(sample, eq(sample.id, week.sampleId))
    .where(eq(week.slug, slug))
  if (!row) return null
  const phase = phaseOf(row.week, now)
  // Antes del drop, ni el sample (`RF-DROP-02`).
  if (phase === 'scheduled') return null
  return {
    kind: 'week',
    slug,
    number: row.week.number,
    sampleTitle: row.sample.title,
    credits: row.sample.credits,
    bpm: row.sample.bpm,
    musicalKey: row.sample.musicalKey,
    phase,
    deadline:
      phase === 'open'
        ? madridShort(row.week.submitEndsAt)
        : phase === 'voting'
          ? madridShort(row.week.voteEndsAt - 60_000)
          : null,
    startsAt: row.week.startsAt,
    endsAt: row.week.voteEndsAt,
  }
}

async function entryData(db: Db, id: string, now: number): Promise<OgData | null> {
  const [row] = await db
    .select({ entry, week, sampleTitle: sample.title })
    .from(entry)
    .innerJoin(week, eq(week.id, entry.weekId))
    .innerJoin(sample, eq(sample.id, week.sampleId))
    .where(eq(entry.id, id))
  if (!row || row.entry.status !== 'active') return null
  const sealed = row.week.sealedAt !== null
  const revealed = !row.week.blind || sealed
  const [person] = revealed
    ? await db
        .select({ username: user.username, displayUsername: user.displayUsername, name: user.name })
        .from(user)
        .where(eq(user.id, row.entry.userId))
    : []
  const [res] = sealed
    ? await db
        .select()
        .from(result)
        .where(
          and(
            eq(result.weekId, row.week.id),
            eq(result.revision, row.week.resultRevision),
            eq(result.entryId, id),
          ),
        )
    : []
  return {
    kind: 'entry',
    id,
    weekNumber: row.week.number,
    sampleTitle: row.sampleTitle,
    alias: row.entry.alias,
    title: row.entry.title,
    bpm: row.entry.bpm,
    musicalKey: row.entry.musicalKey,
    coverSeed: String(row.entry.coverSeed),
    durationMs: row.entry.durationMs,
    producer: person ? nameOf(person) : null,
    result: res ? { position: res.position, scoreMilli: res.scoreMilli, votes: res.votes } : null,
    votingOpen: ['open', 'voting'].includes(phaseOf(row.week, now)),
  }
}

async function resultsData(db: Db, slug: string): Promise<OgData | null> {
  const [row] = await db
    .select({ week, sampleTitle: sample.title })
    .from(week)
    .innerJoin(sample, eq(sample.id, week.sampleId))
    .where(eq(week.slug, slug))
  if (!row || row.week.sealedAt === null) return null
  const rows = await db
    .select({ position: result.position, title: entry.title, userId: entry.userId })
    .from(result)
    .innerJoin(entry, eq(entry.id, result.entryId))
    .where(and(eq(result.weekId, row.week.id), eq(result.revision, row.week.resultRevision)))
  const top = rows
    .filter((r) => r.position !== null && r.position <= 3)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.title < b.title ? -1 : 1))
    .slice(0, 3)
  const people = top.length
    ? await db
        .select({
          id: user.id,
          username: user.username,
          displayUsername: user.displayUsername,
          name: user.name,
        })
        .from(user)
        .where(
          inArray(
            user.id,
            top.map((r) => r.userId),
          ),
        )
    : []
  const names = new Map(people.map((p) => [p.id, nameOf(p)]))
  return {
    kind: 'results',
    slug,
    number: row.week.number,
    sampleTitle: row.sampleTitle,
    podium: top.map((r) => ({
      position: r.position as number,
      title: r.title,
      producer: names.get(r.userId) ?? null,
    })),
    empty: rows.length === 0,
    corrected: row.week.resultRevision > 1,
  }
}

async function profileData(db: Db, username: string): Promise<OgData | null> {
  const [person] = await db
    .select({
      id: user.id,
      username: user.username,
      displayUsername: user.displayUsername,
      name: user.name,
      banned: user.banned,
    })
    .from(user)
    .where(eq(user.username, username.toLowerCase()))
  // Como el perfil público: una cuenta bloqueada no tiene página (§2.3).
  if (!person?.username || person.banned) return null
  // Solo semanas selladas: una abierta y ciega no puede decir quién participa.
  const rows = await db
    .select({ position: result.position, revision: result.revision, current: week.resultRevision })
    .from(entry)
    .innerJoin(week, and(eq(week.id, entry.weekId), isNotNull(week.sealedAt)))
    .innerJoin(result, and(eq(result.entryId, entry.id), eq(result.weekId, week.id)))
    .where(eq(entry.userId, person.id))
  const current = rows.filter((r) => r.revision === r.current)
  const positions = current.map((r) => r.position).filter((p): p is number => p !== null)
  return {
    kind: 'profile',
    username: person.username,
    displayName: nameOf(person),
    weeks: current.length,
    podiums: positions.filter((p) => p <= 3).length,
    best: positions.length ? Math.min(...positions) : null,
  }
}

/** Los datos de una imagen OG, o `null` si no existe o aún no se puede enseñar. */
export function ogData(db: Db, kind: OgKind, id: string, now: number): Promise<OgData | null> {
  switch (kind) {
    case 'week':
      return weekData(db, id, now)
    case 'entry':
      return entryData(db, id, now)
    case 'results':
      return resultsData(db, id)
    case 'profile':
      return profileData(db, id)
  }
}

/** La versión de una imagen: cambia cuando cambia lo que enseña. */
export const ogVersion = (data: OgData) =>
  createHash('sha256').update(JSON.stringify(data)).digest('base64url').slice(0, 12)

/** El identificador de la imagen en su URL. */
const ogId = (data: OgData) =>
  data.kind === 'week' || data.kind === 'results'
    ? data.slug
    : data.kind === 'entry'
      ? data.id
      : data.username

/** La ruta versionada de la imagen OG de unos datos (la ponen los metadatos de `share`, tarea 6.12). */
export const ogImagePath = (data: OgData) => `/api/og/${data.kind}/${ogId(data)}.png?v=${ogVersion(data)}`
