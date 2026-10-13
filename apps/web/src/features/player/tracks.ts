import type { PublicEntry } from '@beatbattle/shared'
import { decodePeaks } from '../week/weekModel'
import type { PlayerTrack } from './store'

/**
 * La pista del reproductor de una entrada (tarea 5.16). Ciega mientras no traiga productor (`RD-MOT-06`); el
 * artista es el alias o, revelada, el productor. `votable`: ajena y con las votaciones abiertas (el recibo
 * de escucha solo se pide entonces, `features/player/listen`).
 */
export function entryTrack(entry: PublicEntry, { votable }: { votable: boolean }): PlayerTrack {
  return {
    id: entry.id,
    kind: 'entry',
    title: entry.title,
    artist: entry.producer ? entry.producer.displayName : entry.alias,
    streamUrl: entry.streamUrl,
    durationMs: entry.durationMs,
    gainDb: entry.gainDb,
    artworkUrl: entry.cover.kind === 'own' ? entry.cover.url : null,
    cover:
      entry.cover.kind === 'own'
        ? { kind: 'url', url: entry.cover.url }
        : { kind: 'generative', seed: entry.cover.seed, bpm: entry.bpm, musicalKey: entry.musicalKey },
    peaks: entry.peaks ? decodePeaks(entry.peaks) : null,
    blind: entry.producer === null,
    weekSlug: entry.weekSlug,
    votable,
  }
}
