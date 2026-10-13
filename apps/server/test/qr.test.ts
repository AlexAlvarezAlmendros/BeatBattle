import { inflateSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { QR_MODULE_PX, QR_QUIET_MODULES, qrMatrix, qrPng } from '../src/media/qrPng'
import { entryPageUrl, qrUrl } from '../src/modules/entries/qrRoute'
import { makeApp, type TestApp } from './helpers'

/** Ancho, alto e índices de paleta de un PNG de 8 bits con paleta y filas sin filtro (el de `png.ts`). */
function decode(png: Uint8Array): { side: number; at: (x: number, y: number) => number } {
  const buffer = Buffer.from(png)
  let offset = 8
  let width = 0
  const idat: Buffer[] = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') width = data.readUInt32BE(0)
    if (type === 'IDAT') idat.push(data)
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  return { side: width, at: (x, y) => raw[y * (width + 1) + 1 + x] as number }
}

const path = (url: string) => url.replace(/^https?:\/\/[^/]+/, '')

let t: TestApp | undefined
afterEach(async () => {
  await t?.app.close()
  t = undefined
})

describe('QR del recibo (§2.12.1, §4.19.5; 4.13)', () => {
  it('RF-NOTIF-06: el PNG pinta la matriz de qrcode módulo a módulo, con 4 módulos de silencio blancos', () => {
    const url = entryPageUrl('https://battle.otherpeople.es', '01a12d31-c980-77b9-990f-773ee1165978')
    const { size, dark } = qrMatrix(url)
    const png = decode(qrPng(url))
    expect(png.side).toBe((size + 2 * QR_QUIET_MODULES) * QR_MODULE_PX)
    const half = QR_MODULE_PX / 2
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const px = (x + QR_QUIET_MODULES) * QR_MODULE_PX + half
        const py = (y + QR_QUIET_MODULES) * QR_MODULE_PX + half
        expect(png.at(px, py), `módulo ${x},${y}`).toBe(dark(x, y) ? 1 : 0)
      }
    // El margen de silencio, blanco (índice 0 de la paleta).
    const quiet = QR_QUIET_MODULES * QR_MODULE_PX
    for (let i = 0; i < png.side; i += 3) {
      expect(png.at(i, quiet - 1)).toBe(0)
      expect(png.at(quiet - 1, i)).toBe(0)
    }
    // Los tres patrones de posición: la esquina de arriba a la izquierda es oscura.
    expect(dark(0, 0) && dark(size - 1, 0) && dark(0, size - 1)).toBe(true)
  })

  it('RF-NOTIF-12: la ruta da el PNG con la firma, sin ella 403, y no depende de la BD', async () => {
    t = await makeApp()
    const url = path(qrUrl(t.config.publicUrl, t.config.auth.secret, 'e1'))
    const res = await t.app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.rawPayload.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(res.rawPayload).toEqual(Buffer.from(qrPng(entryPageUrl(t.config.publicUrl, 'e1'))))
    expect((await t.app.inject({ method: 'GET', url: '/api/email/qr/e1.png' })).statusCode).toBe(403)
    expect((await t.app.inject({ method: 'GET', url: url.replace('e1.png', 'e2.png') })).statusCode).toBe(403)
    const other = path(qrUrl(t.config.publicUrl, 'otro-secreto-de-32-caracteres-xx', 'e1'))
    expect((await t.app.inject({ method: 'GET', url: other })).statusCode).toBe(403)
  })
})
