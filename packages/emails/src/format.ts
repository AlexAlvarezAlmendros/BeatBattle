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
