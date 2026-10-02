// PRNG determinista de las reglas (guía §4.5): semilla de texto → hash → sfc32.
//
// - `hash32` (cyrb53) y `seedState` (cyrb128) son hashes de cadenas estables entre motores y
//   versiones: trabajan sobre unidades UTF-16 con aritmética entera de 32 bits (`Math.imul`).
// - `sfc32` (Chris Doty-Humphrey, PractRand) es rápido, tiene 128 bits de estado y pasa PractRand.
// - `rngFor(...partes)` crea flujos con nombre: el barajado de una semana no depende del orden en
//   que se consumen otros flujos (`rngFor('fair', userId, weekId)`).
//
// Cambiar cualquiera de estos algoritmos cambia órdenes y alias ya publicados: los tests fijan
// valores de referencia para que un cambio así no pase desapercibido.

import { assertIntegerInRange } from './internal/guards'

/** Parte de una semilla con nombre: ids, etiquetas o números enteros o finitos. */
export type SeedPart = string | number

/** Estado de 128 bits de sfc32: cuatro enteros sin signo de 32 bits. */
export type SfcState = readonly [number, number, number, number]

const UINT32_RANGE = 2 ** 32
/** Pasos que se descartan al sembrar, para separar flujos con semillas parecidas. */
const WARM_UP_STEPS = 12

/**
 * cyrb53 (bryc, dominio público): hash de 53 bits de una cadena, estable y con buena dispersión.
 * Devuelve un entero seguro en `[0, 2^53)`.
 */
export function cyrb53(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** Hash estable de 32 bits de una cadena (los 32 bits bajos de cyrb53). Entero en `[0, 2^32)`. */
export function hash32(text: string, seed = 0): number {
  return cyrb53(text, seed) % UINT32_RANGE
}

/** cyrb128 (bryc, dominio público): estado de 128 bits para sembrar sfc32 a partir de una cadena. */
export function seedState(text: string): SfcState {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

/**
 * sfc32: generador de enteros sin signo de 32 bits a partir de un estado de 128 bits.
 * Cada llamada a la función devuelta avanza el estado y devuelve un entero en `[0, 2^32)`.
 */
export function sfc32(state: SfcState): () => number {
  let [a, b, c, d] = state
  return () => {
    a |= 0
    b |= 0
    c |= 0
    d |= 0
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0
    return t >>> 0
  }
}

/**
 * Codifica partes de semilla sin ambigüedad (cada parte lleva delante su longitud), de modo que
 * `('ab', 'c')` y `('a', 'bc')` dan claves distintas. Los números se escriben con `String(n)`:
 * `1` y `'1'` son la misma parte.
 */
export function seedKey(...parts: readonly SeedPart[]): string {
  return parts
    .map((part) => {
      if (typeof part === 'number' && !Number.isFinite(part)) {
        throw new RangeError(`Una parte de semilla numérica debe ser finita (recibido: ${part})`)
      }
      const text = String(part)
      return `${text.length}:${text}`
    })
    .join('|')
}

/** Hash estable de 32 bits de varias partes, p. ej. `hashOf(userId, weekId, entryId)` (guía §2.6). */
export function hashOf(...parts: readonly SeedPart[]): number {
  return hash32(seedKey(...parts))
}

/** Generador pseudoaleatorio determinista. Mismo origen → misma secuencia, en cualquier motor. */
export interface Rng {
  /** Real uniforme en `[0, 1)`. */
  next(): number
  /** Entero sin signo de 32 bits, uniforme en `[0, 2^32)`. */
  nextUint32(): number
  /** Entero uniforme en `[min, max]`, ambos incluidos, sin sesgo de módulo. */
  int(min: number, max: number): number
  /** Un elemento uniforme de una lista no vacía. */
  pick<T>(items: readonly T[]): T
  /** Copia barajada con Fisher–Yates; la lista original no cambia. */
  shuffle<T>(items: readonly T[]): T[]
}

/** Crea un generador a partir de un estado sfc32 explícito (con calentamiento). */
function rngFromState(state: SfcState): Rng {
  const nextUint32 = sfc32(state)
  for (let i = 0; i < WARM_UP_STEPS; i++) nextUint32()

  const int = (min: number, max: number): number => {
    assertIntegerInRange(min, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 'min')
    assertIntegerInRange(max, min, Number.MAX_SAFE_INTEGER, 'max')
    const span = max - min + 1
    if (span > UINT32_RANGE) {
      throw new RangeError(`El rango de int() no puede superar 2^32 valores (recibido: ${span})`)
    }
    // Muestreo por rechazo: se descartan los valores del último tramo incompleto para que todos
    // los resultados tengan exactamente la misma probabilidad.
    const limit = UINT32_RANGE - (UINT32_RANGE % span)
    let x = nextUint32()
    while (x >= limit) x = nextUint32()
    return min + (x % span)
  }

  return {
    next: () => nextUint32() / UINT32_RANGE,
    nextUint32,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('pick() necesita una lista no vacía')
      return items[int(0, items.length - 1)] as T
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i)
        const tmp = out[i] as T
        out[i] = out[j] as T
        out[j] = tmp
      }
      return out
    },
  }
}

/** Crea un generador a partir de una semilla (`String(semilla)` → cyrb128 → sfc32). */
export function createRng(seed: SeedPart): Rng {
  if (typeof seed === 'number' && !Number.isFinite(seed)) {
    throw new RangeError(`La semilla numérica debe ser finita (recibido: ${seed})`)
  }
  return rngFromState(seedState(String(seed)))
}

/**
 * Flujo con nombre: un generador independiente por cada combinación de partes, p. ej.
 * `rngFor('alias', weekId)` o `rngFor('fair', userId, weekId)`. Necesita al menos una parte.
 */
export function rngFor(...parts: readonly SeedPart[]): Rng {
  if (parts.length === 0) throw new RangeError('rngFor() necesita al menos una parte de semilla')
  return rngFromState(seedState(seedKey(...parts)))
}
