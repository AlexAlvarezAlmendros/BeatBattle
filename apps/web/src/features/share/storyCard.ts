import { coverContext, paintCover } from '@beatbattle/covers'
import { angle, color } from '@beatbattle/shared/tokens'
import { t } from '../../i18n'
import { type CardFace, cardFaceCanvas, cardHeight, loadCardFonts } from '../../ui/ProducerCard/cardCanvas'

/**
 * Tarjetas para stories (§2.15, `RF-SHARE-03`; tarea 6.14): un PNG de 1080 × 1920 que se pinta en el navegador
 * (contexto 2D por CPU, como las portadas) con las fuentes del juego y los textos de `stories.*`. «Estoy en la batalla #N» (la propia
 * entrada, sin sellar: dice «Escúchala y vota», nunca «Vota a X», §2.15), «He quedado N.º» (tras el sellado) y «Mi
 * carta de productor» (tarea 7.28: la carta pintada por CPU desde `cardModel`, `cardCanvas`, con lo público del perfil).
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
  | {
      kind: 'producer'
      /** La carta, con la foto y la pegatina ya cargadas (`loadCardAssets`). */
      card: CardFace
      /** La dirección del perfil. */
      url: string
    }

/** Ancho de la carta en la tarjeta: con su giro de −3°, deja sitio al titular y al pie. */
const CARD_WIDTH = 640

const DISPLAY = (px: number) => `italic 900 ${px}px Anybody`
const UI = (px: number, weight = 700) => `${weight} ${px}px "Chakra Petch"`
const NUM = (px: number) => `800 ${px}px Oxanium`

/** Las fuentes del juego, cargadas antes de pintar (si no, el lienzo usa la de sistema). */
async function loadFonts(): Promise<void> {
  if (!document.fonts) return
  await Promise.all([
    loadCardFonts(),
    ...[DISPLAY(120), UI(44), UI(40, 600), NUM(64)].map((font) => document.fonts.load(font).catch(() => [])),
  ])
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

function cover(card: Exclude<StoryCard, { kind: 'producer' }>): HTMLCanvasElement {
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
  if (card.kind === 'producer') {
    drawProducer(ctx, card)
    return
  }

  // Arriba: el juego y la semana.
  ctx.fillStyle = color.red
  ctx.font = UI(44)
  ctx.fillText(t('stories.week', { number: card.weekNumber }).toUpperCase(), MARGIN, 190)

  // El titular.
  ctx.fillStyle = color.white
  if (card.kind === 'battle') {
    ctx.font = DISPLAY(124)
    ctx.fillText(t('stories.battle.line1').toUpperCase(), MARGIN, 350)
    ctx.fillText(t('stories.battle.line2').toUpperCase(), MARGIN, 480)
  } else {
    ctx.font = DISPLAY(124)
    ctx.fillText(t('stories.result.line1').toUpperCase(), MARGIN, 350)
    ctx.fillStyle = card.position === 1 ? color.red : color.white
    ctx.font = DISPLAY(150)
    ctx.fillText(t('stories.result.position', { position: card.position }), MARGIN, 500)
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
  ctx.fillText(t('stories.sample', { title: card.sampleTitle }), MARGIN, ty + 70)

  // Abajo: la llamada (o las cifras) y la firma.
  const foot = STORY_HEIGHT - 170
  if (card.kind === 'battle') {
    ctx.font = UI(48)
    const label = t('stories.battle.call').toUpperCase()
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

/** El titular más grande (hasta `size`) que cabe en el ancho de la tarjeta. */
function headline(ctx: CanvasRenderingContext2D, text: string, size: number): number {
  let px = size
  ctx.font = DISPLAY(px)
  while (px > 48 && ctx.measureText(text).width > STORY_WIDTH - 2 * MARGIN) {
    px -= 2
    ctx.font = DISPLAY(px)
  }
  return px
}

/** El pie común: la llamada en su placa, la firma a la derecha y la dirección abajo. */
function foot(ctx: CanvasRenderingContext2D, call: string, url: string) {
  const y = STORY_HEIGHT - 170
  ctx.font = UI(48)
  const w = ctx.measureText(call).width + 64
  ctx.fillStyle = color.redCta
  ctx.fillRect(MARGIN, y - 66, w, 90)
  ctx.fillStyle = color.white
  ctx.fillText(call, MARGIN + 32, y - 4)
  ctx.fillStyle = color.red
  ctx.font = DISPLAY(64)
  const sign = 'OTP.'
  ctx.fillText(sign, STORY_WIDTH - MARGIN - ctx.measureText(sign).width, y)
  ctx.fillStyle = color.text3
  ctx.font = UI(34, 600)
  ctx.fillText(
    clip(ctx, url.replace(/^https?:\/\//, ''), STORY_WIDTH - 2 * MARGIN),
    MARGIN,
    STORY_HEIGHT - 80,
  )
}

/** «Mi carta de productor»: el titular, la carta inclinada −3° (§3.4.4) y el pie con la dirección del perfil. */
function drawProducer(ctx: CanvasRenderingContext2D, card: Extract<StoryCard, { kind: 'producer' }>) {
  ctx.fillStyle = color.red
  ctx.font = UI(44)
  ctx.fillText(t('stories.producer.kicker').toUpperCase(), MARGIN, 190)
  ctx.fillStyle = color.white
  for (const [key, y] of [
    ['stories.producer.line1', 340],
    ['stories.producer.line2', 470],
  ] as const) {
    const line = t(key).toUpperCase()
    headline(ctx, line, 124)
    ctx.fillText(line, MARGIN, y)
  }

  const face = cardFaceCanvas(card.card, CARD_WIDTH)
  const height = cardHeight(CARD_WIDTH)
  const cx = STORY_WIDTH / 2
  const cy = 560 + height / 2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((angle.tiltCard * Math.PI) / 180)
  ctx.drawImage(face, -CARD_WIDTH / 2, -height / 2)
  ctx.restore()

  foot(ctx, t('stories.producer.call').toUpperCase(), card.url)
}

/** La tarjeta como PNG. */
export async function storyPng(card: StoryCard): Promise<Blob> {
  const canvas = document.createElement('canvas')
  await drawStory(canvas, card)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Sin PNG'))), 'image/png'),
  )
}
