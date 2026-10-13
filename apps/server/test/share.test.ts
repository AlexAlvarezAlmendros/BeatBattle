import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { user, usernameRedirect, vote } from '../src/db/schema'
import { type Battle, battle, HOUR, W42 } from './fixtures/battle'

// Cada prueba crea varias cuentas: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 30_000 })

/** Páginas compartibles con sus metadatos (tarea 6.12, §4.7.7). */

let b: Battle
afterEach(async () => {
  await b?.t.app.close()
})

const get = (url: string) => b.t.app.inject({ method: 'GET', url })
const meta = (html: string, key: string) =>
  html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1] ?? null
const jsonLd = (html: string) => {
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
  return raw ? JSON.parse(raw) : null
}

describe('páginas compartibles (6.12)', () => {
  it('RF-SHARE-01: /e/:id lleva título, descripción, Open Graph, Twitter y canonical con su imagen versionada', async () => {
    b = await battle({ producers: 1, voters: 0 })
    const own = b.producers[0] as Battle['producers'][0]
    const res = await get(`/e/${own.entryId}`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(res.headers['cache-control']).toBe('public, s-maxage=60, stale-while-revalidate=600')
    const html = res.body
    expect(html).toMatch(/<title>«Flip \d+» · Alias \d+ · Beat Battle<\/title>/)
    expect(html).toContain(`<link rel="canonical" href="${b.t.config.publicUrl}/e/${own.entryId}" />`)
    expect(meta(html, 'og:image')).toMatch(new RegExp(`/api/og/entry/${own.entryId}\\.png\\?v=[\\w-]{12}$`))
    expect(meta(html, 'twitter:card')).toBe('summary_large_image')
    expect(meta(html, 'description')).toContain('Escúchala y vota')
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html.match(/name="description"/g)).toHaveLength(1)
    // La imagen que anuncia existe.
    const image = await get((meta(html, 'og:image') as string).replace(b.t.config.publicUrl, ''))
    expect(image.statusCode).toBe(200)
  })

  it('RF-SHARE-04: sin sellar, ni el productor ni datos estructurados de la grabación; sellada, sí', async () => {
    b = await battle({ producers: 1, voters: 0 })
    const own = b.producers[0] as Battle['producers'][0]
    await b.t.db.update(user).set({ displayUsername: 'MC Secreta' }).where(eq(user.id, own.id))
    for (const [i, stars] of [5, 5, 4].entries())
      await b.t.db.insert(vote).values({
        userId: `v-${i}`,
        entryId: own.entryId,
        weekId: b.weekId,
        stars,
        createdAt: 1,
        updatedAt: 1,
      })
    const blind = (await get(`/e/${own.entryId}`)).body
    expect(blind).not.toMatch(/MC Secreta|prod0/)
    expect(jsonLd(blind)).toBeNull()

    b.t.clock.set(W42.voteEndsAt)
    await get('/api/weeks/2026-w42/results')
    const sealed = (await get(`/e/${own.entryId}`)).body
    expect(meta(sealed, 'og:title')).toMatch(/· MC Secreta · Beat Battle$/)
    expect(meta(sealed, 'description')).toMatch(/1\.º en la semana #1 de Beat Battle con/)
    expect(jsonLd(sealed)).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'MusicRecording',
      byArtist: { '@type': 'Person', name: 'MC Secreta' },
    })
    const results = (await get('/semana/2026-w42/resultados')).body
    expect(meta(results, 'description')).toContain('1.º «Flip')
  })

  it('RF-SHARE-05: /semana/:slug lleva su Event; antes del drop o sin sellar, el index tal cual con 404', async () => {
    b = await battle({ producers: 0, voters: 0 })
    const week = await get('/semana/2026-w42')
    expect(week.statusCode).toBe(200)
    expect(jsonLd(week.body)).toMatchObject({
      '@type': 'Event',
      startDate: new Date(W42.startsAt).toISOString(),
      endDate: new Date(W42.voteEndsAt).toISOString(),
      location: { '@type': 'VirtualLocation', url: `${b.t.config.publicUrl}/semana/2026-w42` },
    })
    const unsealed = await get('/semana/2026-w42/resultados')
    expect(unsealed.statusCode).toBe(404)
    expect(unsealed.body).toContain('<div id="root"></div>')
    expect(unsealed.body).not.toContain('og:title')
    b.t.clock.set(W42.startsAt - HOUR)
    expect((await get('/semana/2026-w42')).statusCode).toBe(404)
    expect((await get('/e/no-existe')).statusCode).toBe(404)
  })

  it('RF-PRF-03: el nombre viejo de un perfil responde 301 al nuevo; un perfil bloqueado no tiene página', async () => {
    b = await battle({ producers: 1, voters: 0 })
    const own = b.producers[0] as Battle['producers'][0]
    expect(meta((await get('/p/PROD0')).body, 'og:url')).toBe(`${b.t.config.publicUrl}/p/prod0`)
    await b.t.db
      .insert(usernameRedirect)
      .values({ old: 'antiguo', userId: own.id, expiresAt: b.t.clock.now() + HOUR })
    const moved = await get('/p/antiguo')
    expect(moved.statusCode).toBe(301)
    expect(moved.headers.location).toBe('/p/prod0')
    await b.t.db.update(user).set({ banned: true }).where(eq(user.id, own.id))
    expect((await get('/p/prod0')).statusCode).toBe(404)
    expect((await get('/p/antiguo')).statusCode).toBe(404)
  })

  it('los metadatos se escapan: un título con comillas o etiquetas no rompe el HTML', async () => {
    b = await battle({ producers: 1, voters: 0 })
    const own = b.producers[0] as Battle['producers'][0]
    const { entry } = await import('../src/db/schema')
    await b.t.db
      .update(entry)
      .set({ title: '"><script>alert(1)</script> $& </title>' })
      .where(eq(entry.id, own.entryId))
    const html = (await get(`/e/${own.entryId}`)).body
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
    expect(html).toContain('$&amp;')
  })
})

describe('index.html de las páginas compartibles', () => {
  it('sin la web construida, 503 (y lo vuelve a intentar en la siguiente petición)', async () => {
    const { indexHtmlLoader } = await import('../src/modules/share/routes')
    const load = indexHtmlLoader(['/no/existe/index.html'])
    await expect(load()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
    await expect(load()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  })
})
