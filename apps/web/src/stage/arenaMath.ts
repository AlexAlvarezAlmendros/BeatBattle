import { texture } from '@beatbattle/shared/tokens'
import type { HalftoneShapeName } from '../ui/arena/halftone'

/**
 * Matemática de la trama de la arena tal como la hace el *shader* (`shaders/arenaHalftone.frag.glsl`,
 * guía §3.5 capa 0, tarea 1.1), escrita también en TypeScript para poder probarla contra el generador
 * estático (`halftoneDots`). Las dos tienen que dar los mismos puntos: la pantalla se ve igual con la
 * arena en WebGL que con la trama estática.
 *
 * El generador estático recorre la rejilla girada desde `−alcance` en pasos de una celda; el *shader* hace
 * lo contrario: para cada píxel busca el punto de rejilla más cercano y mira también los ocho de
 * alrededor, porque con `--bb-tex-halftone-max` = 0,74 el radio pasa de media celda y los puntos de al
 * lado se solapan.
 */

/** Por debajo de este radio (px) un punto no se pinta (el mismo umbral que `halftoneDots`). */
export const MIN_VISIBLE_RADIUS = 0.35

/** Índice de cada forma en el *shader* (`uShape`). */
export const SHAPE_INDEX: Record<Exclude<HalftoneShapeName, 'piece'>, number> = {
  menuWedge: 0,
  menuWedgeMobile: 1,
  interiorWedge: 2,
}

export type StageShapeName = keyof typeof SHAPE_INDEX

export interface Vec2 {
  x: number
  y: number
}

export interface GridOptions {
  cell: number
  /** Giro de la rejilla en grados. */
  angle: number
  max: number
  min: number
  shape: (u: number, v: number) => number
}

export const defaultGrid = (
  shape: GridOptions['shape'],
  cell: number = texture.halftoneCell,
): GridOptions => ({
  cell,
  angle: texture.halftoneAngle,
  max: texture.halftoneMax,
  min: 0,
  shape,
})

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * Radio del punto de rejilla más alto que cubre `p` menos su distancia (px): > 0 dentro de algún punto.
 * Es `coverage()` del *shader* sin el suavizado del borde. `size` es el lienzo en px CSS (la ventana).
 */
export function halftoneReach(p: Vec2, size: Vec2, options: GridOptions): number {
  const { cell, max, min } = options
  const radians = (options.angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const cx = size.x / 2
  const cy = size.y / 2
  const reach = Math.hypot(size.x, size.y) / 2 + cell
  // Coordenadas de rejilla: el giro inverso de (p − centro).
  const dx = p.x - cx
  const dy = p.y - cy
  const qi = dx * cos + dy * sin
  const qj = -dx * sin + dy * cos
  const k0 = Math.round((qi + reach) / cell)
  const l0 = Math.round((qj + reach) / cell)
  let best = Number.NEGATIVE_INFINITY
  for (let dk = -1; dk <= 1; dk++) {
    for (let dl = -1; dl <= 1; dl++) {
      const gi = -reach + (k0 + dk) * cell
      const gj = -reach + (l0 + dl) * cell
      const x = cx + gi * cos - gj * sin
      const y = cy + gi * sin + gj * cos
      if (x < -cell || y < -cell || x > size.x + cell || y > size.y + cell) continue
      const r = cell * (min + (max - min) * clamp01(options.shape(x / size.x, y / size.y)))
      if (r < MIN_VISIBLE_RADIUS) continue
      best = Math.max(best, r - Math.hypot(qi - gi, qj - gj))
    }
  }
  return best
}

/**
 * Lado de la diagonal: distancia con signo (px) de `p` a la recta `a`–`b`, positiva del lado de `inside`
 * (un punto que se sabe dentro de la cuña). Es `wedgeSide()` del *shader*.
 */
export function wedgeSide(p: Vec2, a: Vec2, b: Vec2, inside: Vec2): number {
  const ex = b.x - a.x
  const ey = b.y - a.y
  const length = Math.hypot(ex, ey) || 1
  const cross = (q: Vec2) => (ex * (q.y - a.y) - ey * (q.x - a.x)) / length
  return Math.sign(cross(inside)) * cross(p)
}
