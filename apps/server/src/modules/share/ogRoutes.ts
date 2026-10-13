import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client'
import { appError } from '../../lib/errors'
import { ogPng } from '../../media/ogImages'
import { OG_KINDS, type OgKind, ogData, ogVersion } from './og'

/**
 * `GET /api/og/:kind/:id.png?v=` (§2.15, `RF-SHARE-02`; tarea 6.11): la imagen OG de una semana, una entrada,
 * unos resultados o un perfil. Con la versión vigente (`v`, la que ponen los metadatos), caché inmutable de un
 * año: si lo que se ve cambia, cambia la URL. Sin versión o con una vieja, la imagen de ahora con caché corta.
 * Lo que no existe o aún no se puede enseñar (una semana antes del drop, unos resultados sin sellar, una
 * entrada retirada), 404.
 */

const IMMUTABLE = 'public, max-age=31536000, immutable'
const SHORT = 'public, max-age=300'
const ID = /^[\w-]{1,64}$/

export function ogRoutes(app: FastifyInstance, deps: { db: Db }): void {
  app.get<{ Params: { kind: string; file: string }; Querystring: { v?: string } }>(
    '/api/og/:kind/:file',
    async (req, reply) => {
      const kind = req.params.kind as OgKind
      const id = req.params.file.replace(/\.png$/, '')
      if (!OG_KINDS.includes(kind) || !ID.test(id)) throw appError('NOT_FOUND', 'No existe esa imagen.')
      const data = await ogData(deps.db, kind, id, req.now)
      if (!data) throw appError('NOT_FOUND', 'No existe esa imagen.')
      reply.header('content-type', 'image/png')
      reply.header('cache-control', req.query.v === ogVersion(data) ? IMMUTABLE : SHORT)
      return reply.send(Buffer.from(await ogPng(data)))
    },
  )
}
