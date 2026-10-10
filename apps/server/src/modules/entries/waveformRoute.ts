import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client'
import { entry } from '../../db/schema'
import { appError } from '../../lib/errors'
import { waveformPng } from '../../media/waveformPng'

/**
 * `GET /api/email/waveform/:entryId.png?v=&sig=` (§4.19.5; tarea 4.12): la onda medida de una entrada para
 * su recibo. Firmada con HMAC sobre el id y la versión del audio (`v`, el `etag` abreviado): nadie puede
 * recorrer los ids, y un audio sustituido tiene otra URL (su recibo nuevo no enseña la onda vieja de la
 * caché). Sin firma válida, 403. Con firma válida pero sin onda (en `processing` o ya borrada), la línea
 * plana: un email viejo nunca da error. La petición no se registra (`RF-NOTIF-12`: abrir el email no deja
 * rastro de quién lo abre).
 */

/** Caché de la imagen: la onda de una versión no cambia. */
const CACHE_SECONDS = 7 * 24 * 60 * 60

const ID = /^[\w-]{1,64}$/
const VERSION = /^[0-9a-f]{0,32}$/

function signature(secret: string, entryId: string, version: string): string {
  return createHmac('sha256', secret).update(`waveform|${entryId}|${version}`).digest('base64url')
}

/** Versión del audio que va en la URL: los 12 primeros caracteres del `etag`. */
export const waveformVersion = (etag: string) =>
  etag
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '')
    .slice(0, 12)

/** La URL firmada de la onda de una entrada (la pone el servidor en el recibo). */
export function waveformUrl(publicUrl: string, secret: string, entryId: string, etag: string): string {
  const version = waveformVersion(etag)
  return `${publicUrl}/api/email/waveform/${entryId}.png?v=${version}&sig=${signature(secret, entryId, version)}`
}

export function waveformRoutes(app: FastifyInstance, deps: { db: Db; secret: string }): void {
  app.get<{ Params: { file: string }; Querystring: { v?: string; sig?: string } }>(
    '/api/email/waveform/:file',
    // Sin registro de la petición: abrir el email no deja rastro de quién lo abre (`RF-NOTIF-12`).
    { logLevel: 'silent' },
    async (req, reply) => {
      const id = req.params.file.replace(/\.png$/, '')
      const version = req.query.v ?? ''
      const given = Buffer.from(req.query.sig ?? '')
      if (!ID.test(id) || !VERSION.test(version)) throw appError('FORBIDDEN', 'Firma no válida.')
      const expected = Buffer.from(signature(deps.secret, id, version))
      if (given.length !== expected.length || !timingSafeEqual(given, expected))
        throw appError('FORBIDDEN', 'Firma no válida.')
      const [row] = await deps.db.select({ peaks: entry.peaks }).from(entry).where(eq(entry.id, id))
      const peaks = row?.peaks
        ? new Int8Array(row.peaks.buffer, row.peaks.byteOffset, row.peaks.byteLength)
        : null
      reply.header('content-type', 'image/png')
      reply.header('cache-control', `public, max-age=${CACHE_SECONDS}`)
      return reply.send(Buffer.from(waveformPng(peaks)))
    },
  )
}
