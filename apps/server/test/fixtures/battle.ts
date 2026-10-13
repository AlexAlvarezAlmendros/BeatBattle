import { scheduleWeek as boundaries } from '@beatbattle/rules'
import { entry, week } from '../../src/db/schema'
import { createAccount } from '../helpers'
import { createSample, json, makeWeeksApp, scheduleWeek, type WeeksApp } from './weeks'

/** Semana 42 (lunes 12 de octubre de 2026) con sus fronteras. */
export const W42 = boundaries({ year: 2026, month: 10, day: 12 })
export const HOUR = 3_600_000

export interface Battle {
  t: WeeksApp
  weekId: string
  /** Productores con su entrada activa, en el orden en que se dieron. */
  producers: { id: string; cookie: string; entryId: string }[]
  /** Cuentas verificadas sin entrada. */
  voters: { id: string; cookie: string }[]
}

let serial = 0

/** Una fila de entrada activa, medida, como la deja la 4.6 (sin pasar por la subida). */
export function entryValues(
  weekId: string,
  userId: string,
  overrides: Partial<typeof entry.$inferInsert> = {},
) {
  serial += 1
  return {
    id: `e-${String(serial).padStart(4, '0')}`,
    weekId,
    userId,
    alias: `Alias ${serial}`,
    title: `Flip ${serial}`,
    bpm: 140,
    musicalKey: 'Am',
    tags: JSON.stringify(['Trap']),
    audioPublicId: `beatbattle-test/entries/2026-w42/${serial}`,
    etag: `etag-${serial}`,
    format: 'wav',
    bytes: 500_000,
    durationMs: 180_000,
    peaks: Buffer.alloc(2000),
    loudnessLufs: -8,
    truePeakDb: -1,
    coverSeed: serial,
    receiptNumber: serial,
    status: 'active' as const,
    submittedAt: W42.startsAt + serial,
    updatedAt: W42.startsAt + serial,
    ...overrides,
  }
}

/**
 * Semana 42 en juego (`open`, una hora después del drop) con `producers` entradas activas de cuentas
 * distintas y `voters` cuentas sin entrada. Los alias y los ids siguen el orden de llegada.
 */
export async function battle({ producers = 3, voters = 1, config = {} } = {}): Promise<Battle> {
  const t = await makeWeeksApp({ cronSecret: 'cron-secret-de-prueba-0123456789abcdef', ...config })
  const { id: sampleId } = await createSample(t)
  await scheduleWeek(t, '2026-10-12', sampleId)
  t.clock.set(W42.startsAt + HOUR)
  const [w] = await t.db.select({ id: week.id }).from(week)
  const weekId = w?.id as string
  const out: Battle = { t, weekId, producers: [], voters: [] }
  for (let i = 0; i < producers; i++) {
    const account = await createAccount(t, { email: `prod${i}@example.com`, username: `prod${i}` })
    const values = entryValues(weekId, account.id)
    await t.db.insert(entry).values(values)
    out.producers.push({ ...account, entryId: values.id })
  }
  for (let i = 0; i < voters; i++)
    out.voters.push(await createAccount(t, { email: `voter${i}@example.com`, username: `voter${i}` }))
  return out
}

/** Peticiones del oyente: escuchar, cumplir el umbral y votar. */
export function listener(t: WeeksApp, cookie: string) {
  // Sin cuerpo no va `Content-Type` (§4.10): Fastify no acepta un JSON vacío.
  const post = (url: string, payload?: object) =>
    payload
      ? t.app.inject({ method: 'POST', url, headers: json(cookie), payload })
      : t.app.inject({ method: 'POST', url, headers: { cookie, origin: 'http://localhost:5173' } })
  return {
    listen: (entryId: string) => post(`/api/entries/${entryId}/listen`),
    qualify: (entryId: string, listenId: string) =>
      post(`/api/entries/${entryId}/listen/qualify`, { listenId }),
    vote: (entryId: string, stars: unknown) =>
      t.app.inject({
        method: 'PUT',
        url: `/api/entries/${entryId}/vote`,
        headers: json(cookie),
        payload: { stars },
      }),
    unvote: (entryId: string) =>
      t.app.inject({
        method: 'DELETE',
        url: `/api/entries/${entryId}/vote`,
        headers: { cookie, origin: 'http://localhost:5173' },
      }),
    report: (entryId: string, payload: object) => post(`/api/entries/${entryId}/report`, payload),
    /** Escucha 31 s de reloj y cumple el umbral: lo que hace falta para poder votar. */
    async ready(entryId: string) {
      const started = (await this.listen(entryId)).json().data
      t.clock.advance(31_000)
      const qualified = await this.qualify(entryId, started.listenId)
      if (qualified.statusCode !== 200) throw new Error(`qualify: ${qualified.body}`)
    },
  }
}
