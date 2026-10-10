import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { entry, sample, week } from '../src/db/schema'
import { crc32 } from '../src/media/png'
import { WAVEFORM_PNG_HEIGHT, WAVEFORM_PNG_WIDTH, waveformPng } from '../src/media/waveformPng'
import { waveformUrl, waveformVersion } from '../src/modules/entries/waveformRoute'
import { makeApp, T0, type TestApp } from './helpers'

/** Los bloques de un PNG, comprobando su CRC. */
function chunks(png: Uint8Array): { type: string; data: Buffer }[] {
  const buffer = Buffer.from(png)
  expect([...buffer.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const out = []
  let offset = 8
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    expect(buffer.readUInt32BE(offset + 8 + length), `CRC de ${type}`).toBe(
      crc32(buffer.subarray(offset + 4, offset + 8 + length)),
    )
    out.push({ type, data })
    offset += 12 + length
  }
  return out
}

/** Los índices de paleta de cada píxel (filas sin filtro). */
function pixelsOf(png: Uint8Array): Uint8Array {
  const idat = Buffer.concat(
    chunks(png)
      .filter((c) => c.type === 'IDAT')
      .map((c) => c.data),
  )
  const raw = inflateSync(idat)
  const out = new Uint8Array(WAVEFORM_PNG_WIDTH * WAVEFORM_PNG_HEIGHT)
  for (let y = 0; y < WAVEFORM_PNG_HEIGHT; y++) {
    expect(raw[y * (WAVEFORM_PNG_WIDTH + 1)]).toBe(0)
    out.set(
      raw.subarray(y * (WAVEFORM_PNG_WIDTH + 1) + 1, (y + 1) * (WAVEFORM_PNG_WIDTH + 1)),
      y * WAVEFORM_PNG_WIDTH,
    )
  }
  return out
}

describe('PNG de la onda del recibo (§4.19.5, 4.12)', () => {
  it('RF-NOTIF-06: PNG válido de 512 × 96 con paleta, CRC correctos y la onda medida', () => {
    const peaks = new Int8Array(2000)
    for (let i = 0; i < 1000; i++) {
      peaks[i * 2] = -40
      peaks[i * 2 + 1] = 40
    }
    const png = waveformPng(peaks)
    const parts = chunks(png)
    expect(parts.map((c) => c.type)).toEqual(['IHDR', 'PLTE', 'IDAT', 'IEND'])
    const ihdr = parts[0]!.data
    expect(ihdr.readUInt32BE(0)).toBe(512)
    expect(ihdr.readUInt32BE(4)).toBe(96)
    expect([ihdr[8], ihdr[9]]).toEqual([8, 3])
    const pixels = pixelsOf(png)
    // Barras grises (índice 1) y nada en rojo: no clipa.
    expect(pixels.includes(1)).toBe(true)
    expect(pixels.includes(2)).toBe(false)
    // La fila del centro tiene barra; la de arriba del todo, no.
    expect(pixels[48 * 512 + 1]).toBe(1)
    expect(pixels.subarray(0, 512).every((p) => p === 0)).toBe(true)
  })

  it('RF-NOTIF-06: las barras que tocan el máximo digital van en rojo (se ve dónde clipa)', () => {
    const peaks = new Int8Array(2000)
    peaks[0] = -127
    peaks[1] = 127
    expect(pixelsOf(waveformPng(peaks)).includes(2)).toBe(true)
  })

  it('sin onda (processing o ya borrada), la línea plana', () => {
    const pixels = pixelsOf(waveformPng(null))
    expect(pixels.includes(1)).toBe(true)
    expect(pixels.includes(2)).toBe(false)
    expect(pixels.subarray(40 * 512, 41 * 512).every((p) => p === 0)).toBe(true)
  })
})

describe('GET /api/email/waveform/:entryId.png (§4.19.5)', () => {
  async function withEntry(): Promise<TestApp> {
    const t = await makeApp()
    await t.db.insert(sample).values({
      id: 's1',
      title: 'Lluvia',
      credits: 'OTP',
      licenseText: 'Libre',
      durationMs: 1,
      bytes: 1,
      format: 'wav',
      audioPublicId: 'x/samples/s1/original',
      coverPublicId: 'x/samples/s1/cover',
      peaks: Buffer.alloc(2000),
      createdBy: 'a',
      createdAt: T0,
    })
    await t.db.insert(week).values({
      id: 'w1',
      number: 1,
      slug: '2026-w41',
      seasonId: '2026-T4',
      sampleId: 's1',
      rulesVersion: 1,
      startsAt: T0,
      submitEndsAt: T0 + 1,
      voteEndsAt: T0 + 2,
      createdBy: 'a',
      createdAt: T0,
    })
    await t.db.insert(entry).values({
      id: 'e1',
      weekId: 'w1',
      userId: 'u1',
      alias: 'Tigre Púrpura',
      title: 'Bruma',
      audioPublicId: 'x/entries/2026-w41/e1',
      etag: 'A1B2C3D4E5F60718',
      format: 'wav',
      bytes: 1,
      durationMs: 31_000,
      peaks: Buffer.alloc(2000, 30),
      coverSeed: 1,
      receiptNumber: 1,
      status: 'active',
      submittedAt: T0,
      updatedAt: T0,
    })
    return t
  }
  const path = (url: string) => url.replace(/^https?:\/\/[^/]+/, '')

  it('con la firma del servidor da el PNG, con caché larga', async () => {
    const t = await withEntry()
    const url = waveformUrl(t.config.publicUrl, t.config.auth.secret, 'e1', 'A1B2C3D4E5F60718')
    expect(url).toContain(`?v=${waveformVersion('A1B2C3D4E5F60718')}&sig=`)
    const res = await t.app.inject({ method: 'GET', url: path(url) })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['cache-control']).toContain('max-age=')
    expect([...res.rawPayload.subarray(1, 4)].map((b) => String.fromCharCode(b)).join('')).toBe('PNG')
  })

  it('RF-NOTIF-12: sin firma, con otra firma o con otra versión → 403 (nadie recorre los ids)', async () => {
    const t = await withEntry()
    const url = path(waveformUrl(t.config.publicUrl, t.config.auth.secret, 'e1', 'a1b2c3d4e5f60718'))
    expect((await t.app.inject({ method: 'GET', url: '/api/email/waveform/e1.png' })).statusCode).toBe(403)
    expect((await t.app.inject({ method: 'GET', url: url.replace('e1.png', 'e2.png') })).statusCode).toBe(403)
    expect(
      (await t.app.inject({ method: 'GET', url: url.replace(/v=[0-9a-f]+/, 'v=000000000000') })).statusCode,
    ).toBe(403)
    const other = path(
      waveformUrl(t.config.publicUrl, 'otro-secreto-de-32-caracteres-xx', 'e1', 'a1b2c3d4e5f6'),
    )
    expect((await t.app.inject({ method: 'GET', url: other })).statusCode).toBe(403)
  })

  it('una entrada que ya no existe, con firma válida, da la línea plana (un email viejo nunca da error)', async () => {
    const t = await withEntry()
    const url = path(waveformUrl(t.config.publicUrl, t.config.auth.secret, 'borrada', 'ffff'))
    const res = await t.app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
  })
})
