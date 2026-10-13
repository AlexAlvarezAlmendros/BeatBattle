import { color } from '@beatbattle/shared/tokens'
import { encodeGif, type GifFrame } from './gif'

/**
 * Cuenta atrás en vivo para los emails (§4.19.5, `RF-NOTIF-14`; tarea 3.14): 60 fotogramas de un segundo
 * desde el instante de la petición, «DD:HH:MM:SS» con su rótulo debajo, con la paleta de la arena (negro,
 * blanco, rojo; en la «hora loca», los dígitos en rojo). Letra de píxeles propia (5 × 7) a escala: así el
 * servidor no necesita fuentes ni lienzo.
 */

export const COUNTDOWN_WIDTH = 512
export const COUNTDOWN_HEIGHT = 96
export const COUNTDOWN_FRAMES = 60

// Índice 0 de la paleta: el negro del fondo (el valor inicial de cada fotograma).
const WHITE = 1
const RED = 2
const PALETTE = [color.black, color.white, color.red, color.wine] as const

/** Glifos de 5 × 7: una cadena de 7 filas de 5 columnas (`#` = encendido). */
const GLYPHS: Record<string, readonly string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  Í: ['...#.', '.###.', '..#..', '..#..', '..#..', '..#..', '.###.'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
}

function drawText(
  pixels: Uint8Array,
  text: string,
  x0: number,
  y0: number,
  scale: number,
  ink: number,
  advance = 6,
): void {
  let x = x0
  for (const char of text) {
    const glyph = GLYPHS[char]
    if (glyph)
      glyph.forEach((row, gy) => {
        for (let gx = 0; gx < 5; gx++) {
          if (row[gx] !== '#') continue
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) {
              const px = x + gx * scale + dx
              const py = y0 + gy * scale + dy
              if (px >= 0 && px < COUNTDOWN_WIDTH && py >= 0 && py < COUNTDOWN_HEIGHT)
                pixels[py * COUNTDOWN_WIDTH + px] = ink
            }
        }
      })
    x += advance * scale
  }
}

const textWidth = (text: string, scale: number, advance = 6) => [...text].length * advance * scale - scale

/** «DD:HH:MM:SS» de lo que falta, redondeando hacia arriba como el reloj de ronda. */
export function countdownText(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000))
  const parts = [
    Math.floor(total / 86_400),
    Math.floor((total % 86_400) / 3600),
    Math.floor((total % 3600) / 60),
    total % 60,
  ]
  return parts.map((part) => String(Math.min(part, 99)).padStart(2, '0')).join(':')
}

const LABELS = ['DÍAS', 'HORAS', 'MIN', 'SEG'] as const
const DIGIT_SCALE = 6
const LABEL_SCALE = 2

function frame(remainingMs: number, lastHourMs: number): Uint8Array {
  const pixels = new Uint8Array(COUNTDOWN_WIDTH * COUNTDOWN_HEIGHT)
  const text = countdownText(remainingMs)
  const width = textWidth(text, DIGIT_SCALE)
  const x0 = Math.round((COUNTDOWN_WIDTH - width) / 2)
  const ink = remainingMs > 0 && remainingMs <= lastHourMs ? RED : WHITE
  drawText(pixels, text, x0, 10, DIGIT_SCALE, ink)
  // Cada rótulo, centrado bajo su pareja de dígitos (dos dígitos y los dos puntos: 3 posiciones de 36 px).
  const pair = 2 * 6 * DIGIT_SCALE - DIGIT_SCALE
  LABELS.forEach((label, i) => {
    const pairX = x0 + i * 3 * 6 * DIGIT_SCALE
    const lx = pairX + Math.round((pair - textWidth(label, LABEL_SCALE)) / 2)
    drawText(pixels, label, lx, 66, LABEL_SCALE, RED)
  })
  return pixels
}

/**
 * El GIF de la cuenta atrás hasta `target` visto desde `now`: 60 fotogramas de 1 s. Si ya ha pasado, uno
 * solo con ceros.
 */
export function countdownGif(input: { now: number; target: number; lastHourMs: number }): Uint8Array {
  const frames: GifFrame[] = []
  const count = input.target > input.now ? COUNTDOWN_FRAMES : 1
  for (let i = 0; i < count; i++)
    frames.push({ pixels: frame(input.target - (input.now + i * 1000), input.lastHourMs), delayCs: 100 })
  return encodeGif({ width: COUNTDOWN_WIDTH, height: COUNTDOWN_HEIGHT, palette: PALETTE, frames })
}
