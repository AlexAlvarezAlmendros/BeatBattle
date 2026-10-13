// Alias de batalla (guía §2.7 `RF-VOTE-08`, Anexo I) y otros identificadores derivados de una entrada:
// el número de recibo (§2.12.1) y la semilla de su portada generativa (§3.4.5).
//
// El alias es un sustantivo y un adjetivo que concuerda con su género («Tigre Púrpura», «Pantera
// Dorada»). Sale de un hash del id de la entrada y, si ya está ocupado en la semana, del siguiente libre
// en un recorrido que visita todas las combinaciones: el mismo id con los mismos ocupados da siempre el
// mismo alias, y dos entradas de la misma semana nunca comparten alias.
//
// Cambiar las listas o su orden cambia los alias que se asignen después (los ya guardados en
// `entry.alias` no cambian): los tests fijan valores de referencia para que no pase sin querer.

import { assertIntegerInRange } from './internal/guards'
import { hashOf } from './prng'

/** Un sustantivo del alias con su género gramatical (decide la forma del adjetivo). */
export interface AliasNoun {
  readonly word: string
  readonly gender: 'm' | 'f'
}

/** Un adjetivo del alias en masculino y femenino (iguales si es invariable: «Púrpura», «Salvaje»). */
export interface AliasAdjective {
  readonly m: string
  readonly f: string
}

const noun = (word: string, gender: 'm' | 'f'): AliasNoun => ({ word, gender })
/** Adjetivo en -o/-a («Dorado» → «Dorada»). */
const oa = (m: string): AliasAdjective => ({ m, f: `${m.slice(0, -1)}a` })
/** Adjetivo invariable («Púrpura», «Salvaje», «Feroz»). */
const same = (word: string): AliasAdjective => ({ m: word, f: word })

/**
 * Sustantivos (Anexo I): animales, fenómenos y cosas del cielo y de la música. Sin palabras ofensivas,
 * marcas ni nombres propios.
 */
export const ALIAS_NOUNS: readonly AliasNoun[] = [
  noun('Tigre', 'm'),
  noun('Cometa', 'm'),
  noun('Neón', 'm'),
  noun('Eclipse', 'm'),
  noun('Pantera', 'f'),
  noun('Relámpago', 'm'),
  noun('Sirena', 'f'),
  noun('Satélite', 'm'),
  noun('Bruma', 'f'),
  noun('Volcán', 'm'),
  noun('Lince', 'm'),
  noun('Faro', 'm'),
  noun('Medusa', 'f'),
  noun('Trueno', 'm'),
  noun('Cuervo', 'm'),
  noun('Aurora', 'f'),
  noun('Galgo', 'm'),
  noun('Cobra', 'f'),
  noun('Brasa', 'f'),
  noun('Marea', 'f'),
  noun('Halcón', 'm'),
  noun('Lobo', 'm'),
  noun('Dragón', 'm'),
  noun('Búho', 'm'),
  noun('Jaguar', 'm'),
  noun('Puma', 'm'),
  noun('Zorro', 'm'),
  noun('Bisonte', 'm'),
  noun('Cóndor', 'm'),
  noun('Tiburón', 'm'),
  noun('Escorpión', 'm'),
  noun('Meteoro', 'm'),
  noun('Ciclón', 'm'),
  noun('Tornado', 'm'),
  noun('Asteroide', 'm'),
  noun('Vinilo', 'm'),
  noun('Pulso', 'm'),
  noun('Eco', 'm'),
  noun('Fénix', 'm'),
  noun('Coyote', 'm'),
  noun('Caimán', 'm'),
  noun('Rayo', 'm'),
  noun('Huracán', 'm'),
  noun('Tambor', 'm'),
  noun('Oráculo', 'm'),
  noun('Láser', 'm'),
  noun('Metrónomo', 'm'),
  noun('Mamut', 'm'),
  noun('Tormenta', 'f'),
  noun('Luciérnaga', 'f'),
  noun('Avispa', 'f'),
  noun('Orca', 'f'),
  noun('Nebulosa', 'f'),
  noun('Galaxia', 'f'),
  noun('Chispa', 'f'),
  noun('Pólvora', 'f'),
  noun('Cinta', 'f'),
  noun('Sombra', 'f'),
  noun('Esfinge', 'f'),
  noun('Lechuza', 'f'),
  noun('Gacela', 'f'),
  noun('Iguana', 'f'),
  noun('Mantis', 'f'),
  noun('Quimera', 'f'),
  noun('Centella', 'f'),
  noun('Brújula', 'f'),
  noun('Cascada', 'f'),
  noun('Ventisca', 'f'),
  noun('Linterna', 'f'),
]

