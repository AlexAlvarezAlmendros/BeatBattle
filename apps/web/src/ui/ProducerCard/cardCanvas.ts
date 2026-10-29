import { type AchievementId, achievementById } from '@beatbattle/rules'
import { angle, color, length, texture } from '@beatbattle/shared/tokens'
import { t } from '../../i18n'
import { ACHIEVEMENT_GLYPHS, glyphShapes } from '../AchievementBadge'
import { HALFTONE_SHAPES, paintHalftone } from '../arena/halftone'
import { OTP_SLAP } from '../OtpSlap'
import { type CardVariant, cardNumberLabel } from './cardModel'

/**
 * La carta de productor pintada en un lienzo 2D **por CPU** (guía §3.4.4, §3.4.5; tarea 7.28): el anverso de
 * `ProducerCard` (número, sello de nivel con su arco, retrato sobre trama con la foto o el monograma, etiqueta de
 * variante, corona, nombre, rango, victorias · podios · semanas, vitrina y pie con la pegatina), en su variante y con
 * lo que dice `cardModel`. No copia la carta HTML: la vuelve a dibujar desde el mismo modelo, a cualquier ancho (las
 * medidas son las de la carta de 352 px del perfil, escaladas). Lo usan la tarjeta para *stories* («Mi carta de
 * productor») y, con la 7.23, la textura de la carta 3D.
 *
 * El contexto se pide con `willReadFrequently: true` (rasterizado por CPU, como las portadas): el PNG sale igual en
 * cualquier máquina. Sin movimiento: la lámina queda quieta, en su posición de reposo.
 */

/** Lo que pinta la carta: lo mismo que enseña `ProducerCard` (de lo público del perfil, hueco G1). */
export interface CardFace {
  name: string
  initials: string
  cardNumber: number
  level: number
  /** Fracción del nivel en curso, `[0, 1]` (el arco del sello). */
  levelFraction: number
  /** El rango, ya en palabras («Beatmaker»). */
  rank: string
  stats: { wins: number; podiums: number; weeks: number }
  showcase: readonly AchievementId[]
  /** Logros públicos: «Vitrina · 2 de 14». */
  achievements?: number
  /** «03/2026». */
  since: string
  variant: CardVariant
  /** La foto del avatar ya decodificada (del mismo origen o con CORS); sin ella, el monograma. */
  photo?: CanvasImageSource | null
  /** La pegatina OTP ya decodificada; sin ella, «OTP.» en display. */
  slap?: CanvasImageSource | null
}

/** Ancho de la carta del perfil (`ProducerCard` a 352 px): las medidas de aquí se escalan desde él. */
export const CARD_BASE_WIDTH = 352
/** Proporción de la carta coleccionable (63 × 88). */
export const CARD_RATIO = 88 / 63

/**
 * Anybody en cursiva 900 con su anchura (`font-stretch`, en palabras: el lienzo no acepta porcentajes): `expanded` es el
 * 125 % de las placas (`--bb-stretch-plate`) y `extra-expanded`, el 150 % del display (`--bb-stretch-display`).
 */
const DISPLAY = (px: number, stretch: 'expanded' | 'extra-expanded' = 'expanded') =>
  `italic 900 ${stretch} ${px}px Anybody`
const UI = (px: number, weight = 700) => `${weight} ${px}px "Chakra Petch"`
const NUM = (px: number) => `800 ${px}px Oxanium`
const TAU = Math.PI * 2

/** Las fuentes del juego, cargadas antes de pintar (si no, el lienzo usa la de sistema). */
export async function loadCardFonts(): Promise<void> {
  if (!document.fonts) return
  await Promise.all(
    [DISPLAY(32), DISPLAY(32, 'extra-expanded'), UI(12), NUM(16)].map((font) =>
      document.fonts.load(font).catch(() => []),
    ),
  )
}

/** Una imagen decodificada, o `null` si no carga (sin CORS, la foto no podría ir al PNG: mejor el monograma). */
export function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/** Lo que la carta necesita cargado: las fuentes, la foto (si la hay) y la pegatina. */
export async function loadCardAssets(avatarUrl?: string | null) {
  const [, photo, slap] = await Promise.all([
    loadCardFonts(),
    loadImage(avatarUrl),
    loadImage(OTP_SLAP.png2x),
  ])
  return { photo, slap }
}

/** Alto de la carta a un ancho. */
export const cardHeight = (width: number) => Math.round(width * CARD_RATIO)

