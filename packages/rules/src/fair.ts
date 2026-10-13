// Órdenes de la lista de entradas y cola del Modo Jurado (guía §2.6, §2.7, §4.5).
//
// - **Ronda justa** (`fairOrder`, el orden por defecto durante la semana, `RF-PLAY-04`): primero lo que
//   quien mira no ha votado; dentro, lo que menos votos lleva (el número nunca se muestra); a igualdad, un
//   barajado estable por usuario y semana (`hash(userId, weekId, entryId)`) o, para los visitantes, por día.
// - **Recién subidas** (`newestOrder`) y **Aleatorio** (`randomOrder`). No hay «mejor valoradas» antes del
//   sellado: ningún orden de este módulo mira las estrellas.
// - **Cola del jurado** (`juryQueue`, `RF-VOTE-09`): las activas, ajenas y sin votar, en Ronda justa; las
//   saltadas pasan al final en el orden en que se saltaron.
//
// Todo es determinista e independiente del orden de entrada: la misma semana da la misma lista en el
// servidor y en el cliente.

import { formatLocalDate, localDateOf } from './calendar'
import { hashOf, rngFor, type SeedPart } from './prng'

/** Lo mínimo de una entrada para ordenarla. */
export interface OrderableEntry {
  readonly id: string
}

/** Votos (en total, de todo el mundo) por id de entrada. Lo que no está cuenta como 0. */
export type VoteCounts = ReadonlyMap<string, number> | Readonly<Record<string, number>>

/**
 * Semilla del barajado de Ronda justa: con sesión, el usuario y la semana; sin ella, el día (Madrid) y la
 * semana, para que un visitante vea el mismo orden durante el día y no el de otro usuario.
 */
export function fairSeed(weekId: string, viewer: { userId: string } | { nowMs: number }): SeedPart[] {
  return 'userId' in viewer
    ? ['fair', 'user', viewer.userId, weekId]
    : ['fair', 'day', formatLocalDate(localDateOf(viewer.nowMs)), weekId]
}

function countOf(votes: VoteCounts, id: string): number {
  const value = votes instanceof Map ? votes.get(id) : (votes as Readonly<Record<string, number>>)[id]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** Desempate estable: el hash con la semilla y, si dos chocan, el id (nunca el orden de llegada). */
function byTieBreak<T extends OrderableEntry>(seed: readonly SeedPart[]) {
  const keys = new Map<string, number>()
  const key = (id: string) => {
    let value = keys.get(id)
    if (value === undefined) {
      value = hashOf(...seed, id)
      keys.set(id, value)
    }
    return value
  }
  return (a: T, b: T) => key(a.id) - key(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Ronda justa (`RF-PLAY-04`): sin votar por quien mira → menos votos → barajado estable con `seed`
 * (`fairSeed`). Las ya votadas van al final con el mismo criterio. Devuelve una copia.
 */
export function fairOrder<T extends OrderableEntry>(
  entries: readonly T[],
  votes: VoteCounts,
  votedByViewer: Iterable<string>,
  seed: readonly SeedPart[],
): T[] {
  const voted = new Set(votedByViewer)
  const tie = byTieBreak<T>(seed)
  return entries.slice().sort((a, b) => {
    const seen = Number(voted.has(a.id)) - Number(voted.has(b.id))
    return seen || countOf(votes, a.id) - countOf(votes, b.id) || tie(a, b)
  })
}

/** Recién subidas: la última primero; a igualdad, por id. Devuelve una copia. */
export function newestOrder<T extends OrderableEntry & { readonly submittedAt: number }>(
  entries: readonly T[],
): T[] {
  return entries
    .slice()
    .sort((a, b) => b.submittedAt - a.submittedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Aleatorio: un barajado con semilla, igual para la misma semilla sea cual sea el orden de llegada (se
 * baraja la lista ordenada por id). Devuelve una copia.
 */
export function randomOrder<T extends OrderableEntry>(entries: readonly T[], seed: readonly SeedPart[]): T[] {
  const sorted = entries.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return rngFor('random', ...seed).shuffle(sorted)
}

/** Lo que la cola del jurado deja fuera o manda al final. */
export interface JuryQueueOptions {
  /** Entradas que no se pueden votar: la propia (y lo que el servidor excluya). */
  readonly excluded?: Iterable<string>
  /** Saltadas en esta sesión, en el orden en que se saltaron: van al final. */
  readonly skipped?: readonly string[]
}

/**
 * Cola del Modo Jurado (`RF-VOTE-09`): sin las votadas ni las excluidas, en Ronda justa, con las saltadas
 * al final en el orden en que se saltaron (saltar dos veces la misma la manda al final otra vez).
 */
export function juryQueue<T extends OrderableEntry>(
  entries: readonly T[],
  votes: VoteCounts,
  votedByViewer: Iterable<string>,
  seed: readonly SeedPart[],
  options: JuryQueueOptions = {},
): T[] {
  const voted = new Set(votedByViewer)
  const excluded = new Set(options.excluded ?? [])
  const pending = fairOrder(
    entries.filter((entry) => !voted.has(entry.id) && !excluded.has(entry.id)),
    votes,
    [],
    seed,
  )
  // El último salto de cada entrada es el que cuenta.
  const skipRank = new Map<string, number>()
  for (const [i, id] of (options.skipped ?? []).entries()) skipRank.set(id, i)
  const fresh = pending.filter((entry) => !skipRank.has(entry.id))
  const later = pending
    .filter((entry) => skipRank.has(entry.id))
    .sort((a, b) => (skipRank.get(a.id) ?? 0) - (skipRank.get(b.id) ?? 0))
  return [...fresh, ...later]
}
