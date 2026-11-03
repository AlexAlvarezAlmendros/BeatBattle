import { expect } from 'vitest'
import { createAccount } from '../helpers'
import { sineWav } from './wav'
import { json, type WeeksApp } from './weeks'

/** Un beat corto (31 s a 8 kHz, mono) que la medición acepta. */
export const beat = (seconds = 31) => sineWav({ seconds, sampleRate: 8000, channels: 1 })

const FICHA = {
  title: 'Bruma en Gràcia',
  bpm: 140,
  musicalKey: 'Am',
  daw: 'FL Studio',
  genres: ['Trap'],
  description: null,
  declaration: true,
}

/** Una cuenta verificada que ya ha aceptado las bases de la semana `slug`. */
export async function producerFor(t: WeeksApp, username: string, slug = '2026-w42') {
  const account = await createAccount(t, { email: `${username}@example.com`, username })
  const res = await t.app.inject({
    method: 'POST',
    url: `/api/weeks/${slug}/rules`,
    headers: json(account.cookie),
    payload: { rulesVersion: 1 },
  })
  expect(res.statusCode, res.body).toBe(204)
  return account
}

/** Firma, «sube» al almacenamiento falso y registra la entrada, como el navegador (pasa a `active`). */
export async function submitEntry(
  t: WeeksApp,
  cookie: string,
  { slug = '2026-w42', bytes = beat() }: { slug?: string; bytes?: Uint8Array } = {},
) {
  const signed = await t.app.inject({
    method: 'POST',
    url: '/api/uploads/sign',
    headers: json(cookie),
    payload: {
      kind: 'entry',
      weekSlug: slug,
      mime: 'audio/wav',
      bytes: bytes.byteLength,
      durationMs: 31_000,
    },
  })
  expect(signed.statusCode, signed.body).toBe(200)
  const { intentId, publicId } = signed.json().data
  await t.storage.put({ publicId, bytes, format: 'wav', nowMs: t.clock.now() })
  const res = await t.app.inject({
    method: 'POST',
    url: `/api/weeks/${slug}/entries`,
    headers: json(cookie),
    payload: { intentId, ...FICHA },
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json().data as { id: string; status: string; game: { xp: number; achievements: string[] } }
}
