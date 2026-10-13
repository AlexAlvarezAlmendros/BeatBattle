import { coverContext, paintCover } from '@beatbattle/covers'
import { color } from '@beatbattle/shared/tokens'

/**
 * Tarjetas para stories (§2.15, `RF-SHARE-03`; tarea 6.14): un PNG de 1080 × 1920 que se pinta en el navegador
 * (contexto 2D por CPU, como las portadas) con las fuentes del juego. «Estoy en la batalla #N» (la propia
 * entrada, sin sellar: dice «Escúchala y vota», nunca «Vota a X», §2.15) y «He quedado N.º» (tras el sellado).
 */

export const STORY_WIDTH = 1080
export const STORY_HEIGHT = 1920
const COVER = 640
const MARGIN = 96

export type StoryCard =
  | {
      kind: 'battle'
      weekNumber: number
      sampleTitle: string
      title: string
      alias: string
      cover: { seed: number | string; bpm: number | null; musicalKey: string | null }
      url: string
    }
  | {
      kind: 'result'
      weekNumber: number
      sampleTitle: string
      title: string
      producer: string
      position: number
      score: string
      votes: string
      cover: { seed: number | string; bpm: number | null; musicalKey: string | null }
      url: string
    }

const DISPLAY = (px: number) => `italic 900 ${px}px Anybody`
const UI = (px: number, weight = 700) => `${weight} ${px}px "Chakra Petch"`
const NUM = (px: number) => `800 ${px}px Oxanium`

/** Las fuentes del juego, cargadas antes de pintar (si no, el lienzo usa la de sistema). */
async function loadFonts(): Promise<void> {
  if (!document.fonts) return
  await Promise.all(
    [DISPLAY(120), UI(44), UI(40, 600), NUM(64)].map((font) => document.fonts.load(font).catch(() => [])),
  )
}

/** Parte `text` en líneas que caben en `width`; como mucho `max`, la última con «…». */
function lines(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/)
  const out: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= width || !line) line = next
    else {
      out.push(line)
      line = word
    }
  }
  if (line) out.push(line)
  if (out.length <= max) return out
  const kept = out.slice(0, max)
  let last = kept[max - 1] ?? ''
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
  kept[max - 1] = `${last.trimEnd()}…`
  return kept
}

/** Recorta `text` letra a letra hasta que quepa en `width`, con «…» (un enlace no tiene espacios). */
function clip(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text
  let cut = text
  while (cut && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1)
  return `${cut}…`
}

function cover(card: StoryCard): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = COVER
  canvas.height = COVER
  paintCover(coverContext(canvas), COVER, card.cover)
  return canvas
}

/** Pinta la tarjeta en `canvas` (1080 × 1920). */
export async function drawStory(canvas: HTMLCanvasElement, card: StoryCard): Promise<void> {
  await loadFonts()
  canvas.width = STORY_WIDTH
  canvas.height = STORY_HEIGHT
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Sin contexto 2D para la tarjeta')
  ctx.fillStyle = color.black
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT)
  ctx.textBaseline = 'alphabetic'

  // Arriba: el juego y la semana.
  ctx.fillStyle = color.red
  ctx.font = UI(44)
  ctx.fillText(`BEAT BATTLE · SEMANA #${card.weekNumber}`, MARGIN, 190)

  // El titular.
  ctx.fillStyle = color.white
  if (card.kind === 'battle') {
    ctx.font = DISPLAY(124)
    ctx.fillText('ESTOY EN', MARGIN, 350)
    ctx.fillText('LA BATALLA', MARGIN, 480)
  } else {
    ctx.font = DISPLAY(124)
    ctx.fillText('HE QUEDADO', MARGIN, 350)
    ctx.fillStyle = card.position === 1 ? color.red : color.white
    ctx.font = DISPLAY(150)
    ctx.fillText(`${card.position}.º`, MARGIN, 500)
  }

  // La portada, con su marco.
  const x = (STORY_WIDTH - COVER) / 2
  const y = 580
  ctx.fillStyle = card.kind === 'result' && card.position === 1 ? color.red : color.white
  ctx.fillRect(x - 8, y - 8, COVER + 16, COVER + 16)
  ctx.drawImage(cover(card), x, y)

  // El título y quién.
  ctx.fillStyle = color.white
  ctx.font = DISPLAY(84)
  let ty = y + COVER + 130
  for (const line of lines(ctx, card.title, STORY_WIDTH - 2 * MARGIN, 2)) {
    ctx.fillText(line, MARGIN, ty)
    ty += 92
  }
  ctx.fillStyle = color.text2
  ctx.font = UI(44, 600)
  ctx.fillText(card.kind === 'battle' ? card.alias : card.producer, MARGIN, ty + 10)
  ctx.fillStyle = color.text3
  ctx.font = UI(36, 600)
  ctx.fillText(`Sample: ${card.sampleTitle}`, MARGIN, ty + 70)

  // Abajo: la llamada (o las cifras) y la firma.
  const foot = STORY_HEIGHT - 170
  if (card.kind === 'battle') {
    ctx.font = UI(48)
    const label = 'ESCÚCHALA Y VOTA'
    const w = ctx.measureText(label).width + 64
    ctx.fillStyle = color.redCta
    ctx.fillRect(MARGIN, foot - 66, w, 90)
    ctx.fillStyle = color.white
    ctx.fillText(label, MARGIN + 32, foot - 4)
  } else {
    ctx.fillStyle = color.white
    ctx.font = NUM(72)
    ctx.fillText(card.score, MARGIN, foot)
    const scoreWidth = ctx.measureText(card.score).width
    ctx.fillStyle = color.text3
    ctx.font = UI(40, 600)
    ctx.fillText(card.votes, MARGIN + scoreWidth + 32, foot)
  }
  // La firma, a la derecha de la llamada o de las cifras; el enlace, abajo a todo lo ancho.
  ctx.fillStyle = color.red
  ctx.font = DISPLAY(64)
  const sign = 'OTP.'
  ctx.fillText(sign, STORY_WIDTH - MARGIN - ctx.measureText(sign).width, foot)
  ctx.fillStyle = color.text3
  ctx.font = UI(34, 600)
  ctx.fillText(
    clip(ctx, card.url.replace(/^https?:\/\//, ''), STORY_WIDTH - 2 * MARGIN),
    MARGIN,
    STORY_HEIGHT - 80,
  )
}

/** La tarjeta como PNG. */
export async function storyPng(card: StoryCard): Promise<Blob> {
  const canvas = document.createElement('canvas')
  await drawStory(canvas, card)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Sin PNG'))), 'image/png'),
  )
}
