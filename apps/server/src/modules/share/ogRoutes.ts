import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client'
import { appError } from '../../lib/errors'
import { cardImagePng, ogPng } from '../../media/ogImages'
import { OG_KINDS, type OgKind, ogData, ogVersion } from './og'

/**
 * `GET /api/og/:kind/:id.png?v=` (§2.15, `RF-SHARE-02`; tarea 6.11): la imagen OG de una semana, una entrada,
 * unos resultados o un perfil. Con la versión vigente (`v`, la que ponen los metadatos), caché inmutable de un
 * año: si lo que se ve cambia, cambia la URL. Sin versión o con una vieja, la imagen de ahora con caché corta.
 * Lo que no existe o aún no se puede enseñar (una semana antes del drop, unos resultados sin sellar, una
 * entrada retirada), 404. Las peticiones no se registran: la carta del perfil va en el resumen de temporada
 * (`GET /api/og/profile/:username/card.png`, la carta sola en vertical).
 */

const IMMUTABLE = 'public, max-age=31536000, immutable'
const SHORT = 'public, max-age=300'
// El id de la URL: un slug, un uuid o un nombre de productor, que puede llevar puntos («kairo.wav», `RF-AUTH-06`).
const ID = /^[\w.-]{1,64}$/

export function ogRoutes(app: FastifyInstance, deps: { db: Db }): void {
  app.get<{ Params: { kind: string; file: string }; Querystring: { v?: string } }>(
    '/api/og/:kind/:file',
    // La carta del perfil va también en `season.wrap` (7.30): quien pide la imagen no se registra (`RF-NOTIF-12`).
    { logLevel: 'silent' },
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
  // La carta sola, en vertical (jurado de la 7.35): la «Carta del trimestre» de `season.wrap`, donde la imagen OG se
  // leía a 3–6 px. Lo mismo que la OG del perfil (lo público, solo semanas selladas), con su versión y su caché, y
  // tampoco se registra quién la pide (`RF-NOTIF-12`).
  app.get<{ Params: { username: string }; Querystring: { v?: string } }>(
    '/api/og/profile/:username/card.png',
    { logLevel: 'silent' },
    async (req, reply) => {
      const id = req.params.username
      if (!ID.test(id)) throw appError('NOT_FOUND', 'No existe esa imagen.')
      const data = await ogData(deps.db, 'profile', id, req.now)
      if (data?.kind !== 'profile') throw appError('NOT_FOUND', 'No existe esa imagen.')
      reply.header('content-type', 'image/png')
      reply.header('cache-control', req.query.v === ogVersion(data) ? IMMUTABLE : SHORT)
      return reply.send(Buffer.from(await cardImagePng(data)))
    },
  )
}
