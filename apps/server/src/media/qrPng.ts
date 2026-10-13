import { color } from '@beatbattle/shared/tokens'
import QRCode from 'qrcode'
import { encodePng } from './png'

/**
 * El código QR del recibo (§2.12.1, §4.19.5; tarea 4.13): la matriz la calcula `qrcode` (modo byte,
 * Reed-Solomon y máscara, decisión del usuario del 2026-10-13) y se pinta con el mismo codificador PNG propio
 * que la onda. Módulos negros sobre blanco con el margen de silencio de 4 módulos que pide la norma: es lo que
 * leen bien todas las cámaras, aunque la tarjeta del email sea oscura.
 */

/** Píxeles por módulo: con la versión 4 (33 módulos + margen) sale un PNG de 246 px. */
export const QR_MODULE_PX = 6
/** Margen de silencio alrededor, en módulos (ISO/IEC 18004). */
export const QR_QUIET_MODULES = 4

const LIGHT = 0
const DARK = 1
const PALETTE = [color.white, color.black] as const

/** La matriz del QR de `text`: `size × size`, `true` en los módulos oscuros. Nivel de corrección M. */
export function qrMatrix(text: string): { size: number; dark: (x: number, y: number) => boolean } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  return { size: modules.size, dark: (x, y) => modules.get(y, x) === 1 }
}

/** El PNG del QR de `text`, con su margen de silencio. */
export function qrPng(text: string): Uint8Array {
  const { size, dark } = qrMatrix(text)
  const side = (size + 2 * QR_QUIET_MODULES) * QR_MODULE_PX
  const pixels = new Uint8Array(side * side).fill(LIGHT)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (!dark(x, y)) continue
      const left = (x + QR_QUIET_MODULES) * QR_MODULE_PX
      const top = (y + QR_QUIET_MODULES) * QR_MODULE_PX
      for (let py = top; py < top + QR_MODULE_PX; py++)
        pixels.fill(DARK, py * side + left, py * side + left + QR_MODULE_PX)
    }
  return encodePng({ width: side, height: side, palette: PALETTE, pixels })
}
