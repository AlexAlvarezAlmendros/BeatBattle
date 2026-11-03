import { mondayOf, seasonOf } from '@beatbattle/rules'
import type { EntryProducer } from '@beatbattle/shared'
import { t } from '../../i18n'

/**
 * Temporadas en la web (guía §2.9; tareas 7.25 y 7.26): leer y nombrar su id («2026-T4» → «T4 de 2026»), la anterior
 * y la siguiente, y la temporada en curso (la del lunes de hoy: la semana del 28 de diciembre sigue en la T4, §2.10).
 */

export interface SeasonParts {
  year: number
  quarter: 1 | 2 | 3 | 4
}

/** Lee una temporada de la URL («2026-T4», también «2026-t4»); `null` si no lo es. */
export function parseSeason(id: string): SeasonParts | null {
  const match = /^(\d{4})-[Tt]([1-4])$/.exec(id)
  if (!match) return null
  return { year: Number(match[1]), quarter: Number(match[2]) as SeasonParts['quarter'] }
}

/** El id canónico («2026-T4»). */
export const seasonId = ({ year, quarter }: SeasonParts) => `${String(year).padStart(4, '0')}-T${quarter}`

/** «T4 de 2026». */
export function seasonLabel(id: string): string {
  const parts = parseSeason(id)
  return parts ? t('season.label', { quarter: parts.quarter, year: parts.year }) : id
}

/** La temporada anterior o la siguiente (`step` = −1 o +1). */
export function shiftSeason(id: string, step: number): string | null {
  const parts = parseSeason(id)
  if (!parts) return null
  const index = parts.year * 4 + (parts.quarter - 1) + step
  return seasonId({ year: Math.floor(index / 4), quarter: ((index % 4) + 1) as SeasonParts['quarter'] })
}

/** La temporada en curso: la del lunes de hoy, en hora de Madrid. */
export const currentSeason = (now: number = Date.now()) => seasonOf(mondayOf(now))

/** El nombre de un productor de una fila pública; `null` = «Productor eliminado» (`RF-PRF-04`). */
export const producerName = (producer: EntryProducer | null) =>
  producer?.displayName ?? t('results.deletedProducer')
