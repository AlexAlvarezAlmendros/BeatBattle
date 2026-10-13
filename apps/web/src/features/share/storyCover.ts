import type { PublicEntry } from '@beatbattle/shared'

/** La portada generativa de una entrada para su tarjeta (la semilla, nunca el id de la cuenta). */
export const storyCover = (entry: PublicEntry) => ({
  seed: entry.cover.kind === 'generative' ? entry.cover.seed : entry.id,
  bpm: entry.bpm,
  musicalKey: entry.musicalKey,
})
