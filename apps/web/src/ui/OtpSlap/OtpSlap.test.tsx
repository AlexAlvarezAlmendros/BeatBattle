/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
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
})
