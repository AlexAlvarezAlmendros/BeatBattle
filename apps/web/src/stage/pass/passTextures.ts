import { color, font, length } from '@beatbattle/shared/tokens'
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
} from 'three'
import { cardArtBox, paintFoilSheet } from '../../ui/ProducerCard/cardCanvas'
import type { CardVariant } from '../../ui/ProducerCard/cardModel'

/**
 * Texturas del pase (guía §3.4.4; tarea 7.23), pintadas por CPU en lienzos 2D (`willReadFrequently`, como las portadas
 * y el vinilo, §3.4.5 y §4.7.5): la cinta roja con «OTP.» impreso, el metal de la pinza y del remache, y la lámina que
 * se mueve con la inclinación (la de la carta, de `cardCanvas`). Todo en la paleta: el metal es una mezcla de blanco y
 * negro.
 */

/** Una textura de un lienzo pintado por CPU. */
export function canvasTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
  options: { repeat?: boolean } = {},
): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (ctx) paint(ctx)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = NoColorSpace
  if (options.repeat) {
    texture.wrapS = RepeatWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.minFilter = LinearMipmapLinearFilter
  } else {
    texture.generateMipmaps = false
    texture.minFilter = LinearFilter
  }
  return texture
}

/** Alto (px) del lienzo de la cinta, a lo ancho de la cinta; su largo va en proporción a un tramo de «OTP.». */
const RIBBON_PX = 64

/**
 * La cinta: roja, con un filete granate a cada lado y «OTP.» en blanco, en display cursiva, a lo largo. La textura se
 * repite a lo largo (el eje u de la tira va del remache a la pinza).
 */
export function ribbonTexture(widthToTile: number): CanvasTexture {
  const height = RIBBON_PX
  const width = Math.round(height * widthToTile)
  return canvasTexture(
    width,
    height,
    (ctx) => {
      ctx.fillStyle = color.red
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = color.redShade
      const rule = Math.max(2, Math.round(height * 0.06))
      ctx.fillRect(0, rule, width, rule)
      ctx.fillRect(0, height - 2 * rule, width, rule)
      ctx.fillStyle = color.white
      ctx.font = `italic 900 ${Math.round(height * 0.56)}px ${font.display}`
      ctx.fontStretch = 'expanded'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('OTP.', width / 2, height / 2 + height * 0.03)
    },
    { repeat: true },
  )
}

/**
 * El metal (pinza y remache): un degradado vertical de grises (blanco y negro mezclados) con un brillo arriba y el
 * canto oscuro abajo. Plano, sin reflejos de entorno.
 */
export function metalTexture(): CanvasTexture {
  const size = 64
  return canvasTexture(size, size, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, size)
    gradient.addColorStop(0, color.faceWhiteTint)
    gradient.addColorStop(0.18, color.text2)
    gradient.addColorStop(0.55, color.text3)
    gradient.addColorStop(0.85, color.text4)
    gradient.addColorStop(1, color.ink4)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    ctx.globalAlpha = 0.7
    ctx.fillStyle = color.white
    ctx.fillRect(0, size * 0.1, size, length.strokeHair * 2)
  })
}

/** Margen de la hoja de la lámina a cada lado del retrato, en fracción de su ancho: el recorrido de la inclinación. */
export const FOIL_BLEED = 0.5

/**
 * La lámina de las cartas holo y de campeón para una carta de `width` px de textura: la hoja de `paintFoilSheet` (la
 * misma lámina que pinta la carta entera, en su sitio de reposo) con medio retrato de margen a cada lado. La vista enseña
 * el ancho del retrato (`repeat.x`) y desplaza la hoja con la inclinación (`offset.x`; en reposo, `foilRest`).
 */
export function foilTexture(variant: CardVariant, width: number): CanvasTexture {
  const art = cardArtBox(width)
  const bleed = Math.round(art.w * FOIL_BLEED)
  const sheet = art.w + 2 * bleed
  const texture = canvasTexture(sheet, art.h, (ctx) => paintFoilSheet(ctx, variant, width, bleed))
  texture.repeat.set(art.w / sheet, 1)
  texture.offset.set(bleed / sheet, 0)
  texture.userData.rest = bleed / sheet
  return texture
}
