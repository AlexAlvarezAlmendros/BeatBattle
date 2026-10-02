/**
 * Formato de fechas y números (guía §4.7.8 y §3.9): siempre en castellano de España y en hora de
 * Madrid, sea cual sea la zona del navegador. Los instantes viajan como UTC en ms (CLAUDE.md, «Tiempo»).
 */

export const LOCALE = 'es-ES'
export const TIME_ZONE = 'Europe/Madrid'

/** Opciones de `Intl.DateTimeFormat` salvo la zona, que es siempre la de Madrid. */
export type DateFormatOptions = Omit<Intl.DateTimeFormatOptions, 'timeZone'>

/** Formatos frecuentes, para no repetir opciones por la app. */
export const DATE_FORMATS = {
  /** «11 de octubre de 2026» */
  date: { day: 'numeric', month: 'long', year: 'numeric' },
  /** «domingo 11, 20:00» (para cierres: «cierra el domingo 11 a las 20:00» se compone en i18n) */
  weekdayTime: { weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  /** «20:00» */
  time: { hour: '2-digit', minute: '2-digit' },
  /** «domingo, 11 de octubre de 2026, 20:00» */
  full: { dateStyle: 'full', timeStyle: 'short' },
} as const satisfies Record<string, DateFormatOptions>

const dateFormatters = new Map<string, Intl.DateTimeFormat>()
const numberFormatters = new Map<string, Intl.NumberFormat>()

/** Fecha y hora de un instante (UTC en ms) en hora de Madrid. Por defecto, «11 de octubre de 2026». */
export function formatDate(ms: number, options: DateFormatOptions = DATE_FORMATS.date): string {
  if (!Number.isFinite(ms)) throw new RangeError(`formatDate: instante no válido (${ms})`)
  const key = JSON.stringify(options)
  let formatter = dateFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: TIME_ZONE })
    dateFormatters.set(key, formatter)
  }
  return formatter.format(ms)
}

/**
 * Número en castellano: «12.345,6». Ojo: la norma (RAE y CLDR) no separa los miles en cifras de
 * cuatro dígitos, así que 1000 sale «1000» y 10000, «10.000».
 */
export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  const key = JSON.stringify(options)
  let formatter = numberFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, options)
    numberFormatters.set(key, formatter)
  }
  return formatter.format(value)
}
