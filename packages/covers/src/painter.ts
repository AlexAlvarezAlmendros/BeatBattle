import { color } from '@beatbattle/shared/tokens'
import { type CoverDots, type CoverOptions, type CoverSpec, coverDots, REFERENCE_COVER } from './emblem'

/**
 * El pintor de las portadas generativas (guía §3.4.5, `RD-VIS-04`; tarea 4.11), portado de `drawCover`,
 * `measure` y `cover` de las maquetas (`docs/planning/evidence/f0/arena/src/final.js`) con la paleta de los
 * tokens (la misma que `CoverArt`): fondo granate que se oscurece hacia el borde, 24 rayos blancos al 3 %, el
 * emblema de puntos en `#ff003c` y blanco al 94 %, la galleta central y el canto.
 *
 * **Se pinta por CPU** (§3.4.5): la calibración por medida no es portable entre rasterizadores, así que el
 * contexto se pide con `willReadFrequently: true` (`coverContext`) y la portada se pinta a su tamaño final en
 * píxeles de pantalla, sin transformaciones. El área de tinta ya la fija la geometría (`emblem.ts`); después,
 * de dos a cinco pasadas de medida ajustan el rojo a la proporción de rojo de la portada de referencia y el
 * blanco a su luminancia, porque el *antialiasing* y los solapes de los puntos pequeños cambian lo que se ve.
 *
 * No toca el DOM: recibe un contexto 2D (de un `<canvas>`, un `OffscreenCanvas` o un rasterizador de servidor
 * para las imágenes OG) con la interfaz mínima `Cover2D`.
 */

/** Lo que el pintor usa de un contexto 2D (el de un `<canvas>`, un `OffscreenCanvas` o uno de servidor). */
export interface Cover2D {
  fillStyle: unknown
  strokeStyle: unknown
  lineWidth: number
  globalAlpha: number
  clearRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): { addColorStop(offset: number, color: string): void }
  save(): void
  restore(): void
  translate(x: number, y: number): void
  rotate(angle: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, start: number, end: number): void
  fill(): void
  stroke(): void
  getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> }
}

/** Un lienzo del que se pide el contexto 2D por CPU (`HTMLCanvasElement` u `OffscreenCanvas`). */
export interface CoverCanvas {
  width: number
  height: number
  getContext(type: '2d', options: { willReadFrequently: boolean }): unknown
}

const TAU = Math.PI * 2
/** Radio del disco del emblema, en proporción del lado (el 46 % de las maquetas). */
export const COVER_DISK = 0.46
/** Rayos del fondo (§3.4.5): 24, de ±5 % del lado de ancho. */
const RAYS = 24
/** Opacidad de los rayos (§3.4.5: «rayos al 3 %») y de los puntos blancos (94 %, como en las maquetas). */
const RAY_ALPHA = 0.03
const WHITE_ALPHA = 0.94
/** Un punto de menos de este radio (px) no se pinta: no se vería y solo añadiría ruido de *antialiasing*. */
const MIN_DOT_PX = 0.45
/** Pasadas de medida (§3.4.5: de dos a cinco) y tolerancia con la que se para antes. */
export const MAX_PASSES = 5
const PASS_TOLERANCE = 0.008

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/**
 * El contexto 2D de un lienzo **por CPU** (`willReadFrequently: true`, §3.4.5). Lanza si no hay contexto 2D.
 */
export function coverContext(canvas: CoverCanvas): Cover2D {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Sin contexto 2D para pintar la portada')
  return context as Cover2D
}

/**
 * Pinta una portada de `size` px de lado: el fondo común y, si hay `dots`, el emblema con los factores de
 * calibración `kRed` y `kWhite` sobre el radio de cada punto (cada uno como mucho `dots.rmax`).
 */
