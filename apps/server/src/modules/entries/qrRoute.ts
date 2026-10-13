import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { appError } from '../../lib/errors'
import { qrPng } from '../../media/qrPng'

/**
 * `GET /api/email/qr/:entryId.png?sig=` (§2.12.1, §4.19.5; tarea 4.13): el QR del recibo, que lleva a la
 * ficha pública de la entrada (`/e/:id`). Firmado con HMAC sobre el id: nadie puede usar la ruta para pintar
 * QR de lo que quiera. No consulta la BD (el QR solo depende del id) y la URL que codifica no dice nada que
 * la ficha no diga ya (en voto ciego, sin autoría: `RF-ENT-10`). Sin firma válida, 403. La petición no se
 * registra (`RF-NOTIF-12`).
 */

/** Caché de la imagen: el QR de una entrada no cambia nunca. */
const CACHE_SECONDS = 30 * 24 * 60 * 60

const ID = /^[\w-]{1,64}$/

function signature(secret: string, entryId: string): string {
  return createHmac('sha256', secret).update(`qr|${entryId}`).digest('base64url')
}

/** Lo que codifica el QR: la ficha pública de la entrada. */
export const entryPageUrl = (publicUrl: string, entryId: string) => `${publicUrl}/e/${entryId}`

/** La URL firmada del QR de una entrada (la pone el servidor en el recibo). */
export function qrUrl(publicUrl: string, secret: string, entryId: string): string {
  return `${publicUrl}/api/email/qr/${entryId}.png?sig=${signature(secret, entryId)}`
}

export function qrRoutes(app: FastifyInstance, deps: { publicUrl: string; secret: string }): void {
  app.get<{ Params: { file: string }; Querystring: { sig?: string } }>(
    '/api/email/qr/:file',
    // Sin registro de la petición: abrir el email no deja rastro de quién lo abre (`RF-NOTIF-12`).
    { logLevel: 'silent' },
    async (req, reply) => {
      const id = req.params.file.replace(/\.png$/, '')
      const given = Buffer.from(req.query.sig ?? '')
      if (!ID.test(id)) throw appError('FORBIDDEN', 'Firma no válida.')
      const expected = Buffer.from(signature(deps.secret, id))
      if (given.length !== expected.length || !timingSafeEqual(given, expected))
        throw appError('FORBIDDEN', 'Firma no válida.')
      reply.header('content-type', 'image/png')
      reply.header('cache-control', `public, max-age=${CACHE_SECONDS}, immutable`)
      return reply.send(Buffer.from(qrPng(entryPageUrl(deps.publicUrl, id))))
    },
  )
}