/** Trazado con chaflán arriba a la izquierda y abajo a la derecha (el marco de §3.3). */
function chamfer(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut: number) {
  ctx.beginPath()
  ctx.moveTo(x + cut, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w, y + h - cut)
  ctx.lineTo(x + w - cut, y + h)
  ctx.lineTo(x, y + h)
  ctx.lineTo(x, y + cut)
  ctx.closePath()
}

/** El cuerpo de letra más grande (hasta `size`) con el que `text` cabe en `width`. */
function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  size: number,
  font: (px: number) => string,
) {
  let px = size
  ctx.font = font(px)
  while (px > 8 && ctx.measureText(text).width > width) {
    px -= 1
    ctx.font = font(px)
  }
  return px
}

/** Recorta `text` hasta que quepa en `width`, con «…». */
function clip(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text
  let cut = text
  while (cut && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1)
  return `${cut}…`
}

/** Un lienzo nuevo con su contexto 2D por CPU. */
export function cpuCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Sin contexto 2D para la carta')
  return [canvas, ctx]
}

/** La lámina de la holo y de la de campeón, en reposo: una banda roja, blanca y granate a 118° y líneas finas. */
function foil(ctx: CanvasRenderingContext2D, w: number, h: number, u: number, strength: number) {
  const rad = ((118 - 90) * Math.PI) / 180
  const dx = Math.cos(rad) * w
  const dy = Math.sin(rad) * w
  const band = ctx.createLinearGradient(-0.06 * dx, -0.06 * dy, 0.74 * dx, 0.74 * dy)
  // En modo `screen` el negro no cambia nada: los bordes de la banda se funden sin transparencias literales.
  band.addColorStop(0, color.black)
  band.addColorStop(0.25, color.red)
  band.addColorStop(0.4, color.white)
  band.addColorStop(0.58, color.wine)
  band.addColorStop(0.75, color.red)
  band.addColorStop(1, color.black)
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = strength
  ctx.fillStyle = band
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = 0.08
  ctx.strokeStyle = color.white
  ctx.lineWidth = length.stroke * u
  const step = 8 * u
  for (let x = -h; x < w + h; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x - h * Math.tan(rad), h)
    ctx.stroke()
  }
  ctx.restore()
}

/** El monograma con su extrusión roja en capas y contorno negro (el `Monogram` de la carta HTML). */
function monogram(ctx: CanvasRenderingContext2D, initials: string, box: { x: number; y: number; w: number }) {
  // Las medidas del SVG de la carta: un dibujo de 200 × 120 con la letra de 96 y la base en 86.
  const k = box.w / 200
  ctx.save()
  ctx.translate(box.x + box.w / 2, box.y + 60 * k)
  ctx.rotate((angle.tiltCard * Math.PI) / 180)
  ctx.translate(-100 * k, -60 * k)
  ctx.font = DISPLAY(96 * k, 'extra-expanded')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 10 * k
  ctx.strokeStyle = color.black
  for (const step of [6, 5, 4, 3, 2, 1, 0]) {
    const x = (100 + step * 1.6) * k
    const y = (86 + step * 1.8) * k
    ctx.strokeText(initials, x, y)
    ctx.fillStyle = step === 0 ? color.white : color.redCta
    ctx.fillText(initials, x, y)
  }
  ctx.restore()
}

