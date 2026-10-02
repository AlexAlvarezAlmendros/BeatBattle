// Umbral de escucha (guía §2.7, Anexo G): hay que haber escuchado `min(45 s, 50 % de la duración)`
// de una entrada para poder votarla (`RF-VOTE-04`). Es fricción contra el voto a ciegas: el
// cliente cuenta el tiempo realmente reproducido y el servidor comprueba el tiempo de reloj.

import { LISTEN_THRESHOLD_DURATION_PERCENT, LISTEN_THRESHOLD_MAX_MS } from './balance'
import { assertFiniteAtLeast } from './internal/guards'

/** Milisegundos de escucha necesarios para votar: `min(45 000, round(duracionMs / 2))`. */
export function listenThresholdMs(durationMs: number): number {
  assertFiniteAtLeast(durationMs, 0, 'durationMs')
  const share = Math.round((durationMs * LISTEN_THRESHOLD_DURATION_PERCENT) / 100)
  return Math.min(LISTEN_THRESHOLD_MAX_MS, share)
}

/** `true` si `listenedMs` cumple el umbral de escucha de una entrada de `durationMs`. */
export function isListenThresholdMet(listenedMs: number, durationMs: number): boolean {
  assertFiniteAtLeast(listenedMs, 0, 'listenedMs')
  return listenedMs >= listenThresholdMs(durationMs)
}
