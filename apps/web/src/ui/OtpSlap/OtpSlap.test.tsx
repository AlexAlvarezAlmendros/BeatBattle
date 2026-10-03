/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { color } from '@beatbattle/shared/tokens'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { OTP_SIGNATURE_HREF, OTP_SLAP, OtpSlap } from './OtpSlap'
import slapCss from './OtpSlap.module.css?raw'
import manifest from './otp-slap.json'

/** `apps/web/public/img`, desde esta carpeta (en jsdom, `import.meta.url` no es una ruta del disco). */
const publicImg = (name: string) => path.resolve(import.meta.dirname, '../../../public/img', name)

/** Ancho y alto de un PNG (cabecera IHDR). */
function pngSize(bytes: Buffer) {
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** Ancho y alto de un WebP (VP8, VP8L o VP8X). */
function webpSize(bytes: Buffer) {
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF')
  expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP')
  const chunk = bytes.subarray(12, 16).toString('ascii')
  if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) }
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21)
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
  }
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
}

/** Trozos de un fichero RIFF/WebP (tipo y tamaño), en orden. */
function webpChunks(bytes: Buffer) {
  const chunks: string[] = []
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = bytes.readUInt32LE(at + 4)
    chunks.push(bytes.subarray(at, at + 4).toString('ascii'))
    at += 8 + size + (size % 2)
  }
  return chunks
}

/**
 * Píxeles RGBA de un PNG de 8 bits por canal, RGBA y sin entrelazar (lo que exporta el canvas de
 * Chrome): IDAT inflado y los cinco filtros de línea deshechos.
 */
function pngPixels(bytes: Buffer) {
  const { width, height } = pngSize(bytes)
  expect([bytes[24], bytes[25], bytes[28]], 'PNG de 8 bits, RGBA y sin entrelazar').toEqual([8, 6, 0])
  const idat: Buffer[] = []
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(at)
    if (bytes.subarray(at + 4, at + 8).toString('ascii') === 'IDAT') {
      idat.push(bytes.subarray(at + 8, at + 8 + length))
    }
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const px = new Uint8Array(height * stride)
  const at = (x: number, y: number) => (x >= 0 && y >= 0 ? px[y * stride + x]! : 0)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!
    expect(filter, `filtro PNG de la línea ${y}`).toBeLessThanOrEqual(4)
    for (let x = 0; x < stride; x += 1) {
      const left = at(x - 4, y)
      const up = at(x, y - 1)
      const upLeft = at(x - 4, y - 1)
      const p = left + up - upLeft
      const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)]
      const paeth = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      const predictor = [0, left, up, (left + up) >> 1, paeth][filter]!
      px[y * stride + x] = (raw[y * (stride + 1) + 1 + x]! + predictor) & 0xff
    }
  }
  return { width, height, px }
}

/**
 * Píxeles opacos de la pegatina: cuántos hay, cuántos son el rojo de marca exacto y qué colores se
 * salen de la arista negro–rojo (sin blanco, `g = 0`: el borde de corte y el contorno negro del logo
 * fundido con él), donde el azul tiene que ser 60/255 del rojo (±1 por el redondeo).
 */
function cutStats(px: Uint8Array) {
  let opaque = 0
  let red = 0
  const off = new Map<string, number>()
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b, a] = [px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!]
    if (a !== 255) continue
    opaque += 1
    if (r === RED[0] && g === RED[1] && b === RED[2]) red += 1
    else if (g === 0 && (r === 255 || Math.abs(b - (RED[2]! * r) / 255) > 1)) {
      const key = `rgb(${r}, ${g}, ${b})`
      off.set(key, (off.get(key) ?? 0) + 1)
    }
  }
  return { opaque, red, off: [...off].sort((x, y) => y[1] - x[1]) }
}

/** El rojo de marca (`--bb-red`) en bytes. */
const RED = [1, 3, 5].map((i) => Number.parseInt(color.red.slice(i, i + 2), 16))

