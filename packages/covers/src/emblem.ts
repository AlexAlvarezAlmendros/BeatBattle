/**
 * Emblema de puntos de las portadas del voto ciego (guía §3.4.5), portado tal cual del generador de las
 * maquetas aprobadas (`docs/planning/evidence/f0/arena/src/final.js`: `coverSpec`, `famT`, `solveScale` y
 * `coverDots`). Es puro y determinista (sin DOM, sin `Math.random()`): lo mismo en cliente y servidor.
 *
 * Un disco de 13 anillos de puntos: 8 familias de forma × pliegues según la tonalidad × giro según el BPM
 * × fase y rotación según la semilla; un anillo de cada tres lleva puntos blancos con otra familia
 * (acento). **Mismo presupuesto de tinta para todas**: el área de los puntos rojos es el 11,5 % del disco
 * y la de los blancos el 1,6 %, repartidas en tres bandas radiales igualadas. La medida sobre los píxeles
 * (que corrige el *antialiasing*, §3.4.5) es del pintor en canvas, que llega con la Fase 4; aquí está la
 * geometría.
 *
 * Coordenadas en el disco unidad: centro en (0, 0), radio 1. El pintor las escala a su radio (en las
 * maquetas, el 46 % del lado de la portada).
 */

/** Proporción del disco en tinta roja (§3.4.5). */
export const INK_RED = 0.115
/** Proporción del disco en tinta blanca (§3.4.5). */
export const INK_WHITE = 0.016

/** Las 8 familias de forma del emblema (§3.4.5). */
export const COVER_FAMILIES = [
  'espiral',
  'estallido',
  'flor',
  'engranaje',
  'ondas',
  'eclipse',
  'aspa',
  'zigzag',
] as const
export type CoverFamily = (typeof COVER_FAMILIES)[number]

