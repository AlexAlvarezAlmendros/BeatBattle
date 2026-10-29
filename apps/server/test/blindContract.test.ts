import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { entry, producerProfile, user, vote, week } from '../src/db/schema'
import { sealWeek } from '../src/modules/weeks/seal'
import { type Battle, battle, listener, W42 } from './fixtures/battle'

// Cada prueba crea varias cuentas (alta, verificación) y vota por la API: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 30_000 })

/**
 * Contrato de voto ciego y de «nada de medias antes del sellado» (tarea 5.10; `RNF-SEC-04`, `RF-PLAY-05`,
 * `RF-VOTE-07`, `RF-ENT-10`): con una semana ciega sin sellar, ninguna respuesta pública (ni las de quien
 * vota) lleva ids, nombres ni emails de los productores, ni medias, recuentos por entrada o posiciones.
 */

let b: Battle
afterEach(async () => {
  await b?.t.app.close()
})

/** Claves que no pueden aparecer en ninguna respuesta pública antes del sellado. */
const BANNED_KEYS = new Set([
  'userId',
  'username',
  'displayName',
  'email',
  'avatarUrl',
  'mean',
  'meanMilli',
  'average',
  'score',
  'scoreMilli',
  'position',
  'rank',
  'histogram',
  'voteCount',
  'votes',
  'plays',
  'playCount',
  'stars',
  // La casilla del reto extra (`RF-ENT-13`): distinguiría a una entrada en pleno voto ciego.
  'challengeClaimed',
])

function keysOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) keysOf(item, out)
  else if (value && typeof value === 'object')
    for (const [key, inner] of Object.entries(value)) {
      out.push(key)
      keysOf(inner, out)
    }
  return out
}

describe('contrato de voto ciego (5.10)', () => {
  it('RNF-SEC-04, RF-PLAY-05: ninguna ruta pública de una semana sin sellar revela autoría ni cifras', async () => {
    b = await battle({ producers: 3, voters: 1 })
    const voter = b.voters[0] as Battle['voters'][0]
    // Nombres visibles, para buscarlos (y que la búsqueda no dependa del nombre de usuario).
    for (const [i, p] of b.producers.entries()) {
      await b.t.db
        .update(user)
        .set({ displayUsername: `Productora${i}`, name: `Nombre Real ${i}` })
        .where(eq(user.id, p.id))
      await b.t.db
        .update(producerProfile)
        .set({ avatarPublicId: `bbt/avatars/${p.id}/a` })
        .where(eq(producerProfile.userId, p.id))
    }
    // Votos de verdad: hay medias que esconder.
    const ear = listener(b.t, voter.cookie)
    for (const [i, p] of b.producers.entries()) {
      await ear.ready(p.entryId)
      expect((await ear.vote(p.entryId, i + 3)).statusCode).toBe(200)
    }
    const traces = b.producers.flatMap((p, i) => [
      p.id,
      `prod${i}`,
      `prod${i}@example.com`,
      `Productora${i}`,
      `Nombre Real ${i}`,
      `bbt/avatars/${p.id}`,
    ])

    const get = (url: string, cookie?: string) =>
      b.t.app.inject({ method: 'GET', url, ...(cookie ? { headers: { cookie } } : {}) })
    const publicUrls = [
      '/api/weeks/current',
      '/api/weeks/2026-w42',
      '/api/weeks/2026-w42/entries',
      '/api/weeks/2026-w42/entries?order=new',
      '/api/weeks/2026-w42/entries?order=random&seed=3',
      '/api/weeks/2026-w42/entries?unvoted=1',
      '/api/weeks/2026-w42/ticker',
      ...b.producers.map((p) => `/api/entries/${p.entryId}`),
    ]
    const responses = [
      ...(await Promise.all(publicUrls.map((url) => get(url)))),
      ...(await Promise.all(publicUrls.map((url) => get(url, voter.cookie)))),
      await get('/api/jury/queue', voter.cookie),
    ]
    for (const res of responses) {
      const where = res.raw.req.url
      expect(res.statusCode, where).toBe(200)
      for (const trace of traces) expect(res.body.includes(trace), `${where} lleva ${trace}`).toBe(false)
      const body = res.json().data
      // La lista lleva `myVote` (lo del propio votante), nunca las estrellas de otros.
      for (const key of keysOf(body))
        expect(BANNED_KEYS.has(key), `${where} lleva la clave ${key}`).toBe(false)
    }
    // Sellada, la autoría sí aparece en la lista y en la ficha.
    await b.t.db.update(week).set({ sealedAt: W42.voteEndsAt })
    expect((await get('/api/weeks/2026-w42/entries')).body).toContain('Productora0')
    // Las estrellas dadas solo las ve quien las dio.
    expect(await b.t.db.select().from(vote)).toHaveLength(3)
  })

  it('RF-ENT-13, RNF-SEC-04: la casilla del reto no sale antes del sellado más que a su dueño; sellada, va en el resultado', async () => {
    b = await battle({ producers: 3, voters: 1 })
    const [owner, rival] = b.producers as [Battle['producers'][0], Battle['producers'][0]]
    await b.t.db.update(entry).set({ challengeClaimed: true }).where(eq(entry.id, owner.entryId))
    const get = (url: string, cookie?: string) =>
      b.t.app.inject({ method: 'GET', url, ...(cookie ? { headers: { cookie } } : {}) })
    const urls = [
      '/api/weeks/current',
      '/api/weeks/2026-w42',
      '/api/weeks/2026-w42/entries',
      '/api/weeks/2026-w42/ticker',
      ...b.producers.map((p) => `/api/entries/${p.entryId}`),
    ]
    const voter = (b.voters[0] as Battle['voters'][0]).cookie
    // Ni sin sesión, ni a quien vota, ni a otro productor.
    for (const cookie of [undefined, voter, rival.cookie])
      for (const url of urls) {
        const res = await get(url, cookie)
        expect(res.statusCode, url).toBe(200)
        expect(res.body.includes('challengeClaimed'), `${url} lleva la casilla`).toBe(false)
      }
    // Su dueño la ve en su entrada (`/subir` en edición), y en ningún sitio más.
    expect((await get('/api/weeks/2026-w42/entries/mine', owner.cookie)).json().data.challengeClaimed).toBe(
      true,
    )
    for (const url of urls)
      expect((await get(url, owner.cookie)).body.includes('challengeClaimed'), url).toBe(false)
    // Sellada, la ficha la enseña con su resultado.
    b.t.clock.set(W42.voteEndsAt)
    expect(await sealWeek(b.t.db, { weekId: b.weekId, now: W42.voteEndsAt, holder: 'test' })).toBe(true)
    expect((await get(`/api/entries/${owner.entryId}`)).json().data.result.challengeClaimed).toBe(true)
    expect((await get(`/api/entries/${rival.entryId}`)).json().data.result.challengeClaimed).toBe(false)
  })
})
