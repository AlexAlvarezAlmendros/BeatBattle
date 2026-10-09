import { describe, expect, it } from 'vitest'
import { EnvError, loadEnv } from '../src/config/env'
import { createCloudinarySampleStorage, imageSize } from '../src/modules/storage/samples'
import { pngHeader } from './fixtures/weeks'

const config = { cloudName: 'demo', apiKey: '123', apiSecret: 'secreto', prefix: 'beatbattle-dev' }

describe('almacenamiento de samples en Cloudinary (3.4)', () => {
  it('RF-DROP-07: la descarga es la API privada de Cloudinary, firmada, como adjunto y con caducidad', () => {
    const storage = createCloudinarySampleStorage(config)
    const expiresAtMs = Date.UTC(2026, 9, 12, 12, 0, 0)
    const url = new URL(
      storage.downloadUrl('beatbattle-dev/samples/abc/original', 'original', { format: 'wav', expiresAtMs }),
    )
    expect(url.origin).toBe('https://api.cloudinary.com')
    expect(url.pathname).toBe('/v1_1/demo/video/download')
    expect(url.searchParams.get('signature')).toMatch(/^[0-9a-f]{40}$/)
    expect(url.searchParams.get('attachment')).toBe('true')
    expect(url.searchParams.get('type')).toBe('authenticated')
    expect(url.searchParams.get('expires_at')).toBe(String(expiresAtMs / 1000))
  })

  it('RF-STO-01 / RF-STO-02: firma la subida con el public_id fijo, authenticated y el MP3 de escucha', () => {
    const storage = createCloudinarySampleStorage(config)
    const signed = storage.sign({ sampleId: 'abc', part: 'original', nowMs: 0 })
    expect(signed.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/video/upload')
    expect(signed.fields).toMatchObject({
      public_id: 'beatbattle-dev/samples/abc/original',
      type: 'authenticated',
      eager: 'f_mp3,br_192k',
      allowed_formats: 'wav,aiff,aif',
    })
    expect(storage.sign({ sampleId: 'abc', part: 'stems', nowMs: 0 }).uploadUrl).toMatch(/\/raw\/upload$/)
    expect(storage.publicIdFor('abc', 'stems')).toBe('beatbattle-dev/samples/abc/stems.zip')
    expect(storage.streamUrl('beatbattle-dev/samples/abc/original')).toMatch(
      /\/video\/authenticated\/s--[\w-]{8}--\/f_mp3,br_192k\/.+\.mp3$/,
    )
  })

  it('lee el tamaño de un PNG', () => {
    expect(imageSize(pngHeader(1200, 900))).toEqual({ width: 1200, height: 900 })
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeUndefined()
  })

  it('el almacenamiento falso (BB_FAKE_STORAGE) no arranca en producción', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        BB_PUBLIC_URL: 'https://battle.otherpeople.es',
        BETTER_AUTH_SECRET: 'x'.repeat(32),
        BB_FAKE_STORAGE: './data/fake-storage',
      }),
    ).toThrow(EnvError)
  })
})