/** Una insignia de la vitrina: el marco de su rareza (chaflán `md`) y su glifo. */
function badge(
  ctx: CanvasRenderingContext2D,
  id: AchievementId,
  x: number,
  y: number,
  size: number,
  u: number,
) {
  const { rarity } = achievementById(id)
  const cut = length.cutMd * u
  const stroke = length.stroke * u
  let border: string | CanvasGradient = color.lineStrong
  if (rarity === 'rare') border = color.red
  if (rarity === 'legendary') border = color.white
  if (rarity === 'epic') {
    const holo = ctx.createConicGradient(((30 - 90) * Math.PI) / 180, x + size / 2, y + size / 2)
    const stops = [color.red, color.white, color.wine, color.red, color.white, color.wine, color.red]
    for (const [i, stop] of stops.entries()) holo.addColorStop(i / (stops.length - 1), stop)
    border = holo
  }
  ctx.fillStyle = border
  chamfer(ctx, x, y, size, size, cut)
  ctx.fill()
  ctx.fillStyle = rarity === 'legendary' ? color.redCta : color.panel
  chamfer(ctx, x + stroke, y + stroke, size - 2 * stroke, size - 2 * stroke, cut - stroke * 0.586)
  ctx.fill()
  if (rarity === 'legendary') {
    // La trama de relleno (§3.2): un punto cada 8 px.
    ctx.save()
    chamfer(ctx, x + stroke, y + stroke, size - 2 * stroke, size - 2 * stroke, cut - stroke * 0.586)
    ctx.clip()
    ctx.fillStyle = color.redShade
    for (let py = y; py < y + size; py += texture.fillCell * u)
      for (let px = x; px < x + size; px += texture.fillCell * u) {
        ctx.beginPath()
        ctx.arc(px, py, texture.fillDot * u, 0, TAU)
        ctx.fill()
      }
    ctx.restore()
  }
  const ink = rarity === 'rare' ? color.red : rarity === 'legendary' ? color.black : color.white
  const g = (size * 0.52) / 24
  ctx.save()
  ctx.translate(x + size * 0.24, y + size * 0.24)
  ctx.scale(g, g)
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  for (const shape of glyphShapes(ACHIEVEMENT_GLYPHS[id])) {
    const path = new Path2D()
    if (shape.kind === 'path') path.addPath(new Path2D(shape.d))
    else path.arc(shape.cx, shape.cy, shape.r, 0, TAU)
    if (shape.solid) ctx.fill(path)
    else ctx.stroke(path)
  }
  ctx.restore()
}

