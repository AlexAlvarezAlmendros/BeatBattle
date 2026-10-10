/** Fecha y hora de Madrid para los emails («8 de octubre de 2026, 13:20»). */
export function madridDateTime(ms: number): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ms)
}

/** Número de carta con cuatro cifras («#0042»). */
export const cardNumber = (n: number) => `#${String(n).padStart(4, '0')}`

const TONIC_NAMES: Record<string, string> = {
  C: 'Do',
  'C#': 'Do sostenido',
  D: 'Re',
  'D#': 'Re sostenido',
  E: 'Mi',
  F: 'Fa',
  'F#': 'Fa sostenido',
  G: 'Sol',
  'G#': 'Sol sostenido',
  A: 'La',
  'A#': 'La sostenido',
  B: 'Si',
}

/** Tonalidad en palabras («Dm» → «Re menor», «F#» → «Fa sostenido mayor»), como la dice la interfaz (§3.2). */
export function musicalKeyName(key: string): string {
  const minor = key.endsWith('m')
  const tonic = TONIC_NAMES[minor ? key.slice(0, -1) : key] ?? key
  return `${tonic} ${minor ? 'menor' : 'mayor'}`
}

/** Corta un texto a `max` caracteres con «…» (los asuntos caben en 50, §3.8.12). */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

/** Espacio de no separación entre una cifra y su unidad («58,4 MB»). */
const NBSP = ' '
/** Signo menos tipográfico («−9,2»), como en la interfaz. */
const MINUS = '−'

/** Número con coma decimal y `digits` decimales, con el signo menos tipográfico. */
export function decimal(value: number, digits = 1): string {
  const text = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(Math.abs(value))
  const rounded = Number(value.toFixed(digits))
  return rounded < 0 ? `${MINUS}${text}` : text
}

/** Con su signo siempre («+0,4», «−0,3»): el pico real. */
export const signed = (value: number, digits = 1) =>
  Number(value.toFixed(digits)) > 0 ? `+${decimal(value, digits)}` : decimal(value, digits)

/** Duración «m:ss» (como la interfaz). */
export function duration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const MIB = 1024 * 1024

/** Tamaño de un archivo en MB con un decimal («58,4 MB»), como la interfaz (`entryFile.ts`). */
export function megabytes(bytes: number): string {
  return `${decimal(Math.ceil((bytes / MIB) * 10) / 10)}${NBSP}MB`
}

/** Una cifra con su unidad, unidas («140 BPM», «−9,2 LUFS»). */
export const withUnit = (value: string | number, unit: string) => `${value}${NBSP}${unit}`

/** Día y hora de Madrid en palabras («domingo 11 de octubre a las 20:00»). */
export function madridWhen(ms: number): string {
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ms)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('weekday')} ${part('day')} de ${part('month')} a las ${part('hour')}:${part('minute')}`
}

/** Hora exacta de Madrid, con segundos (la recepción del recibo: «8 de octubre de 2026 a las 13:20:14»). */
export function madridExact(ms: number): string {
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ms)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('day')} de ${part('month')} de ${part('year')} a las ${part('hour')}:${part('minute')}:${part('second')}`
}
