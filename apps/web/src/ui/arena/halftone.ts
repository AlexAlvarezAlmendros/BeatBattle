import { texture } from '@beatbattle/shared/tokens'

/**
 * Trama *halftone* de la arena (guía §3.2 «Texturas», §3.5 capa 0): puntos en una rejilla girada cuyo
 * radio sale de una función de la posición. Es el generador `halftone()` de las maquetas aprobadas
 * (`docs/planning/evidence/f0/arena/src/final.js`) llevado a TypeScript, sin cambiar la lógica: la
 * rejilla se recorre en coordenadas giradas alrededor del centro y cada punto mide
 * `celda × (mín + (máx − mín) · fn(u, v))`, con `u` y `v` en `[0, 1]` sobre el ancho y el alto.
 *
 * Se pinta una vez por tamaño y DPR y se guarda como *bitmap* (`HalftoneCanvas`): nunca se anima por
 * fotograma. Los parámetros por defecto son los tokens `--bb-tex-halftone-*` (espejo `texture`).
 */

/** Función de la forma: tamaño relativo del punto en `(u, v)`, de 0 (sin punto) a 1 (el máximo). */
export type HalftoneShape = (u: number, v: number) => number

export interface HalftoneOptions {
  /** Celda de la rejilla en px CSS (por defecto, `--bb-tex-halftone-cell`). */
  cell?: number
  /** Giro de la rejilla en grados (por defecto, el de los fondos: 30°). */
  angle?: number
  /** Radio máximo como fracción de la celda (por defecto, `--bb-tex-halftone-max`). */
  max?: number
  /** Radio mínimo como fracción de la celda (por defecto, 0). */
  min?: number
  /** Color de los puntos (un valor del espejo de tokens). */
  ink: string
  /** Fondo, si lo hay (si no, transparente). */
  background?: string
  shape: HalftoneShape
}

/** Por debajo de este radio (px) un punto no se pinta: no se ve y solo ensucia el *antialiasing*. */
const MIN_VISIBLE_RADIUS = 0.35

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export interface HalftoneDot {
  x: number
  y: number
  r: number
}

/**
 * Puntos de la trama en un lienzo de `width × height` px CSS. Puro (sin canvas): lo usan el pintor y
 * los tests.
 */
export function halftoneDots(width: number, height: number, options: HalftoneOptions): HalftoneDot[] {
  const cell = options.cell ?? texture.halftoneCell
  const radians = ((options.angle ?? texture.halftoneAngle) * Math.PI) / 180
  const max = options.max ?? texture.halftoneMax
  const min = options.min ?? 0
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const reach = Math.hypot(width, height) / 2 + cell
  const dots: HalftoneDot[] = []
  for (let i = -reach; i <= reach; i += cell) {
    for (let j = -reach; j <= reach; j += cell) {
      const x = width / 2 + i * cos - j * sin
      const y = height / 2 + i * sin + j * cos
      if (x < -cell || y < -cell || x > width + cell || y > height + cell) continue
      const r = cell * (min + (max - min) * clamp01(options.shape(x / width, y / height)))
      if (r < MIN_VISIBLE_RADIUS) continue
      dots.push({ x, y, r })
    }
  }
  return dots
}

/** Pinta la trama en un contexto 2D ya escalado a px CSS. */
export function paintHalftone(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: HalftoneOptions,
): void {
  ctx.clearRect(0, 0, width, height)
  if (options.background) {
    ctx.fillStyle = options.background
    ctx.fillRect(0, 0, width, height)
  }
  ctx.fillStyle = options.ink
  for (const { x, y, r } of halftoneDots(width, height, options)) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Formas de las maquetas aprobadas (`01-menu.html`, `02-seleccion.html`, `05-perfil.html`), por pieza.
 * Dejan sin puntos las zonas donde va texto (`RD-VIS-05`): arriba a la izquierda de la cuña del menú,
 * la izquierda de la tarjeta del escenario.
 */
export const HALFTONE_SHAPES = {
  /** Cuña del menú en escritorio: crece hacia abajo a la derecha y se apaga al pie (la barra de controles). */
  menuWedge: (u, v) =>
    (Math.max(0, u * 1.05 + v * 0.45 - 0.95) / 0.55) ** 1.3 * (1 - clamp01((v - 0.78) / 0.14)),
  /** Cuña del menú en móvil: crece hacia abajo. */
  menuWedgeMobile: (u, v) => (Math.max(0, v * 1.2 + u * 0.25 - 0.95) / 0.5) ** 1.3,
  /** Cuña de las pantallas interiores (a la izquierda): crece hacia abajo a la izquierda. */
  interiorWedge: (u, v) => (Math.max(0, (1 - u) * 0.9 + v * 0.55 - 0.95) / 0.5) ** 1.3,
  /** Tarjeta del escenario y piezas: crece hacia la derecha a partir del 35 %. */
  piece: (u) => (Math.max(0, u - 0.35) / 0.65) ** 1.4 * 0.95,
  /**
   * Disco de la pantalla de título (§3.8.1, maqueta `00-titulo`): anillo de trama entre la galleta (27 %) y
   * el canto (98,5 %), con surcos y una sombra arriba a la derecha.
   */
  titleDisc: (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2
    if (r > 0.985 || r < 0.27) return 0
    const groove = 0.82 + 0.18 * Math.cos(r * 70)
    const shade = 1 - 0.55 * Math.max(0, (u - 0.5) * 1.6 + (0.5 - v) * 0.6)
    return ((r - 0.27) / 0.715) ** 0.9 * groove * shade * 0.95
  },
} satisfies Record<string, HalftoneShape>

export type HalftoneShapeName = keyof typeof HALFTONE_SHAPES
