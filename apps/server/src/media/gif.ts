/**
 * Codificador GIF89a mínimo (tarea 3.14, §4.19.5): fotogramas de índices sobre una paleta fija de hasta
 * 4 colores (la de la arena), comprimidos con LZW. Sin dependencias: la cuenta atrás de los emails solo
 * necesita esto, y §4.1 no lista ninguna biblioteca de GIF.
 */

export interface GifFrame {
  /** Un índice de la paleta por píxel, fila a fila. */
  pixels: Uint8Array
  /** Duración en centésimas de segundo. */
  delayCs: number
}

/** Paleta: colores `#rrggbb`, hasta 4. */
export function encodeGif(input: {
  width: number
  height: number
  palette: readonly string[]
  frames: readonly GifFrame[]
}): Uint8Array {
  const { width, height, palette, frames } = input
  if (palette.length < 2 || palette.length > 4) throw new RangeError('La paleta tiene de 2 a 4 colores')
  const out: number[] = []
  const word = (value: number) => out.push(value & 0xff, (value >> 8) & 0xff)
  const ascii = (text: string) => {
    for (const char of text) out.push(char.charCodeAt(0))
  }

  ascii('GIF89a')
  word(width)
  word(height)
  // Tabla de color global de 4 entradas (2 bits): 1 001 0 001.
  out.push(0b1001_0001, 0, 0)
  for (let i = 0; i < 4; i++) {
    const hex = (palette[i] ?? palette[0] ?? '#000000').replace('#', '')
    out.push(
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    )
  }

  for (const frame of frames) {
    if (frame.pixels.length !== width * height) throw new RangeError('Fotograma de tamaño distinto')
    // Extensión de control gráfico: sin transparencia, con su retardo.
    out.push(0x21, 0xf9, 0x04, 0b0000_0100, frame.delayCs & 0xff, (frame.delayCs >> 8) & 0xff, 0, 0)
    // Descriptor de imagen: todo el lienzo, sin tabla local.
    out.push(0x2c)
    word(0)
    word(0)
    word(width)
    word(height)
    out.push(0)
    const minCodeSize = 2
    out.push(minCodeSize)
    const data = lzw(frame.pixels, minCodeSize)
    for (let i = 0; i < data.length; i += 255) {
      const block = data.subarray(i, i + 255)
      out.push(block.length, ...block)
    }
    out.push(0)
  }
  out.push(0x3b)
  return Uint8Array.from(out)
}

/** LZW de GIF: códigos de longitud variable (hasta 12 bits), bits de menor a mayor. */
export function lzw(pixels: Uint8Array, minCodeSize: number): Uint8Array {
  const clear = 1 << minCodeSize
  const end = clear + 1
  const bytes: number[] = []
  let bitBuffer = 0
  let bitCount = 0
  let codeSize = minCodeSize + 1
  const emit = (code: number) => {
    bitBuffer |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff)
      bitBuffer >>>= 8
      bitCount -= 8
    }
  }

  let dictionary = new Map<number, number>()
  let next = end + 1
  const reset = () => {
    dictionary = new Map()
    next = end + 1
    codeSize = minCodeSize + 1
  }

  emit(clear)
  let prefix = pixels[0] ?? 0
  for (let i = 1; i < pixels.length; i++) {
    const pixel = pixels[i] as number
    // Clave: prefijo (12 bits) y el píxel siguiente.
    const key = (prefix << 8) | pixel
    const found = dictionary.get(key)
    if (found !== undefined) {
      prefix = found
      continue
    }
    emit(prefix)
    // Como omggif: con la tabla llena, código de limpieza; si no, se amplía el tamaño antes de añadir.
    if (next === 4096) {
      emit(clear)
      reset()
    } else {
      if (next >= 1 << codeSize) codeSize++
      dictionary.set(key, next)
      next++
    }
    prefix = pixel
  }
  emit(prefix)
  emit(end)
  if (bitCount > 0) bytes.push(bitBuffer & 0xff)
  return Uint8Array.from(bytes)
}
