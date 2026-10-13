import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { user } from '../../src/db/schema'
import { createDiskSampleStorage, type DiskSampleStorage } from '../../src/modules/storage/samples'
import { createAccount, makeApp, ORIGIN, type TestApp } from '../helpers'
import { sineWav } from './wav'

/** Cabecera mínima de un PNG de `width × height` (lo que lee el almacenamiento falso). */
export function pngHeader(width: number, height: number): Uint8Array {
  const buffer = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0)
  buffer.writeUInt32BE(13, 8)
  buffer.write('IHDR', 12)
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return new Uint8Array(buffer)
}

export interface WeeksApp extends TestApp {
  storage: DiskSampleStorage
  admin: { id: string; cookie: string }
}

/** App con almacenamiento falso en una carpeta temporal y una cuenta admin. */
export async function makeWeeksApp(
  config: Partial<import('../../src/config/env').AppConfig> = {},
): Promise<WeeksApp> {
  const root = await mkdtemp(join(tmpdir(), 'bb-samples-'))
  const storage = createDiskSampleStorage({ root, baseUrl: '', secret: 'x'.repeat(32) })
  const t = await makeApp({ samples: storage, config })
  const admin = await createAccount(t, { email: 'jefa@example.com', username: 'jefa' })
  await t.db.update(user).set({ role: 'admin' }).where(eq(user.id, admin.id))
  return { ...t, storage, admin }
}

export const json = (cookie: string) => ({ cookie, origin: ORIGIN, 'content-type': 'application/json' })

/** Sube un sample como el panel: firma, «sube» al almacenamiento falso y lo crea. */
export async function createSample(
  t: WeeksApp,
  { title = 'Lluvia en Gràcia', seconds = 6, stems = false } = {},
): Promise<{ id: string; durationMs: number }> {
  const sign = async (part: string, sampleId?: string) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/admin/samples/sign',
      headers: json(t.admin.cookie),
      payload: { part, ...(sampleId ? { sampleId } : {}) },
    })
    if (res.statusCode !== 200) throw new Error(`firma: ${res.statusCode} ${res.body}`)
    return res.json().data as { sampleId: string; upload: { publicId: string } }
  }
  const original = await sign('original')
  const { sampleId } = original
  await t.storage.put({ publicId: original.upload.publicId, bytes: sineWav({ seconds }), format: 'wav' })
  const cover = await sign('cover', sampleId)
  await t.storage.put({ publicId: cover.upload.publicId, bytes: pngHeader(1200, 1200), format: 'png' })
  if (stems) {
    const zip = await sign('stems', sampleId)
    await t.storage.put({
      publicId: zip.upload.publicId,
      bytes: new Uint8Array([0x50, 0x4b, 3, 4]),
      format: 'zip',
    })
  }
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/admin/samples',
    headers: json(t.admin.cookie),
    payload: {
      sampleId,
      title,
      credits: 'Other People Records',
      licenseText: 'Uso libre para la batalla.',
      bpm: 92,
      musicalKey: 'Dm',
      hasStems: stems,
    },
  })
  if (res.statusCode !== 201) throw new Error(`crear sample: ${res.statusCode} ${res.body}`)
  return res.json().data
}

/** Programa la semana del lunes `monday` con un sample. */
export async function scheduleWeek(t: WeeksApp, monday: string, sampleId: string) {
  return t.app.inject({
    method: 'POST',
    url: '/api/admin/weeks',
    headers: json(t.admin.cookie),
    payload: { monday, sampleId, challenge: 'Usa solo el primer compás' },
  })
}
