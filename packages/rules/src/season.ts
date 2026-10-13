// Puntos de temporada (guía §2.9, Anexo B): 25, 18, 15, 12, 10, 8, 6, 4, 2, 1 del 1.º al 10.º y 1
// por cada entrada clasificada fuera del top 10. La clasificación de la temporada con sus
// desempates (`seasonStandings`) llega en la Fase 7; la temporada de una semana (`seasonOf`) está en
// `calendar`.

import { SEASON_POINTS_BY_POSITION, SEASON_POINTS_QUALIFIED_OUTSIDE_TOP } from './balance'
import { assertIntegerInRange } from './internal/guards'

/**
 * Puntos de temporada de una entrada en su semana.
 *
 * @param position Posición en la clasificación semanal (1 = primera). En un ex aequo, todas las
 *   entradas empatadas comparten posición y reciben los mismos puntos (guía §2.8).
 * @param qualified `true` si la entrada clasificó (≥ `PODIUM_MIN_VOTES` votos válidos). Una entrada
 *   sin clasificar no suma puntos.
 */
export function seasonPoints(position: number, qualified: boolean): number {
  assertIntegerInRange(position, 1, Number.MAX_SAFE_INTEGER, 'position')
  if (!qualified) return 0
  return SEASON_POINTS_BY_POSITION[position - 1] ?? SEASON_POINTS_QUALIFIED_OUTSIDE_TOP
}
