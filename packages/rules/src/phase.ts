// Fase de una semana (guía §2.1, §4.5). Se **deriva** de sus instantes y de `now`; nunca se guarda en
// un campo que pueda quedarse viejo (`RF-DROP-01`). El único dato que no es un instante programado es
// `sealedAt`: lo pone el sellado y separa `sealing` de `sealed`.

import { LAST_HOUR_MS } from './balance'
import type { WeekBoundaries } from './calendar'
import { assertFinite } from './internal/guards'

/** Fases de la tabla de §2.1. */
export type WeekPhase = 'scheduled' | 'open' | 'voting' | 'sealing' | 'sealed'

/** Lo que hace falta de una semana para saber su fase (las columnas de `week`). */
export interface WeekTimes extends WeekBoundaries {
  /** Instante del sellado, o `null` si aún no se ha sellado. */
  readonly sealedAt: number | null
}

function assertWeekTimes(week: WeekTimes): void {
  assertFinite(week.startsAt, 'startsAt')
  assertFinite(week.submitEndsAt, 'submitEndsAt')
  assertFinite(week.voteEndsAt, 'voteEndsAt')
  // La misma regla que el `CHECK` de la tabla `week` (§4.11).
  if (!(week.startsAt < week.submitEndsAt && week.submitEndsAt <= week.voteEndsAt)) {
    throw new RangeError('La semana necesita startsAt < submitEndsAt ≤ voteEndsAt')
  }
  if (week.sealedAt !== null) assertFinite(week.sealedAt, 'sealedAt')
}

/**
 * Fase de `week` en el instante `now` (§2.1). Las fronteras son de intervalo semiabierto: en
 * `startsAt` la semana ya está `open`, en `submitEndsAt` ya está `voting` y en `voteEndsAt` ya no se
 * vota. Pasado el cierre, la semana está `sealing` hasta que el sellado pone `sealedAt` (sea perezoso o
 * del cron, `RF-DROP-03`), y después `sealed` para siempre.
 */
export function phaseOf(week: WeekTimes, now: number): WeekPhase {
  assertWeekTimes(week)
  assertFinite(now, 'now')
  if (now < week.startsAt) return 'scheduled'
  if (now < week.submitEndsAt) return 'open'
  if (now < week.voteEndsAt) return 'voting'
  return week.sealedAt === null ? 'sealing' : 'sealed'
}

/** Se puede subir o editar una entrada: solo en `open`. */
export function canSubmit(week: WeekTimes, now: number): boolean {
  return phaseOf(week, now) === 'open'
}

/** Se puede votar: en `open` y en `voting` (envíos y votos van a la vez, §2.1). */
export function canVote(week: WeekTimes, now: number): boolean {
  const phase = phaseOf(week, now)
  return phase === 'open' || phase === 'voting'
}

/**
 * Se puede descargar el sample: solo en `open`, mientras se puede subir algo hecho con él (§2.1:
 * en `voting` solo se escucha y se vota). Escucharlo se puede siempre que la semana sea pública.
 */
export function canDownload(week: WeekTimes, now: number): boolean {
  return phaseOf(week, now) === 'open'
}

/** La cuenta atrás de la semana (`RF-DROP-10`). */
export interface WeekCountdown {
  /** Qué cierra: los envíos (fase `open`) o los votos (fase `voting`). */
  readonly closes: 'submissions' | 'votes'
  /** Instante del cierre, en ms UTC. */
  readonly target: number
  /** Lo que falta, en ms (siempre > 0). */
  readonly remainingMs: number
  /** «Hora loca»: falta `LAST_HOUR_MS` o menos (§3.3, §3.6). */
  readonly lastHour: boolean
}

/**
 * Cuenta atrás hasta el cierre de envíos (en `open`) o de votos (en `voting`); `null` en las demás fases.
 * El redondeo al segundo es de quien la pinta: el reloj de ronda redondea hacia arriba (con 59 min 59 s
 * por delante enseña `00:00:59:59`).
 */
export function countdownOf(week: WeekTimes, now: number): WeekCountdown | null {
  const phase = phaseOf(week, now)
  if (phase !== 'open' && phase !== 'voting') return null
  const target = phase === 'open' ? week.submitEndsAt : week.voteEndsAt
  const remainingMs = target - now
  return {
    closes: phase === 'open' ? 'submissions' : 'votes',
    target,
    remainingMs,
    lastHour: remainingMs <= LAST_HOUR_MS,
  }
}
