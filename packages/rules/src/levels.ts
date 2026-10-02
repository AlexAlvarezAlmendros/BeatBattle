// Niveles, rangos y bonus de racha (guía §2.10, Anexo B, Anexo G). El nivel es una función pura
// del XP total (`RF-GAME-02`); el XP nunca influye en la clasificación (`RF-GAME-10`).
//
// El libro de XP (`xpFor`) y el cálculo de la racha con comodín (`streakOf`) llegan en la Fase 7.

import {
  LEVEL_CURVE_BASE_XP,
  LEVEL_CURVE_EXPONENT,
  LEVEL_MAX,
  LEVEL_MIN,
  LEVEL_XP_ROUNDING_STEP,
  RANK_LADDER,
  type RankId,
  type RankStep,
  STREAK_BONUS_FROM_WEEK,
  STREAK_BONUS_MAX_PERCENT,
  STREAK_BONUS_STEP_PERCENT,
} from './balance'
import { assertFiniteAtLeast, assertIntegerInRange } from './internal/guards'

/**
 * XP acumulado necesario para el nivel `level`:
 * `xpNivel(n) = 50 · round(150 · (n − 1)^1,6 / 50)` (Anexo G).
 *
 * Ningún umbral de los niveles 1–20 cae a menos de 0,0039 pasos de un empate de redondeo (el más
 * cercano es el del nivel 8: 67,49601 pasos de 50 XP, a 0,003987 del empate), así que una diferencia
 * de un ULP en `**` entre motores no puede cambiar la tabla (el test exige un margen de 0,001).
 */
export function xpForLevel(level: number): number {
  assertIntegerInRange(level, LEVEL_MIN, LEVEL_MAX, 'level')
  const raw = LEVEL_CURVE_BASE_XP * (level - 1) ** LEVEL_CURVE_EXPONENT
  return LEVEL_XP_ROUNDING_STEP * Math.round(raw / LEVEL_XP_ROUNDING_STEP)
}

/** Umbrales de XP de cada nivel, calculados con la curva. Índice 0 = nivel 1. */
export const LEVEL_XP_THRESHOLDS: readonly number[] = Object.freeze(
  Array.from({ length: LEVEL_MAX - LEVEL_MIN + 1 }, (_, i) => xpForLevel(LEVEL_MIN + i)),
)

/** Nivel de un XP total: el mayor `n ≤ 20` con `xpNivel(n) ≤ xp` (Anexo G). */
export function levelOf(xp: number): number {
  assertFiniteAtLeast(xp, 0, 'xp')
  for (let i = LEVEL_XP_THRESHOLDS.length - 1; i > 0; i--) {
    if ((LEVEL_XP_THRESHOLDS[i] as number) <= xp) return LEVEL_MIN + i
  }
  return LEVEL_MIN
}

/** Progreso dentro del nivel actual, para la barra de XP del HUD (guía §2.10). */
export interface LevelProgress {
  readonly level: number
  /** XP acumulado con el que se alcanzó el nivel actual. */
  readonly levelXp: number
  /** XP acumulado del siguiente nivel, o `null` en el nivel máximo. */
  readonly nextLevelXp: number | null
  /** Fracción del nivel actual completada, en `[0, 1)`; `1` en el nivel máximo. */
  readonly fraction: number
}

/** Nivel y fracción completada del nivel actual para un XP total. */
export function levelProgress(xp: number): LevelProgress {
  const level = levelOf(xp)
  const levelXp = xpForLevel(level)
  if (level === LEVEL_MAX) return { level, levelXp, nextLevelXp: null, fraction: 1 }
  const nextLevelXp = xpForLevel(level + 1)
  return { level, levelXp, nextLevelXp, fraction: (xp - levelXp) / (nextLevelXp - levelXp) }
}

/** Rango de un nivel (id; el título visible sale de i18n con la clave `rank.<id>`). */
export function rankTitle(level: number): RankId {
  assertIntegerInRange(level, LEVEL_MIN, LEVEL_MAX, 'level')
  let current = RANK_LADDER[0] as RankStep
  for (const step of RANK_LADDER) {
    if (step.fromLevel <= level) current = step
  }
  return current.id
}

/**
 * Bonus de racha en puntos porcentuales enteros: `min(50, 10 · (racha − 1))` para `racha ≥ 2` y
 * `0` por debajo. Con enteros, `xp · (100 + bonus) / 100` es exacto.
 *
 * @param streakWeeks Semanas consecutivas con entrada clasificada, incluida la actual.
 */
export function streakBonusPercent(streakWeeks: number): number {
  assertIntegerInRange(streakWeeks, 0, Number.MAX_SAFE_INTEGER, 'streakWeeks')
  if (streakWeeks < STREAK_BONUS_FROM_WEEK) return 0
  const steps = streakWeeks - STREAK_BONUS_FROM_WEEK + 1
  return Math.min(STREAK_BONUS_MAX_PERCENT, STREAK_BONUS_STEP_PERCENT * steps)
}

/** Bonus de racha como fracción: `bonus = min(0,5, 0,1 · (racha − 1))` para `racha ≥ 2` (Anexo G). */
export function streakBonus(streakWeeks: number): number {
  return streakBonusPercent(streakWeeks) / 100
}