/** Pinta el anverso de la carta en `ctx`, desde (0, 0) y a `width` px de ancho (el alto, `cardHeight`). */
export function paintCardFace(ctx: CanvasRenderingContext2D, face: CardFace, width: number): void {
  const u = width / CARD_BASE_WIDTH
  const height = cardHeight(width)
  const stroke = length.strokeCursor * u
  const cut = length.cutLg * u
  const { variant } = face
  ctx.save()
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  // El marco: borde (holo: lámina de colores) y relleno negro.
  if (variant === 'holo') {
    const holo = ctx.createConicGradient(((200 - 90) * Math.PI) / 180, width / 2, height / 2)
    const stops = [color.red, color.white, color.wine, color.red, color.white, color.wine, color.red]
    for (const [i, stop] of stops.entries()) holo.addColorStop(i / (stops.length - 1), stop)
    ctx.fillStyle = holo
  } else ctx.fillStyle = variant === 'red' || variant === 'champion' ? color.red : color.white
  chamfer(ctx, 0, 0, width, height, cut)
  ctx.fill()
  ctx.fillStyle = color.black
  chamfer(ctx, stroke, stroke, width - 2 * stroke, height - 2 * stroke, cut - stroke * 0.586)
  ctx.fill()

  // El retrato: la mitad de arriba, recortada con el chaflán, con su fondo, la trama y la lámina.
  const art = { x: stroke, y: stroke, w: width - 2 * stroke, h: Math.round(height * 0.5) }
  const artCut = cut - stroke * 0.586
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(art.x + artCut, art.y)
  ctx.lineTo(art.x + art.w, art.y)
  ctx.lineTo(art.x + art.w, art.y + art.h)
  ctx.lineTo(art.x, art.y + art.h)
  ctx.lineTo(art.x, art.y + artCut)
  ctx.closePath()
  ctx.clip()
  ctx.translate(art.x, art.y)
  if (variant === 'red') ctx.fillStyle = color.redCta
  else {
    const fill = ctx.createLinearGradient(0, 0, 0, art.h)
    if (variant === 'champion') {
      fill.addColorStop(0, color.redShade)
      fill.addColorStop(0.6, color.wine2)
    } else {
      fill.addColorStop(0, color.wine2)
      fill.addColorStop(0.7, color.wine3)
    }
    fill.addColorStop(1, color.black)
    ctx.fillStyle = fill
  }
  ctx.fillRect(0, 0, art.w, art.h)
  const [dots, dotsCtx] = cpuCanvas(Math.ceil(art.w), Math.ceil(art.h))
  paintHalftone(dotsCtx, art.w, art.h, {
    cell: texture.halftoneCell * u,
    ink: variant === 'red' ? color.redShade : color.red,
    shape: HALFTONE_SHAPES.podiumFloor,
  })
  ctx.drawImage(dots, 0, 0)
  // El retrato: la foto con su marco blanco o el monograma (un dibujo: puede ir sobre la trama, `RD-VIS-05`).
  if (face.photo) {
    const px = art.w * 0.24
    const py = art.h * 0.18
    const pw = art.w * 0.52
    const ph = art.h * 0.66
    const side = Math.min(pw, ph)
    const sx = px + (pw - side) / 2
    const sy = py + (ph - side) / 2
    ctx.fillStyle = color.white
    ctx.fillRect(
      sx - length.stroke * u,
      sy - length.stroke * u,
      side + 2 * length.stroke * u,
      side + 2 * length.stroke * u,
    )
    ctx.drawImage(face.photo, sx, sy, side, side)
  } else monogram(ctx, face.initials, { x: art.w * 0.18, y: art.h * 0.16, w: art.w * 0.64 })
  if (variant === 'holo' || variant === 'champion') foil(ctx, art.w, art.h, u, variant === 'holo' ? 0.5 : 0.3)
  ctx.restore()

  // El número, en su placa opaca.
  ctx.font = NUM(Math.max(12, 4.2 * 3.52) * u)
  const number = cardNumberLabel(face.cardNumber)
  const numberWidth = ctx.measureText(number).width
  const plate = { x: 16 * u, y: 16 * u, w: numberWidth + 16 * u, h: 22 * u }
  ctx.fillStyle = color.lineStrong
  ctx.fillRect(plate.x, plate.y, plate.w, plate.h)
  ctx.fillStyle = color.black
  const ps = length.stroke * u
  ctx.fillRect(plate.x + ps, plate.y + ps, plate.w - 2 * ps, plate.h - 2 * ps)
  ctx.fillStyle = color.white
  ctx.fillText(number, plate.x + 8 * u, plate.y + plate.h - 6 * u)

  // El sello de nivel: círculo negro con el arco de progreso en rojo.
  const seal = Math.max(48, 17.6 * 3.52) * u
  const sx = width - 12 * u - seal / 2
  const sy = 12 * u + seal / 2
  ctx.fillStyle = color.ink4
  ctx.beginPath()
  ctx.arc(sx, sy, seal / 2, 0, TAU)
  ctx.fill()
  const fraction = Math.max(0, Math.min(1, face.levelFraction))
  if (fraction > 0) {
    ctx.fillStyle = color.red
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.arc(sx, sy, seal / 2, -Math.PI / 2, -Math.PI / 2 + fraction * TAU)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = color.black
  ctx.beginPath()
  ctx.arc(sx, sy, seal / 2 - stroke, 0, TAU)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.fillStyle = color.white
  ctx.font = DISPLAY(6.8 * 3.52 * u)
  ctx.fillText(String(face.level), sx, sy + 4 * u)
  ctx.fillStyle = color.text2
  ctx.font = UI(12 * u)
  ctx.fillText(t('ui.producerCard.levelShort').toUpperCase(), sx, sy + 17 * u)
  ctx.textAlign = 'left'

  // La corona de la de campeón.
  if (variant === 'champion') {
    const cw = 16 * 3.52 * u
    ctx.save()
    ctx.translate(width / 2 - cw / 2, 8 * u)
    ctx.scale(cw / 24, cw / 24)
    const crown = new Path2D('M3 18L2 7l6 5 4-8 4 8 6-5-1 11z')
    ctx.fillStyle = color.red
    ctx.fill(crown)
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.strokeStyle = color.black
    ctx.stroke(crown)
    ctx.restore()
  }

  // La etiqueta de variante: una pegatina en paralelogramo al pie del retrato, girada −3°.
  if (variant !== 'standard') {
    const text = t(`ui.producerCard.variants.${variant}.tag`, { wins: face.stats.wins }).toUpperCase()
    ctx.font = DISPLAY(12 * u)
    const slant = length.slantSm * u
    const tw = ctx.measureText(text).width + 2 * (slant + 4 * u)
    const th = 22 * u
    ctx.save()
    ctx.translate(16 * u, art.y + art.h - 12 * u - th)
    ctx.rotate((angle.tiltCard * Math.PI) / 180)
    ctx.fillStyle = variant === 'champion' ? color.red : color.white
    ctx.beginPath()
    ctx.moveTo(slant, 0)
    ctx.lineTo(tw, 0)
    ctx.lineTo(tw - slant, th)
    ctx.lineTo(0, th)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = color.black
    ctx.fillText(text, slant + 4 * u, th - 6 * u)
    ctx.restore()
  }

  // El cuerpo: nombre, rango, cifras, vitrina y pie.
  const pad = 16 * u
  const inner = width - 2 * pad
  let y = art.y + art.h + 12 * u
  // El nombre, en display y en mayúsculas como `.bb-display`, en una línea (baja el cuerpo antes que cortarlo).
  const name = face.name.toUpperCase()
  const nameSize = fitSize(ctx, name, inner, Math.min(9 * 3.52, 32) * u, DISPLAY)
  ctx.fillStyle = color.white
  ctx.fillText(name, pad, y + nameSize * 0.85)
  y += nameSize + 8 * u
  ctx.font = UI(12 * u)
  ctx.letterSpacing = `${1.5 * u}px`
  ctx.fillStyle = color.red
  ctx.fillText(clip(ctx, face.rank.toUpperCase(), inner), pad, y + 10 * u)
  y += 12 * u + 8 * u

  // Victorias · podios · semanas, entre filetes.
  const statsH = 52 * u
  ctx.fillStyle = color.line
  ctx.fillRect(pad, y, inner, length.strokeHair * u)
  ctx.fillRect(pad, y + statsH - length.strokeHair * u, inner, length.strokeHair * u)
  const col = inner / 3
  ;(['wins', 'podiums', 'weeks'] as const).forEach((key, i) => {
    const cx = pad + col * i + col / 2
    if (i > 0) {
      ctx.fillStyle = color.line
      ctx.fillRect(pad + col * i, y, length.strokeHair * u, statsH)
    }
    ctx.textAlign = 'center'
    ctx.letterSpacing = '0px'
    ctx.fillStyle = color.white
    ctx.font = NUM(Math.max(20, 6.4 * 3.52) * u)
    ctx.fillText(String(face.stats[key]), cx, y + 28 * u)
    ctx.fillStyle = color.text3
    ctx.font = UI(12 * u)
    ctx.letterSpacing = `${0.75 * u}px`
    ctx.fillText(clip(ctx, t(`ui.producerCard.stats.${key}`).toUpperCase(), col - 8 * u), cx, y + 44 * u)
  })
  ctx.textAlign = 'left'
  y += statsH + 8 * u

  // La vitrina: tres huecos (los vacíos, en silueta) y su rótulo.
  const slot = Math.max(32, 12 * 3.52) * u
  for (let i = 0; i < 3; i++) {
    const x = pad + i * (slot + 8 * u)
    const id = face.showcase[i]
    if (id) badge(ctx, id, x, y, slot, u)
    else {
      ctx.save()
      ctx.strokeStyle = color.lineStrong
      ctx.lineWidth = length.stroke * u
      ctx.setLineDash([4 * u, 3 * u])
      ctx.strokeRect(x + u, y + u, slot - 2 * u, slot - 2 * u)
      ctx.restore()
    }
  }
  const caseX = pad + 3 * slot + 3 * 8 * u + 4 * u
  ctx.fillStyle = color.text2
  ctx.font = UI(12 * u)
  ctx.letterSpacing = `${1.5 * u}px`
  ctx.fillText(t('ui.producerCard.showcaseShort').toUpperCase(), caseX, y + slot / 2 - 2 * u)
  if (face.achievements)
    ctx.fillText(
      t('ui.producerCard.showcaseCount', {
        shown: face.showcase.slice(0, 3).length,
        total: face.achievements,
      }).toUpperCase(),
      caseX,
      y + slot / 2 + 14 * u,
    )

  // El pie: «Beat Battle · desde 03/2026» y la pegatina.
  const footY = height - 12 * u - stroke
  ctx.fillStyle = color.text3
  ctx.font = UI(12 * u)
  ctx.fillText(t('ui.producerCard.since', { since: face.since }).toUpperCase(), pad, footY - 8 * u)
  ctx.letterSpacing = '0px'
  if (face.slap) {
    const slapH = 30 * u
    const slapW = (slapH * Number(OTP_SLAP.width)) / Number(OTP_SLAP.height)
    ctx.drawImage(face.slap, width - pad - slapW, footY - slapH, slapW, slapH)
  } else {
    ctx.fillStyle = color.red
    ctx.font = DISPLAY(20 * u)
    ctx.textAlign = 'right'
    ctx.fillText('OTP.', width - pad, footY - 6 * u)
  }
  ctx.restore()
}

/** La carta en un lienzo propio por CPU, a `width` px de ancho. */
export function cardFaceCanvas(face: CardFace, width: number): HTMLCanvasElement {
  const [canvas, ctx] = cpuCanvas(Math.round(width), cardHeight(width))
  paintCardFace(ctx, face, Math.round(width))
  return canvas
}