/** Adjetivos (Anexo I), con su forma femenina. Sin palabras ofensivas ni marcas. */
export const ALIAS_ADJECTIVES: readonly AliasAdjective[] = [
  same('Púrpura'),
  oa('Ácido'),
  oa('Nocturno'),
  same('Salvaje'),
  oa('Dorado'),
  oa('Eléctrico'),
  same('Fantasma'),
  same('Lunar'),
  oa('Callejero'),
  oa('Infinito'),
  oa('Hipnótico'),
  oa('Turbio'),
  same('Glaciar'),
  oa('Rojo'),
  oa('Oxidado'),
  oa('Cromado'),
  same('Errante'),
  oa('Magnético'),
  oa('Lento'),
  same('Feroz'),
  same('Veloz'),
  same('Solar'),
  oa('Cósmico'),
  oa('Sónico'),
  same('Polar'),
  same('Tropical'),
  same('Austral'),
  same('Boreal'),
  same('Brillante'),
  oa('Oscuro'),
  oa('Plateado'),
  same('Escarlata'),
  same('Carmesí'),
  same('Añil'),
  same('Violeta'),
  same('Turquesa'),
  same('Esmeralda'),
  same('Cobalto'),
  same('Fugaz'),
  oa('Silencioso'),
  same('Rebelde'),
  same('Indomable'),
  oa('Secreto'),
  oa('Místico'),
  oa('Antiguo'),
  same('Elegante'),
  oa('Analógico'),
  same('Digital'),
  oa('Granulado'),
  oa('Saturado'),
  oa('Sincopado'),
  oa('Atómico'),
  same('Radiante'),
  oa('Helado'),
  same('Ardiente'),
  oa('Tranquilo'),
  same('Valiente'),
  oa('Errático'),
  same('Celeste'),
  oa('Urbano'),
  oa('Galáctico'),
  same('Volátil'),
  same('Implacable'),
  oa('Sereno'),
]

/** Combinaciones posibles (sustantivo × adjetivo). */
export const ALIAS_COMBINATIONS = ALIAS_NOUNS.length * ALIAS_ADJECTIVES.length

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * Paso del recorrido: primo con el número de combinaciones (así las visita todas antes de repetir) y
 * grande, para que dos ids que caen cerca no compartan el siguiente candidato.
 */
const PROBE_STEP = (() => {
  let step = Math.floor(ALIAS_COMBINATIONS * 0.618) | 1
  while (gcd(step, ALIAS_COMBINATIONS) !== 1) step += 2
  return step
})()

/** El alias de la combinación `index` (`[0, ALIAS_COMBINATIONS)`): «Sustantivo Adjetivo». */
export function aliasAt(index: number): string {
  assertIntegerInRange(index, 0, ALIAS_COMBINATIONS - 1, 'index')
  const n = ALIAS_NOUNS[index % ALIAS_NOUNS.length]!
  const adjective = ALIAS_ADJECTIVES[Math.floor(index / ALIAS_NOUNS.length)]!
  return `${n.word} ${n.gender === 'm' ? adjective.m : adjective.f}`
}

/**
 * Alias de batalla de una entrada (`RF-VOTE-08`): determinista por id y distinto de los `taken` (los
 * alias que ya tiene la semana). El mismo id con los mismos ocupados da siempre el mismo alias. Lanza
 * `RangeError` si no queda ninguno libre (más de 4000 entradas en una semana).
 */
export function battleAlias(entryId: string, taken: Iterable<string> = []): string {
  if (entryId.length === 0) throw new RangeError('El alias necesita el id de la entrada')
  const occupied = new Set(taken)
  const start = hashOf('alias', entryId) % ALIAS_COMBINATIONS
  for (let i = 0; i < ALIAS_COMBINATIONS; i++) {
    const candidate = aliasAt((start + i * PROBE_STEP) % ALIAS_COMBINATIONS)
    if (!occupied.has(candidate)) return candidate
  }
  throw new RangeError('No quedan alias libres en la semana')
}

/** Número de recibo más alto que cabe en el formato (cuatro cifras, §2.12.1). */
export const RECEIPT_MAX = 9999

/**
 * Número de recibo de una entrada (§2.12.1): «BB-2026W41-0007», con la semana ISO (`isoWeekLabel`,
 * «2026-W41») y el correlativo de la semana (`entry.receipt_number`, desde 1).
 */
export function receiptCode(isoWeek: string, receiptNumber: number): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(isoWeek)
  if (!match) throw new RangeError(`Semana ISO con formato inválido (se espera aaaa-Wnn): ${isoWeek}`)
  assertIntegerInRange(receiptNumber, 1, RECEIPT_MAX, 'receiptNumber')
  return `BB-${match[1]}W${match[2]}-${String(receiptNumber).padStart(4, '0')}`
}

/**
 * Semilla de la portada generativa de una entrada (§3.4.5, `entry.cover_seed`): entero de 32 bits
 * estable por id. La portada se repinta igual en el cliente y en el servidor.
 */
export function coverSeed(entryId: string): number {
  if (entryId.length === 0) throw new RangeError('La semilla de la portada necesita el id de la entrada')
  return hashOf('cover', entryId)
}
