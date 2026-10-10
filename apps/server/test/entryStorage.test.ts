import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AudioMeasurement } from '../src/media/measure'
import {
  createCloudinaryEntryStorage,
  createDiskEntryStorage,
  DISK_LIST_PAGE,
  type EntryStorage,
} from '../src/modules/storage/entries'
import { createDiskSampleStorage, wavDurationMs } from '../src/modules/storage/samples'
import { sineWav } from './fixtures/wav'
import { makeApp, ORIGIN, T0, type TestApp } from './helpers'

const config = { cloudName: 'demo', apiKey: '123', apiSecret: 'secreto', prefix: 'beatbattle-dev' }

/** Mide sin ffmpeg: lo justo para ver que el almacenamiento le pasa los bytes. */
const fakeMeasure = async (source: ReadableStream<Uint8Array>): Promise<AudioMeasurement> => {
  let bytes = 0
  for await (const chunk of source as unknown as AsyncIterable<Uint8Array>) bytes += chunk.byteLength
  return { durationMs: bytes, integratedLufs: -10, truePeakDb: -0.5, peaks: new Int8Array(2000) }
}

async function diskApp(): Promise<{ t: TestApp; storage: EntryStorage; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'bb-entries-'))
  const disk = createDiskSampleStorage({ root, baseUrl: '', secret: 'x'.repeat(32) })
  const t = await makeApp({ samples: disk })
  return { t, storage: createDiskEntryStorage(disk, fakeMeasure), root }
}

/** Un trozo de la subida como lo manda el navegador: multipart con los campos firmados y el fichero. */
async function chunk(
  t: TestApp,
  signed: { uploadUrl: string; fields: Record<string, string> },
  bytes: Uint8Array,
  range: { start: number; total: number; uploadId: string; name?: string; header?: string },
) {
  const form = new FormData()
  for (const [key, value] of Object.entries(signed.fields)) form.set(key, value)
  form.set('file', new File([bytes], range.name ?? 'beat.wav'))
  const request = new Request('http://x/', { method: 'POST', body: form })
  return t.app.inject({
    method: 'POST',
    url: signed.uploadUrl,
    headers: {
      origin: ORIGIN,
      'content-type': request.headers.get('content-type') ?? '',
      'x-unique-upload-id': range.uploadId,
      'content-range':
        range.header ?? `bytes ${range.start}-${range.start + bytes.byteLength - 1}/${range.total}`,
    },
    payload: Buffer.from(await request.arrayBuffer()),
  })
}