export function drawCover(ctx: Cover2D, size: number, dots: CoverDots | null, kRed = 1, kWhite = 1): void {
  const center = size / 2
  const radius = size * COVER_DISK
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, size, size)
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, size * 0.66)
  gradient.addColorStop(0, color.wine2)
  gradient.addColorStop(0.4, color.wine2)
  gradient.addColorStop(0.7, color.wine3)
  gradient.addColorStop(1, color.black)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  // Rayos, girados con la rotación de la semilla (la misma `rot` del emblema).
  ctx.save()
  ctx.translate(center, center)
  ctx.rotate(dots?.spec.rot ?? 0)
  ctx.globalAlpha = RAY_ALPHA
  ctx.fillStyle = color.white
  for (let ray = 0; ray < RAYS; ray += 1) {
    ctx.rotate(TAU / RAYS)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(size, -size * 0.05)
    ctx.lineTo(size, size * 0.05)
    ctx.fill()
  }
  ctx.restore()
  ctx.globalAlpha = 1

  if (dots) {
    const put = (list: CoverDots['red'], ink: string, alpha: number, k: number) => {
      ctx.fillStyle = ink
      ctx.globalAlpha = alpha
      for (const dot of list) {
        const r = Math.min(dot.r * k, dots.rmax) * radius
        if (r < MIN_DOT_PX) continue
        ctx.beginPath()
        ctx.arc(center + dot.x * radius, center + dot.y * radius, r, 0, TAU)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    put(dots.red, color.red, 1, kRed)
    put(dots.white, color.white, WHITE_ALPHA, kWhite)
  }

  // Galleta central (negra con filete rojo y eje blanco) y canto.
  ctx.fillStyle = color.black
  ctx.beginPath()
  ctx.arc(center, center, size * 0.085, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = color.red
  ctx.lineWidth = Math.max(2, size * 0.011)
  ctx.beginPath()
  ctx.arc(center, center, size * 0.07, 0, TAU)
  ctx.stroke()
  ctx.fillStyle = color.white
  ctx.beginPath()
  ctx.arc(center, center, size * 0.014, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = color.line
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(center, center, size * 0.485, 0, TAU)
  ctx.stroke()
}

/** La medida de una portada: proporción de rojo y luminancia relativa media (WCAG). */
export interface CoverStats {
  /** Media del exceso de rojo sobre verde y azul (0–1): cuánta tinta roja se ve. */
  red: number
  /** Luminancia relativa media (0–1). */
  lum: number
}

const linear = (value: number) => {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** Tabla de `linear` para los 256 valores de un canal (la medida recorre todos los píxeles varias veces). */
const LINEAR = Array.from({ length: 256 }, (_, value) => linear(value))

/** Mide los píxeles de una portada pintada (la misma medida que usa el test de integridad, `RD-VIS-04`). */
export function measureCover(ctx: Cover2D, width: number, height: number): CoverStats {
  const px = ctx.getImageData(0, 0, width, height).data
  let red = 0
  let lum = 0
  for (let index = 0; index < px.length; index += 4) {
    const r = px[index]!
    const g = px[index + 1]!
    const b = px[index + 2]!
    red += Math.max(0, r - Math.max(g, b)) / 255
    lum += 0.2126 * LINEAR[r]! + 0.7152 * LINEAR[g]! + 0.0722 * LINEAR[b]!
  }
  const n = px.length / 4
  return { red: red / n, lum: lum / n }
}

/** El fondo sin emblema (`base`) y la portada de referencia (`target`), medidos a un tamaño. */
export interface CoverCalibration {
  base: CoverStats
  target: CoverStats
}

const calibrations = new Map<number, CoverCalibration>()

/**
 * La calibración de un tamaño: el fondo solo y la portada de referencia (`REFERENCE_COVER`), medidos en el
 * mismo contexto. Se calcula una vez por tamaño y queda en memoria (deja el lienzo pintado con la referencia).
 */
export function calibrationFor(ctx: Cover2D, size: number): CoverCalibration {
  const cached = calibrations.get(size)
  if (cached) return cached
  drawCover(ctx, size, null)
  const base = measureCover(ctx, size, size)
  drawCover(ctx, size, coverDots(REFERENCE_COVER.seed, REFERENCE_COVER.options))
  const calibration = { base, target: measureCover(ctx, size, size) }
  calibrations.set(size, calibration)
  return calibration
}

/** Olvida las calibraciones (para medir de nuevo, p. ej. en un test que cambia de rasterizador). */
export function resetCoverCalibrations(): void {
  calibrations.clear()
}

/** Lo que fija el emblema de una entrada: su semilla (`entry.cover_seed`), su BPM y su tonalidad. */
export interface CoverInput {
  /** Semilla de la portada (`coverSeed(entryId)` de `@beatbattle/rules`); nunca el id del usuario. */
  seed: number | string
  bpm?: number | null
  /** Tonalidad en la notación de la API (`'Am'`, `'F#'`, §4.10). */
  musicalKey?: string | null
}

/** Las 12 tónicas en el orden de `TONICS` de `@beatbattle/shared` (do = 0). */
const TONICS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** La tónica (0–11) de una tonalidad (`'F#m'` → 6), o `null` si no es una de las 24. */
export function tonicOf(musicalKey: string): number | null {
  const tonic = TONICS.indexOf(musicalKey.replace(/m$/, '') as (typeof TONICS)[number])
  return tonic < 0 ? null : tonic
}

/** Las opciones del emblema de una entrada: los pliegues por la tónica (§3.4.5) y el giro por el BPM. */
export function coverOptionsOf(input: Pick<CoverInput, 'bpm' | 'musicalKey'>): CoverOptions {
  return {
    ...(input.musicalKey && tonicOf(input.musicalKey) !== null
      ? { key: tonicOf(input.musicalKey) as number }
      : {}),
    ...(input.bpm ? { bpm: input.bpm } : {}),
  }
}

export interface PaintedCover {
  spec: CoverSpec
  kRed: number
  kWhite: number
  /** Pasadas de medida que hicieron falta. */
  passes: number
  /** La medida de la portada final. */
  stats: CoverStats
}

/**
 * Pinta la portada de una entrada a `size` px (§3.4.5): el emblema de su semilla con el presupuesto de
 * tinta y la calibración por medida (de dos a cinco pasadas), y la deja pintada en `ctx`.
 */
export function paintCover(ctx: Cover2D, size: number, input: CoverInput): PaintedCover {
  const { base, target } = calibrationFor(ctx, size)
  const dots = coverDots(String(input.seed), coverOptionsOf(input))
  let kRed = 1
  let kWhite = 1
  let passes = 0
  let stats: CoverStats | null = null
  for (; passes < MAX_PASSES; passes += 1) {
    drawCover(ctx, size, dots, kRed, kWhite)
    stats = measureCover(ctx, size, size)
    const redRatio = (target.red - base.red) / Math.max(1e-6, stats.red - base.red)
    const lumRatio = (target.lum - base.lum) / Math.max(1e-6, stats.lum - base.lum)
    if (passes >= 1 && Math.abs(redRatio - 1) < PASS_TOLERANCE && Math.abs(lumRatio - 1) < PASS_TOLERANCE)
      break
    kRed *= Math.sqrt(clamp(redRatio, 0.6, 1.6))
    // El blanco corrige lo que el rojo no explica de la luminancia.
    kWhite *= Math.sqrt(clamp(1 + (lumRatio - 1) * 2.2, 0.5, 1.8))
  }
  if (passes === MAX_PASSES) {
    drawCover(ctx, size, dots, kRed, kWhite)
    stats = measureCover(ctx, size, size)
  } else passes += 1
  return { spec: dots.spec, kRed, kWhite, passes, stats: stats as CoverStats }
}
