// Calendario de la semana (guía §2.1, §2.9, §4.12). Las fronteras son horas de pared en
// `WEEK_TIME_ZONE` (`balance.ts`) y se convierten en instantes UTC **una vez**, al programar la
// semana; la lógica de fases (`phase`) solo compara instantes y nunca hace aritmética de zonas.
//
// Una fecha de calendario (`LocalDate`) es un día en la zona de la semana, sin hora. La aritmética de
// días se hace con `Date.UTC`, que no tiene cambio de hora; la conversión entre hora de pared e
// instante, con `Intl` y la zona explícita.

import {
  type IsoWeekday,
  SUBMISSIONS_CLOSE_AT,
  VOTING_CLOSE_EXCLUSIVE_AT,
  WEEK_OPENS_AT,
  WEEK_TIME_ZONE,
  type WeeklyBoundary,
  type WeeklyWallTime,
} from './balance'
import { assertFinite, assertIntegerInRange } from './internal/guards'

const DAY_MS = 86_400_000
/** Margen para buscar el desfase de la zona a los dos lados de un cambio de hora (ninguno pasa de 12 h). */
const HALF_DAY_MS = DAY_MS / 2

/** Un día del calendario en la zona de la semana (`month` de 1 a 12). */
export interface LocalDate {
  readonly year: number
  readonly month: number
  readonly day: number
}

/** Los tres instantes de una semana, en ms UTC (`week.starts_at`, `submit_ends_at`, `vote_ends_at`). */
export interface WeekBoundaries {
  /** Drop del sample y apertura: lunes 00:00. */
  readonly startsAt: number
  /** Cierre de envíos: domingo 20:00. */
  readonly submitEndsAt: number
  /** Cierre de votos, exclusivo: el lunes 00:00:00.000 siguiente (Anexo B). */
  readonly voteEndsAt: number
}

// ─── Fechas de calendario ───────────────────────────────────────────────────────────────────────

function assertLocalDate(date: LocalDate, name: string): void {
  assertIntegerInRange(date.year, 1970, 9999, `${name}.year`)
  assertIntegerInRange(date.month, 1, 12, `${name}.month`)
  assertIntegerInRange(date.day, 1, 31, `${name}.day`)
  const back = fromEpochDay(epochDay(date))
  if (back.month !== date.month || back.day !== date.day) {
    throw new RangeError(`${name} no existe: ${formatLocalDate(date)}`)
  }
}

/** Días desde el 1970-01-01 (aritmética de calendario, sin zona). */
function epochDay(date: LocalDate): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / DAY_MS)
}

function fromEpochDay(day: number): LocalDate {
  const utc = new Date(day * DAY_MS)
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() }
}

/** Día de la semana ISO 8601 (1 = lunes … 7 = domingo). */
export function isoWeekdayOf(date: LocalDate): IsoWeekday {
  assertLocalDate(date, 'date')
  // El 1970-01-01 fue jueves (4).
  return (((((epochDay(date) + 3) % 7) + 7) % 7) + 1) as IsoWeekday
}

