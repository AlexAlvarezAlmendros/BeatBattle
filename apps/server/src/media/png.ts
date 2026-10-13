import { deflateSync } from 'node:zlib'

/**
 * Codificador PNG propio (tarea 4.12), sin dependencias: imagen de color indexado de 8 bits (tipo 3) con
 * su paleta, filas sin filtro y `IDAT` comprimido con `node:zlib`. Lo justo para las imágenes de los
 * emails, que el servidor dibuja píxel a píxel (como el GIF de la cuenta atrás, §4.19.5).
 */

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 de PNG (ISO 3309) sobre el tipo y los datos de un bloque. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** `#rrggbb` → `[r, g, b]`. */
function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/**
 * PNG de `width × height` con `pixels` (un índice de `palette` por píxel, fila a fila). La paleta son
 * colores `#rrggbb` (como mucho 256).
 */
export function encodePng(input: {
  width: number
  height: number
  palette: readonly string[]
  pixels: Uint8Array
}): Uint8Array {
  const { width, height, palette, pixels } = input
  if (pixels.length !== width * height) throw new RangeError('Los píxeles no cuadran con el tamaño')
  if (palette.length === 0 || palette.length > 256) throw new RangeError('Paleta de 1 a 256 colores')
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header[8] = 8 // bits por muestra
  header[9] = 3 // color indexado
  const plte = new Uint8Array(palette.length * 3)
  for (const [i, hex] of palette.entries()) plte.set(rgb(hex), i * 3)
  // Cada fila empieza con su filtro (0: ninguno).
  const raw = new Uint8Array((width + 1) * height)
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1)
  const parts = [
    SIGNATURE,
    chunk('IHDR', header),
    chunk('PLTE', plte),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
