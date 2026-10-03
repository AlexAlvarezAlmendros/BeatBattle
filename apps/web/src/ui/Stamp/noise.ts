import { createRng } from '@beatbattle/rules'
import { color, texture } from '@beatbattle/shared/tokens'

/** Variable CSS con la máscara de ruido de los sellos (un `url(data:…)`), en `<html>`. */
export const STAMP_NOISE_VAR = '--arena-stamp-noise'

let painted = false

/**
 * Ruido de sello (guía §3.2 «Texturas»): una máscara de 180 px con 520 huecos (`--bb-tex-noise-*`),
 * generada con semilla —siempre la misma— y pintada una sola vez por página. Es el `noiseMask()` de
 * las maquetas (`final.js`). Sin canvas (jsdom) no hace nada: el sello se ve liso. La variable no lleva
 * el prefijo `--bb-`: no es un token, es una imagen que se genera al cargar.
 */
export function ensureStampNoise(): void {
  if (painted || typeof document === 'undefined') return
  painted = true
  // jsdom no pinta canvas (y avisa por consola si se le pide): en los tests el sello va liso.
  if (/jsdom/i.test(navigator.userAgent)) return
  const canvas = document.createElement('canvas')
  canvas.width = texture.noiseSize
  canvas.height = texture.noiseSize
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext('2d')
  } catch {
    ctx = null
  }
  if (!ctx) return
  const rng = createRng('sello')
  ctx.fillStyle = color.black
  ctx.fillRect(0, 0, texture.noiseSize, texture.noiseSize)
  ctx.globalCompositeOperation = 'destination-out'
  for (let hole = 0; hole < texture.noiseHoles; hole += 1) {
    ctx.globalAlpha = 0.25 + rng.next() * 0.75
    ctx.beginPath()
    ctx.arc(
      rng.next() * texture.noiseSize,
      rng.next() * texture.noiseSize,
      0.4 + rng.next() * 1.6,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
  document.documentElement.style.setProperty(STAMP_NOISE_VAR, `url(${canvas.toDataURL()})`)
}
