import type { Cover2D } from '@beatbattle/covers'
import { Resvg } from '@resvg/resvg-js'

/**
 * Un contexto 2D de servidor para el pintor de portadas (§3.4.5; tarea 6.11): apunta lo que se dibuja como SVG
 * y lo rasteriza con resvg **por CPU** cuando el pintor mide (`getImageData`), así la calibración por medida de
 * `paintCover` se hace sobre los mismos píxeles que salen en la imagen. Cubre lo que usa `drawCover` y nada más:
 * traslaciones y giros (sin escala), polígonos, círculos completos, relleno liso o con degradado radial y trazo.
 */

interface Gradient {
  kind: 'radial'
  x0: number
  y0: number
  r0: number
  x1: number
  y1: number
  r1: number
  stops: [number, string][]
  addColorStop(offset: number, color: string): void
}

type Matrix = [number, number, number, number, number, number]
type Shape =
  | { kind: 'poly'; points: [number, number][] }
  | { kind: 'circle'; x: number; y: number; r: number }

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const TAU = Math.PI * 2
const n = (value: number) => Number(value.toFixed(3))

export class SvgCanvas implements Cover2D {
  fillStyle: unknown = '#000'
  strokeStyle: unknown = '#000'
  lineWidth = 1
  globalAlpha = 1
  private matrix: Matrix = IDENTITY
  private stack: Matrix[] = []
  private path: Shape[] = []
  private body: string[] = []
  private defs: string[] = []
  private pixels: Uint8Array | null = null

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  private point(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.matrix
    return [a * x + c * y + e, b * x + d * y + f]
  }

  private paint(style: unknown): string {
    if (typeof style === 'string') return style
    const g = style as Gradient
    const id = `g${this.defs.length}`
    const stops = g.stops
      .map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`)
      .join('')
    const [x0, y0] = this.point(g.x0, g.y0)
    const [x1, y1] = this.point(g.x1, g.y1)
    this.defs.push(
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(x1)}" cy="${n(y1)}" r="${n(g.r1)}" fx="${n(x0)}" fy="${n(y0)}"${g.r0 > 0 ? ` fr="${n(g.r0)}"` : ''}>${stops}</radialGradient>`,
    )
    return `url(#${id})`
  }

  private emit(shape: Shape, attrs: string): void {
    this.pixels = null
    const opacity = this.globalAlpha < 1 ? ` opacity="${this.globalAlpha}"` : ''
    if (shape.kind === 'circle')
      this.body.push(`<circle cx="${n(shape.x)}" cy="${n(shape.y)}" r="${n(shape.r)}" ${attrs}${opacity}/>`)
    else
      this.body.push(
        `<path d="M${shape.points.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z" ${attrs}${opacity}/>`,
      )
  }

  clearRect(): void {
    this.body = []
    this.defs = []
    this.pixels = null
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const points: [number, number][] = [
      this.point(x, y),
      this.point(x + w, y),
      this.point(x + w, y + h),
      this.point(x, y + h),
    ]
    this.emit({ kind: 'poly', points }, `fill="${this.paint(this.fillStyle)}"`)
  }

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Gradient {
    const gradient: Gradient = {
      kind: 'radial',
      x0,
      y0,
      r0,
      x1,
      y1,
      r1,
      stops: [],
      addColorStop(offset, color) {
        gradient.stops.push([offset, color])
      },
    }
    return gradient
  }

  save(): void {
    this.stack.push(this.matrix)
  }

  restore(): void {
    this.matrix = this.stack.pop() ?? IDENTITY
  }

  translate(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.matrix
    this.matrix = [a, b, c, d, a * x + c * y + e, b * x + d * y + f]
  }

  rotate(angle: number): void {
    const [a, b, c, d, e, f] = this.matrix
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    this.matrix = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f]
  }

  beginPath(): void {
    this.path = []
  }

  moveTo(x: number, y: number): void {
    this.path.push({ kind: 'poly', points: [this.point(x, y)] })
  }

  lineTo(x: number, y: number): void {
    const last = this.path.at(-1)
    if (last?.kind === 'poly') last.points.push(this.point(x, y))
    else this.moveTo(x, y)
  }

  arc(x: number, y: number, r: number, start: number, end: number): void {
    if (Math.abs(end - start - TAU) > 1e-9) throw new Error('SvgCanvas solo dibuja círculos completos')
    const [cx, cy] = this.point(x, y)
    this.path.push({ kind: 'circle', x: cx, y: cy, r })
  }

  fill(): void {
    const paint = this.paint(this.fillStyle)
    for (const shape of this.path) this.emit(shape, `fill="${paint}"`)
  }

  stroke(): void {
    const paint = this.paint(this.strokeStyle)
    for (const shape of this.path)
      this.emit(shape, `fill="none" stroke="${paint}" stroke-width="${this.lineWidth}"`)
  }

  /** Lo dibujado, como SVG. */
  toSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}"><defs>${this.defs.join('')}</defs>${this.body.join('')}</svg>`
  }

  /** Lo dibujado, como PNG. */
  toPng(): Uint8Array {
    return new Resvg(this.toSvg()).render().asPng()
  }

  getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> } {
    if (x !== 0 || y !== 0 || w !== this.width || h !== this.height)
      throw new Error('SvgCanvas solo lee el lienzo entero')
    this.pixels ??= new Uint8Array(new Resvg(this.toSvg()).render().pixels)
    return { data: this.pixels }
  }
}