const TAU = Math.PI * 2
const RINGS = 13
const R0 = 0.15
const R1 = 0.92

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** FNV-1a de 32 bits (el `hash` de las maquetas). */
function hash(text: string): number {
  let h = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    h ^= text.charCodeAt(index)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Generador con semilla de las maquetas (mulberry32 sobre el hash de la semilla). */
function rng(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Onda determinista de la semilla (la de las maquetas), valores en [0,06; 1]. */
function waveData(seed: string, count = 128): number[] {
  const random = rng(`${seed}:wave`)
  const freq = [1 + random() * 2, 3 + random() * 5, 9 + random() * 9]
  const phase = [random() * TAU, random() * TAU, random() * TAU]
  const out: number[] = []
  for (let index = 0; index < count; index += 1) {
    const u = index / count
    let value =
      0.55 * Math.sin(u * TAU * freq[0]! + phase[0]!) +
      0.3 * Math.sin(u * TAU * freq[1]! + phase[1]!) +
      0.2 * Math.sin(u * TAU * freq[2]! + phase[2]!)
    value = 0.5 + 0.5 * value
    value = value * 0.75 + random() * 0.25
    out.push(clamp(value, 0.06, 1))
  }
  return out
}

/** Lo que fija la forma de un emblema, además de la semilla. */
export interface CoverOptions {
  /** Familia de forma (0–7); si falta, la elige la semilla. */
  family?: number
  /** Tonalidad (0–11): fija los pliegues (3–8). Si falta, la elige la semilla. */
  key?: number
  /** BPM: fija el giro (por defecto, 90). */
  bpm?: number
}

/** Parámetros del emblema de una semilla. */
export interface CoverSpec {
  family: number
  key: number
  folds: number
  rings: number
  twist: number
  phase: number
  sharp: number
  off: number
  rot: number
  accent: number
}

export function coverSpec(seed: string, options: CoverOptions = {}): CoverSpec {
  const random = rng(`${seed}:cover`)
  const family = options.family ?? Math.floor(random() * COVER_FAMILIES.length)
  const key = options.key ?? Math.floor(random() * 12)
  const bpm = options.bpm || 90
  return {
    family,
    key,
    folds: 3 + (key % 6),
    rings: RINGS,
    twist: (random() < 0.5 ? -1 : 1) * (0.25 + clamp((bpm - 60) / 120, 0, 1) * 0.9),
    phase: random() * TAU,
    sharp: 1 + random() * 2,
    off: 0.3 + random() * 0.12,
    rot: random() * TAU,
    accent: (family + 2 + Math.floor(random() * 5)) % COVER_FAMILIES.length,
  }
}

/** Intensidad (0–1) de una familia en el ángulo `th` y el radio `rho` (`famT` de las maquetas). */
function familyValue(family: number, th: number, rho: number, p: CoverSpec, wave: number): number {
  const n = p.folds
  switch (COVER_FAMILIES[family]) {
    case 'espiral':
      return 0.5 + 0.5 * Math.cos(n * th + p.phase + p.twist * rho * 9)
    case 'estallido': {
      const s = ((((n * th + p.phase) / TAU) % 1) + 1) % 1
      return (1 - Math.abs(s - 0.5) * 2) ** p.sharp * (0.3 + 0.7 * rho)
    }
    case 'flor': {
      const c = Math.abs(Math.cos((n * (th + p.phase)) / 2))
      const envelope = 0.28 + 0.7 * c ** 0.85
      return clamp((envelope - rho) * 5 + 0.1, 0, 1) * (0.75 + 0.25 * Math.cos(rho * 20))
    }
    case 'engranaje':
      if (rho > 0.64) return Math.cos(n * 2 * th + p.phase) > 0.05 ? 1 : 0
      if (rho > 0.5) return 0
      return 0.5 + 0.5 * Math.cos(rho * Math.PI * 5 + p.phase)
    case 'ondas': {
      const band = 0.5 + 0.5 * Math.cos(rho * Math.PI * (3 + n * 0.6) + p.phase)
      return 0.1 + 0.9 * band ** 1.2 * (0.55 + 0.45 * wave)
    }
    case 'eclipse': {
      const x = rho * Math.cos(th)
      const y = rho * Math.sin(th)
      const ox = p.off * Math.cos(p.rot)
      const oy = p.off * Math.sin(p.rot)
      return (
        clamp((Math.hypot(x - ox, y - oy) - 0.52) * 6, 0, 1) * (0.7 + 0.3 * Math.cos(th * n * 2 + p.phase))
      )
    }
    case 'aspa': {
      const a = (0.5 + 0.5 * Math.cos(n * (th + p.twist * rho * 2.4) + p.phase)) ** 5
      return a * (0.35 + 0.65 * rho) + (rho < 0.26 ? 0.35 : 0)
    }
    case 'zigzag': {
      const tri = Math.abs((((((n * th + p.phase) / TAU) % 1) + 1) % 1) * 2 - 1)
      const rr = 0.52 + 0.34 * tri
      return Math.exp(-(((rho - rr) / 0.09) ** 2)) + 0.85 * Math.exp(-(((rho - rr * 0.52) / 0.07) ** 2))
    }
    default:
      return 0
  }
}

/**
 * Factor que lleva el área de los puntos (radios `radii × k`, cada uno como mucho `rmax`) a `target`, por
 * bisección (`solveScale` de las maquetas).
 */
export function solveScale(radii: readonly number[], rmax: number, target: number): number {
  let lo = 0
  let hi = 50
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const mid = (lo + hi) / 2
    let area = 0
    for (const radius of radii) {
      const r = Math.min(radius * mid, rmax)
      area += Math.PI * r * r
    }
    if (area < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Un punto del emblema: centro y radio en el disco unidad. */
export interface CoverDot {
  x: number
  y: number
  r: number
}

export interface CoverDots {
  spec: CoverSpec
  red: CoverDot[]
  white: CoverDot[]
  /** Radio máximo de un punto. */
  rmax: number
}

/**
 * Los puntos del emblema de una semilla (`coverDots` de las maquetas), con el presupuesto de tinta
 * aplicado: el área de los rojos es `INK_RED` del disco y la de los blancos, `INK_WHITE`. Los puntos sin
 * tinta (radio 0) no se devuelven. `spec.rot` gira solo los rayos del fondo (como en `drawCover`).
 */
export function coverDots(seed: string, options: CoverOptions = {}): CoverDots {
  const spec = coverSpec(seed, options)
  const cell = (R1 - R0) / (spec.rings - 1)
  const wave = waveData(seed, 128)
  type Raw = { th: number; rho: number; t: number; band: number }
  const red: Raw[] = []
  const white: Raw[] = []
  for (let ring = 0; ring < spec.rings; ring += 1) {
    const rho = R0 + cell * ring
    const count = Math.max(8, Math.round((TAU * rho) / cell))
    for (let index = 0; index < count; index += 1) {
      const th = (index / count) * TAU + (ring % 2) * (Math.PI / count)
      const w = wave[(Math.floor((th / TAU) * 128) + ring * 9) % 128]!
      const isWhite = ring % 3 === 1
      const t = isWhite
        ? 0.15 + 0.85 * clamp(familyValue(spec.accent, th, rho, spec, w), 0, 1)
        : clamp(familyValue(spec.family, th, rho, spec, w), 0, 1)
      ;(isWhite ? white : red).push({ th, rho, t, band: 0 })
    }
  }
  // Igualación parcial por bandas radiales (interior, media, exterior).
  const bands: readonly [number, number][] = [
    [0, 0.42],
    [0.42, 0.68],
    [0.68, 2],
  ]
  const sums = bands.map(() => 0)
  const counts = bands.map(() => 0)
  for (const dot of red) {
    dot.band = bands.findIndex(([from, to]) => dot.rho >= from && dot.rho < to)
    sums[dot.band]! += dot.t * dot.t
    counts[dot.band]! += 1
  }
  const mean = sums.reduce((a, b) => a + b, 0) / counts.reduce((a, b) => a + b, 0)
  const multipliers = sums.map((sum, band) =>
    Math.sqrt(clamp(1 + 0.6 * (mean / Math.max(1e-6, sum / counts[band]!) - 1), 0.4, 2.4)),
  )
  for (const dot of red) dot.t *= multipliers[dot.band]!

  const rmax = cell * 0.62
  const disk = Math.PI
  const kRed = solveScale(
    red.map((dot) => dot.t * cell * 0.56),
    rmax,
    INK_RED * disk,
  )
  const kWhite = solveScale(
    white.map((dot) => dot.t * cell * 0.56),
    rmax,
    INK_WHITE * disk,
  )
  const place = (dots: Raw[], k: number): CoverDot[] =>
    dots
      .map((dot) => ({
        x: Math.cos(dot.th) * dot.rho,
        y: Math.sin(dot.th) * dot.rho,
        r: Math.min(dot.t * cell * 0.56 * k, rmax),
      }))
      .filter((dot) => dot.r > 0)
  return { spec, red: place(red, kRed), white: place(white, kWhite), rmax }
}

/** Proporción del disco unidad que cubren los puntos (suma de sus áreas entre el área del disco). */
export function inkShare(dots: readonly CoverDot[]): number {
  return dots.reduce((area, dot) => area + Math.PI * dot.r * dot.r, 0) / Math.PI
}

/**
 * La portada de referencia de las maquetas (`coverDots('referencia', { family: 0, key: 4, bpm: 92 })`):
 * la que calibra a todas las demás. Hasta que cada entrada tenga la suya (Fase 4), es la que llevan
 * **todas** durante el voto ciego, así que ninguna se distingue por su portada.
 */
export const REFERENCE_COVER = { seed: 'referencia', options: { family: 0, key: 4, bpm: 92 } } as const

export function referenceCoverDots(): CoverDots {
  return coverDots(REFERENCE_COVER.seed, REFERENCE_COVER.options)
}
