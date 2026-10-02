import { randomBytes } from 'node:crypto'
import type { Clock } from './clock'

/** Fuente de bytes aleatorios (inyectable en tests). */
export type RandomBytes = (size: number) => Uint8Array

const MAX_TIMESTAMP = 2 ** 48 - 1
const MAX_SEQ = 0xfff
/** Retroceso del reloj a partir del cual se abandona la secuencia anterior (reloj de prueba). */
const ROLLBACK_RESET_MS = 10_000

/** Generador de uuid v7: `uuidv7(instante | reloj)`. */
export type UuidV7 = (at: number | Clock) => string

/**
 * Crea un generador de UUID versión 7 (RFC 9562 §5.7) para las claves primarias (guía §4.11):
 *
 * - 48 bits: instante en ms Unix (el del reloj inyectado, nunca `Date.now()` por su cuenta);
 * - 4 bits: versión (`7`);
 * - 12 bits (`rand_a`): contador monótono (RFC 9562 §6.2, método 1). Empieza en un valor aleatorio
 *   con el bit alto a 0 en cada milisegundo nuevo y sube de uno en uno dentro del mismo
 *   milisegundo, así los ids generados en el mismo ms también salen ordenados. Si se desborda, el
 *   instante del id avanza 1 ms (lo permite la RFC);
 * - 2 bits: variante RFC (`10`);
 * - 62 bits: aleatorios.
 *
 * Orden: dentro de un proceso, cada id es mayor que el anterior aunque el reloj retroceda un poco;
 * si retrocede más de 10 s (el reloj de prueba saltando atrás), el id lleva su propio instante.
 */
export function createUuidV7(random: RandomBytes = randomBytes): UuidV7 {
  let lastMs = -1
  let seq = 0
  return (at) => {
    let ms = typeof at === 'number' ? at : at.now()
    if (!Number.isSafeInteger(ms) || ms < 0 || ms > MAX_TIMESTAMP)
      throw new RangeError('uuidv7: el instante debe ser un entero de ms entre 0 y 2^48 − 1')

    const bytes = random(16)
    if (bytes.length < 16) throw new RangeError('uuidv7: la fuente aleatoria debe dar 16 bytes')
    if (ms > lastMs || lastMs - ms > ROLLBACK_RESET_MS) {
      // milisegundo nuevo (o el reloj de prueba ha saltado atrás): secuencia nueva en su instante
      seq = ((bytes[6]! << 8) | bytes[7]!) & 0x7ff
    } else {
      // mismo milisegundo, o un retroceso pequeño (desbordamiento previo, ajuste del reloj): se
      // sigue la secuencia del último id para no romper el orden
      ms = lastMs
      seq += 1
      if (seq > MAX_SEQ) {
        ms = lastMs + 1
        seq = 0
      }
    }
    lastMs = ms

    const b = new Uint8Array(16)
    for (let i = 0; i < 6; i++) b[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff
    b[6] = 0x70 | (seq >> 8)
    b[7] = seq & 0xff
    b[8] = 0x80 | (bytes[8]! & 0x3f)
    for (let i = 9; i < 16; i++) b[i] = bytes[i]!

    const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
}

/** Generador compartido del proceso. Uso: `uuidv7(request.now)` o `uuidv7(clock)`. */
export const uuidv7: UuidV7 = createUuidV7()

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function isUuidV7(value: unknown): value is string {
  return typeof value === 'string' && UUID_V7.test(value)
}

/** Instante (ms Unix) codificado en un uuid v7. */
export function uuidv7Time(id: string): number {
  if (!isUuidV7(id)) throw new TypeError('uuidv7Time: no es un uuid v7')
  return Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16)
}