describe('OtpSlap — pegatina OTP (§3.1 «La firma», §3.3, RF-OTP-01)', () => {
  it('RF-OTP-01: enlaza al sello en otra pestaña con su nombre accesible y data-otp-signature', () => {
    render(<OtpSlap />)
    const link = screen.getByRole('link', { name: t('ui.otpSlap.label') })
    expect(link).toHaveAttribute('href', OTP_SIGNATURE_HREF)
    expect(link).toHaveAttribute('data-otp-signature')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(OTP_SIGNATURE_HREF).toBe('https://www.otherpeople.es/')
  })

  it('la imagen es decorativa (el nombre lo da el enlace), en WebP con PNG de reserva y a 1× y 2×', () => {
    const { container } = render(<OtpSlap size="title" />)
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('src', OTP_SLAP.png)
    expect(img).toHaveAttribute('srcset', `${OTP_SLAP.png} 1x, ${OTP_SLAP.png2x} 2x`)
    expect(img).toHaveAttribute('width', String(manifest.width))
    expect(img).toHaveAttribute('height', String(manifest.height))
    expect(container.querySelector('source')).toHaveAttribute('type', 'image/webp')
    expect(container.querySelector('source')).toHaveAttribute(
      'srcset',
      `${OTP_SLAP.webp} 1x, ${OTP_SLAP.webp2x} 2x`,
    )
  })

  it('sin enlace, solo la imagen (va dentro de un enlace que ya lleva la firma)', () => {
    const { container } = render(<OtpSlap linked={false} size="bar" />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('[data-otp-signature]')).toBeNull()
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('RD-VIS-01: girada −7° con su token; nunca otro giro ni recolor', () => {
    const css = slapCss.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).toMatch(/transform: rotate\(var\(--bb-tilt-sticker\)\)/)
    expect(css).not.toMatch(/filter|mix-blend|hue/)
  })

  it('las imágenes generadas existen con el tamaño del manifiesto (1× y 2×, WebP y PNG)', () => {
    expect(manifest.cut).toBe(4)
    expect(manifest.files).toEqual(['otp-slap.png', 'otp-slap.webp', 'otp-slap@2x.png', 'otp-slap@2x.webp'])
    for (const [name, scale] of [
      ['otp-slap.png', 1],
      ['otp-slap@2x.png', 2],
    ] as const) {
      expect(pngSize(readFileSync(publicImg(name))), name).toEqual({
        width: manifest.width * scale,
        height: manifest.height * scale,
      })
    }
    for (const [name, scale] of [
      ['otp-slap.webp', 1],
      ['otp-slap@2x.webp', 2],
    ] as const) {
      expect(webpSize(readFileSync(publicImg(name))), name).toEqual({
        width: manifest.width * scale,
        height: manifest.height * scale,
      })
    }
  })

  it('RD-VIS-02 a: el borde de corte es --bb-red exacto, rgb(255, 0, 60), en todo píxel opaco (PNG a 1× y 2×)', () => {
    expect(RED).toEqual([255, 0, 60])
    for (const name of ['otp-slap.png', 'otp-slap@2x.png']) {
      const { px } = pngPixels(readFileSync(publicImg(name)))
      const { opaque, red, off } = cutStats(px)
      // Ningún rojo derivado (el azul no baja de 60) ni mezcla con el negro fuera de la arista.
      expect(off, name).toEqual([])
      // El borde existe: un anillo de 4 px alrededor del logo es más del 10 % de lo opaco.
      expect(red / opaque, name).toBeGreaterThan(0.1)
    }
  })

  it('RD-VIS-02 a: las WebP (las que pinta el navegador) son sin pérdida, VP8L', () => {
    // Con pérdida (VP8), el submuestreo de croma corría el azul del borde entre 40 y 67 y le metía
    // verde. Sin pérdida, son los mismos píxeles que las PNG (el generador lo comprueba al exportar).
    for (const name of ['otp-slap.webp', 'otp-slap@2x.webp']) {
      const chunks = webpChunks(readFileSync(publicImg(name)))
      expect(chunks, name).toContain('VP8L')
      expect(chunks, name).not.toContain('VP8 ')
    }
  })
})