/** `date` más `days` días (negativo para restar). */
export function addDays(date: LocalDate, days: number): LocalDate {
  assertLocalDate(date, 'date')
  assertIntegerInRange(days, -1_000_000, 1_000_000, 'days')
  return fromEpochDay(epochDay(date) + days)
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0')

/** «2026-10-05». */
export function formatLocalDate(date: LocalDate): string {
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`
}

/** Lee «2026-10-05» (estricto: la fecha tiene que existir). */
export function parseLocalDate(text: string): LocalDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) throw new RangeError(`Fecha con formato inválido (se espera AAAA-MM-DD): ${text}`)
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  assertLocalDate(date, 'date')
  return date
}

function assertMonday(monday: LocalDate): void {
  if (isoWeekdayOf(monday) !== 1) {
    throw new RangeError(`Una semana empieza en lunes: ${formatLocalDate(monday)} no lo es`)
  }
}

// ─── Hora de pared ↔ instante ───────────────────────────────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

interface WallClock extends LocalDate {
  readonly hour: number
  readonly minute: number
  readonly second: number
}

/** La hora de pared de `instant` en `timeZone` (al segundo; los ms no cambian con la zona). */
function wallClockOf(instant: number, timeZone: string): WallClock {
  const parts: Record<string, number> = {}
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  }
}

/** Desfase de la zona en `instant`: hora de pared (como si fuera UTC) menos el instante, en ms. */
function offsetAt(instant: number, timeZone: string): number {
  const wall = wallClockOf(instant, timeZone)
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  return asUtc - (instant - (((instant % 1000) + 1000) % 1000))
}

/**
 * El instante UTC en el que la hora de pared de `timeZone` es `date` a las `time`. Si la hora se repite
 * (al atrasar el reloj) da la primera; si no existe (al adelantarlo) lanza `RangeError`. Las fronteras de
 * la semana (lunes 00:00, domingo 20:00) no caen nunca en un cambio de hora en `Europe/Madrid`.
 */
export function zonedInstant(
  date: LocalDate,
  time: Pick<WeeklyWallTime, 'hour' | 'minute' | 'second'>,
  timeZone: string = WEEK_TIME_ZONE,
): number {
  assertLocalDate(date, 'date')
  assertIntegerInRange(time.hour, 0, 23, 'hour')
  assertIntegerInRange(time.minute, 0, 59, 'minute')
  assertIntegerInRange(time.second, 0, 59, 'second')
  const asUtc = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, time.second)
  const candidates = [
    asUtc - offsetAt(asUtc - HALF_DAY_MS, timeZone),
    asUtc - offsetAt(asUtc + HALF_DAY_MS, timeZone),
  ]
  const valid = candidates.filter((instant) => offsetAt(instant, timeZone) === asUtc - instant)
  if (valid.length === 0) {
    throw new RangeError(
      `La hora ${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)} del ${formatLocalDate(date)} no existe en ${timeZone}`,
    )
  }
  return Math.min(...valid)
}

/** El día del calendario de `instant` en `timeZone`. */
export function localDateOf(instant: number, timeZone: string = WEEK_TIME_ZONE): LocalDate {
  assertFinite(instant, 'instant')
  const wall = wallClockOf(instant, timeZone)
  return { year: wall.year, month: wall.month, day: wall.day }
}

// ─── La semana ──────────────────────────────────────────────────────────────────────────────────

function boundaryInstant(monday: LocalDate, boundary: WeeklyWallTime | WeeklyBoundary, timeZone: string) {
  const weekOffset = 'weekOffset' in boundary ? boundary.weekOffset : 0
  return zonedInstant(addDays(monday, boundary.isoWeekday - 1 + 7 * weekOffset), boundary, timeZone)
}

/**
 * Las fronteras de la semana que empieza el lunes `monday` (guía §2.1, §4.12): drop el lunes a las 00:00,
 * cierre de envíos el domingo a las 20:00 y cierre de votos exclusivo el lunes siguiente a las 00:00, todo
 * en hora de pared de `timeZone`. Una semana normal dura 168 h; la del último domingo de marzo, 167, y la
 * del último de octubre, 169 (`RF-DROP-05`).
 */
export function scheduleWeek(monday: LocalDate, timeZone: string = WEEK_TIME_ZONE): WeekBoundaries {
  assertMonday(monday)
  return {
    startsAt: boundaryInstant(monday, WEEK_OPENS_AT, timeZone),
    submitEndsAt: boundaryInstant(monday, SUBMISSIONS_CLOSE_AT, timeZone),
    voteEndsAt: boundaryInstant(monday, VOTING_CLOSE_EXCLUSIVE_AT, timeZone),
  }
}

/**
 * El lunes de la semana que contiene `instant`: la semana va del lunes 00:00 (incluido) al lunes siguiente
 * a las 00:00 (excluido), en hora de pared de `timeZone`.
 */
export function mondayOf(instant: number, timeZone: string = WEEK_TIME_ZONE): LocalDate {
  const date = localDateOf(instant, timeZone)
  return addDays(date, 1 - isoWeekdayOf(date))
}

/** El primer lunes estrictamente posterior a `instant` (el drop siguiente). */
export function nextMonday(instant: number, timeZone: string = WEEK_TIME_ZONE): LocalDate {
  return addDays(mondayOf(instant, timeZone), 7)
}

/** Año y número de la semana ISO 8601 del lunes `monday`: la semana es del año de su jueves. */
function isoWeekOf(monday: LocalDate): { year: number; week: number } {
  assertMonday(monday)
  const thursday = addDays(monday, 3)
  const firstOfYear = epochDay({ year: thursday.year, month: 1, day: 1 })
  return { year: thursday.year, week: Math.floor((epochDay(thursday) - firstOfYear) / 7) + 1 }
}

/** Semana ISO del lunes `monday` («2026-W41»): la pantalla de título la enseña (§3.8.1). */
export function isoWeekLabel(monday: LocalDate): string {
  const { year, week } = isoWeekOf(monday)
  return `${pad(year, 4)}-W${pad(week)}`
}

/** Slug de la semana en la URL y en la BD (`week.slug`, «2026-w41»). */
export function weekSlug(monday: LocalDate): string {
  return isoWeekLabel(monday).toLowerCase()
}

/** Lee un slug de semana («2026-w41») y devuelve su lunes; lanza `RangeError` si la semana no existe. */
export function mondayOfSlug(slug: string): LocalDate {
  const match = /^(\d{4})-w(\d{2})$/.exec(slug)
  if (!match) throw new RangeError(`Slug de semana con formato inválido (se espera aaaa-wNN): ${slug}`)
  const year = Number(match[1])
  const week = Number(match[2])
  assertIntegerInRange(year, 1970, 9999, 'year')
  // El 4 de enero siempre cae en la semana 1 del año ISO.
  const january4 = { year, month: 1, day: 4 }
  const monday = addDays(january4, 1 - isoWeekdayOf(january4) + 7 * (week - 1))
  if (week < 1 || weekSlug(monday) !== slug) throw new RangeError(`La semana ${slug} no existe`)
  return monday
}

/**
 * Temporada de la semana (guía §2.9, `week.season_id`): una por trimestre natural, la del **lunes** de la
 * semana («2026-T4»). Una semana que cruza el año pertenece al del lunes, aunque su semana ISO sea la 1
 * del siguiente.
 */
export function seasonOf(monday: LocalDate): string {
  assertMonday(monday)
  return `${pad(monday.year, 4)}-T${Math.floor((monday.month - 1) / 3) + 1}`
}
