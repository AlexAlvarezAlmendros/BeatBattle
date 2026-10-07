// Umbral de escucha (guía §2.7, Anexo G): para votar una entrada hay que haber escuchado 30 s de ella (o
// la entrada entera, si dura menos) (`RF-VOTE-04`). Es fricción contra el voto a ciegas: el cliente cuenta
// el tiempo realmente reproducido (los saltos con la onda no cuentan) y el servidor comprueba el tiempo de
// reloj.

import { LISTEN_THRESHOLD_MS } from './balance'
import { assertFiniteAtLeast } from './internal/guards'

/** Milisegundos de escucha necesarios para votar: `min(30 000, round(duracionMs))`. */
export function listenThresholdMs(durationMs: number): number {
  assertFiniteAtLeast(durationMs, 0, 'durationMs')
  return Math.min(LISTEN_THRESHOLD_MS, Math.round(durationMs))
}

/** `true` si `listenedMs` cumple el umbral de escucha de una entrada de `durationMs`. */
export function isListenThresholdMet(listenedMs: number, durationMs: number): boolean {
  assertFiniteAtLeast(listenedMs, 0, 'listenedMs')
  return listenedMs >= listenThresholdMs(durationMs)
}
