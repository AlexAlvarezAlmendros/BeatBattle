import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { and, eq, gt } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Db } from '../../db/client'
import { user, usernameRedirect } from '../../db/schema'
import { appError } from '../../lib/errors'
import { injectMeta, pageMeta } from './meta'
import { type OgData, ogData } from './og'

/**
 * Páginas compartibles (§2.15, §4.7.7, `RF-SHARE-01`; tarea 6.12): `vercel.json` reescribe `/e/:id`,
 * `/semana/:slug`, `/semana/:slug/resultados` y `/p/:username` a la función de la API, y aquí se sirve el
 * `index.html` construido con sus metadatos para los rastreadores y las previsualizaciones. La SPA arranca
 * igual. Lo que no existe (o aún no se puede enseñar) sale con el `index.html` tal cual y 404, y la SPA pinta
 * su pantalla. El nombre de un perfil cambiado responde 301 al nuevo durante 30 días (`RF-PRF-03`).
 */

const CACHE = 'public, s-maxage=60, stale-while-revalidate=600'
const ID = /^[\w-]{1,64}$/

/** Lee el `index.html` de la web construida una vez: en Vercel va dentro de la función (`includeFiles`). */
export function indexHtmlLoader(
  paths = [
    resolve(process.cwd(), 'apps/web/dist/index.html'),
    resolve(process.cwd(), '../web/dist/index.html'),
  ],
): () => Promise<string> {
  let cached: Promise<string> | null = null
  const load = async () => {
    for (const path of paths) {
      try {
        return await readFile(path, 'utf8')
      } catch {}
    }
    throw appError('SERVICE_UNAVAILABLE', 'Falta el index.html de la web (pnpm build).')
  }
  return () => {
    cached ??= load().catch((error) => {
      cached = null
      throw error
    })
    return cached
  }
}

export function shareRoutes(
  app: FastifyInstance,
  deps: { db: Db; publicUrl: string; indexHtml: () => Promise<string> },
): void {
  const page = async (reply: FastifyReply, data: OgData | null) => {
    const html = await deps.indexHtml()
    reply.header('content-type', 'text/html; charset=utf-8')
    reply.header('cache-control', CACHE)
    if (!data) return reply.code(404).send(html)
    return reply.send(injectMeta(html, pageMeta(data, deps.publicUrl), deps.publicUrl))
  }
  const safe = (id: string) => (ID.test(id) ? id : null)

  app.get<{ Params: { id: string } }>('/e/:id', async (req, reply) => {
    const id = safe(req.params.id)
    return page(reply, id ? await ogData(deps.db, 'entry', id, req.now) : null)
  })
  app.get<{ Params: { slug: string } }>('/semana/:slug', async (req, reply) => {
    const slug = safe(req.params.slug)
    return page(reply, slug ? await ogData(deps.db, 'week', slug, req.now) : null)
  })
  app.get<{ Params: { slug: string } }>('/semana/:slug/resultados', async (req, reply) => {
    const slug = safe(req.params.slug)
    return page(reply, slug ? await ogData(deps.db, 'results', slug, req.now) : null)
  })
  app.get<{ Params: { username: string } }>('/p/:username', async (req, reply) => {
    const name = safe(req.params.username)?.toLowerCase()
    if (!name) return page(reply, null)
    const data = await ogData(deps.db, 'profile', name, req.now)
    if (data) return page(reply, data)
    const [moved] = await deps.db
      .select({ username: user.username, banned: user.banned })
      .from(usernameRedirect)
      .innerJoin(user, eq(user.id, usernameRedirect.userId))
      .where(and(eq(usernameRedirect.old, name), gt(usernameRedirect.expiresAt, req.now)))
    if (moved?.username && !moved.banned)
      return reply.header('cache-control', CACHE).redirect(`/p/${moved.username}`, 301)
    return page(reply, null)
  })
}
