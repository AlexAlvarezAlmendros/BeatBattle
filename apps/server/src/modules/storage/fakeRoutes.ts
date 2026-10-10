import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { appError } from '../../lib/errors'
import { type DiskSampleStorage, SAMPLE_MAX_BYTES } from './samples'

const MIME: Record<string, string> = {
  wav: 'audio/wav',
  flac: 'audio/flac',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  mp3: 'audio/mpeg',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/**
 * Rutas del almacenamiento falso en disco (§4.8.6, tarea 3.4): hacen de Cloudinary en los E2E y en
 * desarrollo sin red. Solo se registran con `BB_FAKE_STORAGE` fuera de producción. Imitan lo que importa:
 * la subida firmada (multipart, con `public_id` y firma; también **por trozos**, con `X-Unique-Upload-Id` y
 * `Content-Range`, §4.7.4: el último trozo cierra el recurso y la respuesta lleva su `etag`), la escucha
 * firmada y la descarga como adjunto que caduca (pasada la hora, 401, como la API de descarga de Cloudinary).
 */
export function fakeStorageRoutes(app: FastifyInstance, storage: DiskSampleStorage): void {
  app.register(async (scope) => {
    scope.addContentTypeParser(
      'multipart/form-data',
      { parseAs: 'buffer', bodyLimit: SAMPLE_MAX_BYTES.original + 1024 * 1024 },
      (_req, body, done) => done(null, body),
    )

    scope.post(
      '/api/test/storage/upload',
      { config: { fakeStorageUpload: true }, bodyLimit: SAMPLE_MAX_BYTES.original + 1024 * 1024 },
      async (req) => {
        const form = await new Request('http://storage.test/', {
          method: 'POST',
          headers: { 'content-type': String(req.headers['content-type']) },
          body: req.body as Buffer,
        }).formData()
        const field = (name: string) => {
          const value = form.get(name)
          return typeof value === 'string' ? value : ''
        }
        const publicId = field('public_id')
        const signed = `${publicId}|${field('timestamp')}|${field('allowed_formats')}`
        if (!storage.checkSignature(signed, field('signature')))
          throw appError('UNAUTHORIZED', 'Firma de subida no válida.')
        const file = form.get('file')
        if (!(file instanceof File)) throw appError('VALIDATION_FAILED', 'Falta el fichero.')
        const format = (file.name.split('.').pop() ?? '').toLowerCase()
        if (!field('allowed_formats').split(',').includes(format))
          throw appError('UNSUPPORTED_FORMAT', `Formato ${format} no permitido.`)
        const bytes = new Uint8Array(await file.arrayBuffer())
        const range = parseContentRange(req.headers['content-range'])
        if (!range) {
          const meta = await storage.put({ publicId, bytes, format, nowMs: req.now })
          return { public_id: publicId, format, bytes: meta.bytes, etag: meta.etag, done: true }
        }
        // Por trozos: cada uno se guarda aparte y el último cierra el recurso (como Cloudinary).
        const uploadId = String(req.headers['x-unique-upload-id'] ?? '')
        if (!/^[\w-]{8,64}$/.test(uploadId)) throw appError('VALIDATION_FAILED', 'Falta X-Unique-Upload-Id.')
        if (range.end - range.start + 1 !== bytes.byteLength)
          throw appError('VALIDATION_FAILED', 'El trozo no mide lo que dice Content-Range.')
        const dir = join(storage.root, '.chunks', uploadId)
        await mkdir(dir, { recursive: true })
        await writeFile(join(dir, String(range.start).padStart(12, '0')), bytes)
        if (range.end + 1 < range.total) return { done: false }
        const parts = (await readdir(dir)).sort()
        const chunks = await Promise.all(parts.map((name) => readFile(join(dir, name))))
        await rm(dir, { recursive: true, force: true })
        const whole = Buffer.concat(chunks)
        if (whole.byteLength !== range.total)
          throw appError('VALIDATION_FAILED', 'Faltan trozos: el fichero no mide lo que dice Content-Range.')
        const meta = await storage.put({ publicId, bytes: new Uint8Array(whole), format, nowMs: req.now })
        return { public_id: publicId, format, bytes: meta.bytes, etag: meta.etag, done: true }
      },
    )

    const serve =
      (attachment: boolean) =>
      async (
        req: { params: { '*': string }; query: Record<string, string | undefined>; now: number },
        reply: import('fastify').FastifyReply,
      ) => {
        const publicId = req.params['*']
        const expires = req.query.expires ? Number(req.query.expires) : null
        if (!storage.checkSignature(`${publicId}|${expires ?? ''}`, req.query.sig ?? ''))
          throw appError('UNAUTHORIZED', 'Firma no válida.')
        if (expires !== null && req.now >= expires) throw appError('UNAUTHORIZED', 'El enlace ha caducado.')
        const found = await storage.read(publicId)
        if (!found) throw appError('NOT_FOUND', 'No existe.')
        reply.header('content-type', MIME[found.meta.format] ?? 'application/octet-stream')
        reply.header('cache-control', 'private, max-age=60')
        if (attachment) {
          const name = publicId.split('/').slice(-2).join('-')
          const file = name.includes('.') ? name : `${name}.${found.meta.format}`
          reply.header('content-disposition', `attachment; filename="${file}"`)
        }
        return reply.send(Buffer.from(found.bytes))
      }
    scope.get<{ Params: { '*': string }; Querystring: Record<string, string | undefined> }>(
      '/api/test/storage/stream/*',
      (req, reply) => serve(false)(req, reply),
    )
    scope.get<{ Params: { '*': string }; Querystring: Record<string, string | undefined> }>(
      '/api/test/storage/download/*',
      (req, reply) => serve(true)(req, reply),
    )
  })
}

/** `Content-Range: bytes 0-20971519/62914560` → `{ start, end, total }`, o `null` sin la cabecera. */
function parseContentRange(
  header: string | string[] | undefined,
): { start: number; end: number; total: number } | null {
  if (typeof header !== 'string') return null
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header.trim())
  if (!match) throw appError('VALIDATION_FAILED', 'Content-Range no válido.')
  const [start, end, total] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (start > end || end >= total) throw appError('VALIDATION_FAILED', 'Content-Range no válido.')
  return { start, end, total }
}
