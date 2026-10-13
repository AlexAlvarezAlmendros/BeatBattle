import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { user, vote } from '../src/db/schema'
import { ogData, ogImagePath } from '../src/modules/share/og'
import { type Battle, battle, HOUR, W42 } from './fixtures/battle'

// Pintar portadas y tarjetas en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 60_000 })

/** Imágenes OG (tarea 6.11, §2.15). */

let b: Battle
afterEach(async () => {
  await b?.t.app.close()
})

const get = (url: string) => b.t.app.inject({ method: 'GET', url })
const PNG = [0x89, 0x50, 0x4e, 0x47]

describe('imágenes OG (6.11)', () => {
  it('RF-SHARE-04: la de una entrada sin sellar no lleva al productor ni cifras; sellada, sí (y cambia de URL)', async () => {
    b = await battle({ producers: 2, voters: 0 })
    const own = b.producers[0] as Battle['producers'][0]
    await b.t.db.update(user).set({ displayUsername: 'MC Secreta' }).where(eq(user.id, own.id))
    for (const [i, stars] of [5, 4, 5].entries())
      await b.t.db.insert(vote).values({
        userId: `v-${i}`,
        entryId: own.entryId,
        weekId: b.weekId,
        stars,
        createdAt: 1,
        updatedAt: 1,
      })

    const blind = await ogData(b.t.db, 'entry', own.entryId, b.t.clock.now())
    expect(blind).toMatchObject({ kind: 'entry', producer: null, result: null, votingOpen: true })
    expect(JSON.stringify(blind)).not.toMatch(/MC Secreta|prod0/)
    const blindPath = ogImagePath(blind as NonNullable<typeof blind>)
    const image = await get(blindPath)
    expect(image.statusCode).toBe(200)
    expect([...image.rawPayload.subarray(0, 4)]).toEqual(PNG)

    b.t.clock.set(W42.voteEndsAt)
    await get('/api/weeks/2026-w42/results') // sella
    const sealed = await ogData(b.t.db, 'entry', own.entryId, b.t.clock.now())
    expect(sealed).toMatchObject({
      producer: 'MC Secreta',
      result: { position: 1, votes: 3 },
      votingOpen: false,
    })
    expect(ogImagePath(sealed as NonNullable<typeof sealed>)).not.toBe(blindPath)
  })

  it('RF-SHARE-02: con la versión vigente, caché inmutable; sin versión o con una vieja, caché corta', async () => {
    b = await battle({ producers: 1, voters: 0 })
    const data = await ogData(b.t.db, 'week', '2026-w42', b.t.clock.now())
    const path = ogImagePath(data as NonNullable<typeof data>)
    const current = await get(path)
    expect(current.statusCode).toBe(200)
    expect(current.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect((await get(path.replace(/\?v=.*/, ''))).headers['cache-control']).toBe('public, max-age=300')
    // Al pasar a votación, lo que se ve cambia: la URL vieja ya no es la vigente.
    b.t.clock.set(W42.submitEndsAt)
    const old = await get(path)
    expect(old.statusCode).toBe(200)
    expect(old.headers['cache-control']).toBe('public, max-age=300')
  })

  it('RF-SHARE-04: nada antes de tiempo: semana antes del drop, resultados sin sellar y entrada retirada dan 404', async () => {
    b = await battle({ producers: 1, voters: 0 })
    b.t.clock.set(W42.startsAt - HOUR)
    expect((await get('/api/og/week/2026-w42.png')).statusCode).toBe(404)
    b.t.clock.set(W42.startsAt + HOUR)
    expect((await get('/api/og/results/2026-w42.png')).statusCode).toBe(404)
    expect((await get('/api/og/entry/no-existe.png')).statusCode).toBe(404)
    expect((await get('/api/og/raro/2026-w42.png')).statusCode).toBe(404)
  })

  it('RF-SHARE-04: el perfil solo cuenta semanas selladas (una abierta y ciega no dice quién participa)', async () => {
    b = await battle({ producers: 1, voters: 0 })
    const own = b.producers[0] as Battle['producers'][0]
    for (const [i, stars] of [3, 3, 3].entries())
      await b.t.db.insert(vote).values({
        userId: `v-${i}`,
        entryId: own.entryId,
        weekId: b.weekId,
        stars,
        createdAt: 1,
        updatedAt: 1,
      })
    expect(await ogData(b.t.db, 'profile', 'prod0', b.t.clock.now())).toMatchObject({
      weeks: 0,
      podiums: 0,
      best: null,
    })
    b.t.clock.set(W42.voteEndsAt)
    await get('/api/weeks/2026-w42/results')
    expect(await ogData(b.t.db, 'profile', 'PROD0', b.t.clock.now())).toMatchObject({
      weeks: 1,
      podiums: 1,
      best: 1,
    })
    const results = await get('/api/og/results/2026-w42.png')
    expect(results.statusCode).toBe(200)
    expect((await get('/api/og/profile/prod0.png')).statusCode).toBe(200)
  })
})
