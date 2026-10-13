import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { user, vote } from '../src/db/schema'
import { robotsTxt } from '../src/modules/share/seo'
import { type Battle, battle, W42 } from './fixtures/battle'

vi.setConfig({ testTimeout: 30_000 })

/** `sitemap.xml` y `robots.txt` (tarea 6.13, §2.15). */

let b: Battle
afterEach(async () => {
  await b?.t.app.close()
})

const get = (url: string) => b.t.app.inject({ method: 'GET', url })
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

describe('SEO (6.13)', () => {
  it('RF-SHARE-05: el sitemap lleva las semanas selladas y los perfiles de quien participó; nada de una abierta', async () => {
    b = await battle({ producers: 2, voters: 0 })
    const [first, second] = b.producers as [Battle['producers'][0], Battle['producers'][0]]
    for (const [i, stars] of [4, 4, 4].entries())
      await b.t.db
        .insert(vote)
        .values({
          userId: `v-${i}`,
          entryId: first.entryId,
          weekId: b.weekId,
          stars,
          createdAt: 1,
          updatedAt: 1,
        })
    const url = b.t.config.publicUrl

    const open = await get('/sitemap.xml')
    expect(open.statusCode).toBe(200)
    expect(open.headers['content-type']).toBe('application/xml; charset=utf-8')
    expect(locs(open.body)).toEqual([`${url}/`, `${url}/semanas`, `${url}/como-funciona`])

    b.t.clock.set(W42.voteEndsAt)
    await get('/api/weeks/2026-w42/results') // sella
    await b.t.db.update(user).set({ banned: true }).where(eq(user.id, second.id))
    const sealed = (await get('/sitemap.xml')).body
    expect(
      sealed.startsWith(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ),
    ).toBe(true)
    expect(locs(sealed)).toEqual([
      `${url}/`,
      `${url}/semanas`,
      `${url}/como-funciona`,
      `${url}/semana/2026-w42`,
      `${url}/semana/2026-w42/resultados`,
      `${url}/p/prod0`,
    ])
    expect(sealed).toContain(`<lastmod>${new Date(W42.voteEndsAt).toISOString().slice(0, 10)}</lastmod>`)
  })

  it('RF-SHARE-05: robots.txt cierra todo fuera de producción; en producción, lo privado y el sitemap', async () => {
    b = await battle({ producers: 0, voters: 0 })
    const res = await get('/robots.txt')
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(res.body).toBe('User-agent: *\nDisallow: /\n')
    const prod = robotsTxt('https://battle.otherpeople.es', true)
    expect(prod).toContain('Disallow: /api/\n')
    expect(prod).toContain('Disallow: /ajustes\n')
    expect(prod).not.toMatch(/Disallow: \/\n/)
    expect(prod.endsWith('Sitemap: https://battle.otherpeople.es/sitemap.xml\n')).toBe(true)
  })
})
