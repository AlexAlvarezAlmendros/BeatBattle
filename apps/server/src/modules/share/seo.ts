import { and, desc, eq, isNotNull, max } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client'
import { entry, result, user, week } from '../../db/schema'

/**
 * `robots.txt` y `sitemap.xml` (§2.15, `RF-SHARE-05`; tarea 6.13). El sitemap lleva las páginas fijas
 * públicas, las semanas selladas (la semana y sus resultados) y los perfiles de quien ha participado en
 * alguna sellada; nada de una semana abierta (en voto ciego, un perfil listado al subir diría quién
 * participa). Fuera de producción (previews de Vercel, local), `robots.txt` lo cierra todo.
 */

const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400'
/** Lo que no tiene sentido indexar: la API, lo de sesión, lo de admin y la autenticación. */
const PRIVATE = [
  '/api/',
  '/ajustes',
  '/admin',
  '/subir',
  '/jurado',
  '/entrar',
  '/registro',
  '/verificar',
  '/recuperar',
  '/baja',
  '/alerta',
]
const STATIC_PAGES = ['/', '/semanas', '/como-funciona']

const xml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function robotsTxt(publicUrl: string, indexable: boolean): string {
  if (!indexable) return 'User-agent: *\nDisallow: /\n'
  return `User-agent: *\n${PRIVATE.map((path) => `Disallow: ${path}`).join('\n')}\n\nSitemap: ${publicUrl}/sitemap.xml\n`
}

export async function sitemapXml(db: Db, publicUrl: string): Promise<string> {
  const weeks = await db
    .select({ slug: week.slug, sealedAt: week.sealedAt })
    .from(week)
    .where(isNotNull(week.sealedAt))
    .orderBy(desc(week.startsAt))
  const people = await db
    .select({ username: user.username, lastmod: max(week.sealedAt) })
    .from(user)
    .innerJoin(entry, eq(entry.userId, user.id))
    .innerJoin(week, and(eq(week.id, entry.weekId), isNotNull(week.sealedAt)))
    .innerJoin(result, and(eq(result.entryId, entry.id), eq(result.revision, week.resultRevision)))
    .where(and(isNotNull(user.username), eq(user.banned, false)))
    .groupBy(user.id)
  const urls = [
    ...STATIC_PAGES.map((path) => ({ path, lastmod: null as number | null })),
    ...weeks.flatMap((w) => [
      { path: `/semana/${w.slug}`, lastmod: w.sealedAt },
      { path: `/semana/${w.slug}/resultados`, lastmod: w.sealedAt },
    ]),
    ...people
      .filter((p) => p.username)
      .sort((a, b) => ((a.username ?? '') < (b.username ?? '') ? -1 : 1))
      .map((p) => ({ path: `/p/${p.username}`, lastmod: p.lastmod })),
  ]
  const body = urls
    .map(
      ({ path, lastmod }) =>
        `  <url><loc>${xml(`${publicUrl}${path}`)}</loc>${lastmod ? `<lastmod>${day(lastmod)}</lastmod>` : ''}</url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

export function seoRoutes(
  app: FastifyInstance,
  deps: { db: Db; publicUrl: string; indexable: boolean },
): void {
  app.get('/robots.txt', async (_req, reply) =>
    reply
      .header('content-type', 'text/plain; charset=utf-8')
      .header('cache-control', CACHE)
      .send(robotsTxt(deps.publicUrl, deps.indexable)),
  )
  app.get('/sitemap.xml', async (_req, reply) =>
    reply
      .header('content-type', 'application/xml; charset=utf-8')
      .header('cache-control', CACHE)
      .send(await sitemapXml(deps.db, deps.publicUrl)),
  )
}
