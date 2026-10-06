// Umbral de escucha (guía §2.7, Anexo G): para votar una entrada hay que haberla escuchado **entera**,
// salvo el último segundo (`RF-VOTE-04`). Es fricción contra el voto a ciegas: el cliente cuenta el tiempo
// distinto realmente reproducido (los saltos con la onda no cuentan, y repetir un trozo no suma dos
// veces) y el servidor comprueba el tiempo de reloj.

import { LISTEN_END_TOLERANCE_MS } from './balance'
import { assertFiniteAtLeast } from './internal/guards'

/** Milisegundos de escucha necesarios para votar: `max(0, duracionMs − 1 000)`. */
export function listenThresholdMs(durationMs: number): number {
  assertFiniteAtLeast(durationMs, 0, 'durationMs')
  return Math.max(0, Math.round(durationMs) - LISTEN_END_TOLERANCE_MS)
}

/** `true` si `listenedMs` cumple el umbral de escucha de una entrada de `durationMs`. */
export function isListenThresholdMet(listenedMs: number, durationMs: number): boolean {
  assertFiniteAtLeast(listenedMs, 0, 'listenedMs')
  return listenedMs >= listenThresholdMs(durationMs)
}