describe('almacenamiento de las entradas en Cloudinary (4.4)', () => {
  it('RF-ENT-04 / RF-STO-02: firma con el public_id del servidor (sin id de usuario), authenticated y el MP3 en eager asíncrono', () => {
    const storage = createCloudinaryEntryStorage(config)
    const publicId = storage.publicIdFor('entry', '2026-w41', '7b0c6a0e-uuid')
    expect(publicId).toBe('beatbattle-dev/entries/2026-w41/7b0c6a0e-uuid')
    const signed = storage.sign({ kind: 'entry', publicId, intentId: 'i1', nowMs: T0 })
    expect(signed.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/video/upload')
    expect(signed.fields).toMatchObject({
      public_id: publicId,
      type: 'authenticated',
      eager: 'f_mp3,br_192k',
      eager_async: 'true',
      allowed_formats: 'wav,aiff,aif,flac,mp3',
      tags: 'bb,entry,intent:i1',
    })
    expect(signed.fields.signature).toMatch(/^[0-9a-f]{40}$/)
  })

  it('RF-ENT-10: la portada propia también es authenticated y solo se entrega firmada', () => {
    const storage = createCloudinaryEntryStorage(config)
    const publicId = storage.publicIdFor('entryCover', '2026-w41', 'c1')
    expect(publicId).toBe('beatbattle-dev/entry-covers/2026-w41/c1')
    const signed = storage.sign({ kind: 'entryCover', publicId, intentId: 'i2', nowMs: T0 })
    expect(signed.uploadUrl).toMatch(/\/image\/upload$/)
    expect(signed.fields).toMatchObject({ type: 'authenticated', allowed_formats: 'png,jpg,jpeg,webp' })
    expect(signed.fields.eager).toBeUndefined()
    expect(storage.coverUrl(publicId, 256)).toMatch(
      /\/image\/authenticated\/s--[\w-]{8}--\/c_fill,g_auto,h_256,w_256/,
    )
    expect(storage.streamUrl('beatbattle-dev/entries/2026-w41/x')).toMatch(
      /\/video\/authenticated\/s--[\w-]{8}--\/f_mp3,br_192k\/.+\.mp3$/,
    )
  })
})

describe('almacenamiento falso de las entradas, con la subida por trozos (4.4, §4.8.6)', () => {
  it('RF-STO-01: un WAV sube en 3 trozos firmados; el último cierra el recurso con su etag, duración y fecha', async () => {
    const { t, storage } = await diskApp()
    const wav = sineWav({ seconds: 3 })
    const publicId = storage.publicIdFor('entry', '2026-w41', 'abc')
    const signed = storage.sign({ kind: 'entry', publicId, intentId: 'i1', nowMs: T0 })
    const size = Math.ceil(wav.byteLength / 3)
    const responses = []
    for (let start = 0; start < wav.byteLength; start += size) {
      const res = await chunk(t, signed, wav.subarray(start, start + size), {
        start,
        total: wav.byteLength,
        uploadId: 'upload-0001',
      })
      expect(res.statusCode).toBe(200)
      responses.push(res.json())
    }
    expect(responses.slice(0, -1).every((r) => r.done === false)).toBe(true)
    expect(responses.at(-1)).toMatchObject({ public_id: publicId, done: true, bytes: wav.byteLength })
    const asset = await storage.verify(publicId, 'entry')
    expect(asset).toMatchObject({
      publicId,
      format: 'wav',
      bytes: wav.byteLength,
      durationMs: 3000,
      createdAtMs: T0,
    })
    expect(asset?.etag).toBe(responses.at(-1).etag)
    expect(asset?.etag).toMatch(/^[0-9a-f]{32}$/)
    // La medición recibe el fichero entero.
    expect((await storage.measure(publicId, 'wav')).durationMs).toBe(wav.byteLength)
  })

  it('RF-ENT-11 (parcial: almacenamiento): el mismo fichero da el mismo etag', async () => {
    const { t, storage } = await diskApp()
    const wav = sineWav({ seconds: 1 })
    const etags = []
    for (const id of ['a', 'b']) {
      const publicId = storage.publicIdFor('entry', '2026-w41', id)
      const signed = storage.sign({ kind: 'entry', publicId, intentId: id, nowMs: T0 })
      const res = await chunk(t, signed, wav, {
        start: 0,
        total: wav.byteLength,
        uploadId: `upload-${id}-0001`,
      })
      etags.push(res.json().etag)
    }
    expect(etags[0]).toMatch(/^[0-9a-f]{32}$/)
    expect(etags[0]).toBe(etags[1])
  })

  it('RF-ENT-04: subir con otro public_id o con un formato fuera de la firma no vale', async () => {
    const { t, storage } = await diskApp()
    const publicId = storage.publicIdFor('entry', '2026-w41', 'abc')
    const signed = storage.sign({ kind: 'entry', publicId, intentId: 'i1', nowMs: T0 })
    const wav = sineWav({ seconds: 1 })
    const forged = {
      ...signed,
      fields: { ...signed.fields, public_id: 'beatbattle-test/entries/2026-w41/mio' },
    }
    expect(
      (await chunk(t, forged, wav, { start: 0, total: wav.byteLength, uploadId: 'upload-0002' })).statusCode,
    ).toBe(401)
    const exe = await chunk(t, signed, wav, {
      start: 0,
      total: wav.byteLength,
      uploadId: 'upload-0003',
      name: 'x.exe',
    })
    expect(exe.statusCode).toBe(422)
    expect(await storage.verify(publicId, 'entry')).toBeNull()
  })

  it('un trozo que no mide lo que dice Content-Range, o un Content-Range imposible, se rechaza', async () => {
    const { t, storage } = await diskApp()
    const publicId = storage.publicIdFor('entry', '2026-w41', 'abc')
    const signed = storage.sign({ kind: 'entry', publicId, intentId: 'i1', nowMs: T0 })
    const ten = new Uint8Array(10)
    const ok = await chunk(t, signed, ten, { start: 0, total: 100, uploadId: 'upload-0004' })
    expect(ok.json()).toEqual({ done: false })
    const short = { start: 10, total: 100, uploadId: 'upload-0004', header: 'bytes 10-49/100' }
    expect((await chunk(t, signed, ten, short)).statusCode).toBe(422)
    const impossible = { start: 0, total: 10, uploadId: 'upload-0005', header: 'bytes 5-1/10' }
    expect((await chunk(t, signed, ten, impossible)).statusCode).toBe(422)
    expect(await storage.verify(publicId, 'entry')).toBeNull()
  })

  it('RF-STO-05 (parcial: barrido): lista por prefijo en páginas y borra', async () => {
    const { storage, root } = await diskApp()
    const disk = createDiskSampleStorage({ root, baseUrl: '', secret: 'x'.repeat(32) })
    const total = DISK_LIST_PAGE + 3
    for (let i = 0; i < total; i++) {
      await disk.put({
        publicId: storage.publicIdFor('entry', '2026-w41', `e${String(i).padStart(3, '0')}`),
        bytes: new Uint8Array([i]),
        format: 'mp3',
        nowMs: T0 + i,
      })
    }
    const first = await storage.listByPrefix('entry', null)
    expect(first.items).toHaveLength(DISK_LIST_PAGE)
    expect(first.next).not.toBeNull()
    const second = await storage.listByPrefix('entry', first.next)
    expect(second.items).toHaveLength(3)
    expect(second.next).toBeNull()
    expect(second.items.at(-1)).toMatchObject({ kind: 'entry', createdAtMs: T0 + total - 1 })
    await storage.remove(first.items[0]!.publicId, 'entry')
    expect(await storage.verify(first.items[0]!.publicId, 'entry')).toBeNull()
    expect((await storage.listByPrefix('entryCover', null)).items).toEqual([])
  })

  it('lee la duración de la cabecera de un WAV', () => {
    expect(wavDurationMs(sineWav({ seconds: 2, sampleRate: 44_100, channels: 1 }))).toBe(2000)
    expect(wavDurationMs(new Uint8Array([1, 2, 3]))).toBeUndefined()
  })
})
