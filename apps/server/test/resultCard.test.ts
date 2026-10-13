import { afterEach, describe, expect, it, vi } from 'vitest'
import { vote } from '../src/db/schema'
import { resultCardUrl } from '../src/modules/results/cardRoute'
import { type Battle, battle, W42 } from './fixtures/battle'

// Cada prueba crea varias cuentas y pinta una imagen: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 30_000 })

/** Tarjeta de resultado personal (tarea 6.10, §4.19.5). */

let b: Battle
afterEach(async () => {
  await b?.t.app.close()
})

const PNG = [0x89, 0x50, 0x4e, 0x47]

describe('tarjeta de resultado (6.10)', () => {
  it('RF-NOTIF-14: firmada, la tarjeta de quien participó; sin firma o con la de otro, 403; sin sellar, 404', async () => {
    b = await battle({ producers: 2, voters: 0 })
    const own = b.producers[0] as Battle['producers'][0]
    for (const [i, stars] of [5, 4, 5].entries())
      await b.t.db.insert(vote).values({
        userId: `v-${i}`,
        entryId: own.entryId,
        weekId: b.weekId,
        stars,
        createdAt: 1,
        updatedAt: 1,
      })
    const secret = b.t.config.auth.secret
    const url = resultCardUrl('', secret, '2026-w42', own.id)
    const get = (path: string) => b.t.app.inject({ method: 'GET', url: path })

    // Antes del sellado, ni con firma.
    expect((await get(url)).statusCode).toBe(404)
    b.t.clock.set(W42.voteEndsAt)
    await get('/api/weeks/2026-w42/results') // sella

    const ok = await get(url)
    expect(ok.statusCode).toBe(200)
    expect(ok.headers['content-type']).toBe('image/png')
    expect([...ok.rawPayload.subarray(0, 4)]).toEqual(PNG)

    expect((await get(url.replace(/\?sig=.*/, ''))).statusCode).toBe(403)
    // La firma de una cuenta no vale para otra.
    const other = b.producers[1] as Battle['producers'][0]
    expect((await get(url.replace(own.id, other.id))).statusCode).toBe(403)
    // Firmada pero sin entrada en la semana: 404.
    expect((await get(resultCardUrl('', secret, '2026-w42', 'nadie'))).statusCode).toBe(404)
  })
})
