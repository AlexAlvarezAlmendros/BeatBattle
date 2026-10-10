import { scheduleWeek as boundaries } from '@beatbattle/rules'
import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLog, emailOutbox, entry, uploadIntent, vote, week } from '../src/db/schema'
import { measureAudio } from '../src/media/measure'
import { INTENT_TTL_MS } from '../src/modules/entries/service'
import { sineWav } from './fixtures/wav'
import { createSample, json, makeWeeksApp, pngHeader, scheduleWeek, type WeeksApp } from './fixtures/weeks'
import { createAccount, ORIGIN } from './helpers'

let t: WeeksApp
afterEach(async () => {
  await t?.app.close()
})

const W42 = boundaries({ year: 2026, month: 10, day: 12 })
const HOUR = 3_600_000
/** Un beat corto y ligero que pasa los límites (31 s, mono a 8 kHz). */
const beat = (seconds = 31) => sineWav({ seconds, sampleRate: 8000, channels: 1 })

type Options = Parameters<typeof makeWeeksApp>[1]

/** Semana 42 abierta y un productor verificado con las bases aceptadas. */
async function openWeek(options: Options = {}) {
  t = await makeWeeksApp({}, options)
  const { id } = await createSample(t)
  await scheduleWeek(t, '2026-10-12', id)
  t.clock.set(W42.startsAt + HOUR)
  return producer('lilbru')
}

async function producer(username: string, { rules = true } = {}) {
  const account = await createAccount(t, { email: `${username}@example.com`, username })
  if (rules)
    await t.app.inject({
      method: 'POST',
      url: '/api/weeks/2026-w42/rules',
      headers: json(account.cookie),
      payload: { rulesVersion: 1 },
    })
  return account
}

const sign = (cookie: string, payload: object = {}) =>
  t.app.inject({
    method: 'POST',
    url: '/api/uploads/sign',
    headers: json(cookie),
    payload: {
      kind: 'entry',
      weekSlug: '2026-w42',
      mime: 'audio/wav',
      bytes: 500_000,
      durationMs: 31_000,
      ...payload,
    },
  })

const ficha = {
  title: 'Bruma en Gràcia',
  bpm: 140,
  musicalKey: 'Am',
  daw: 'FL Studio',
  genres: ['Trap'],
  description: null,
  declaration: true,
}

const create = (cookie: string, intentId: string, extra: object = {}) =>
  t.app.inject({
    method: 'POST',
    url: '/api/weeks/2026-w42/entries',
    headers: json(cookie),
    payload: { intentId, ...ficha, ...extra },
  })

/** Firma y «sube» el fichero al almacenamiento falso, como el navegador. */
async function upload(cookie: string, bytes: Uint8Array = beat(), signPayload: object = {}) {
  const signed = await sign(cookie, { bytes: bytes.byteLength, ...signPayload })
  expect(signed.statusCode, signed.body).toBe(200)
  const data = signed.json().data
  await t.storage.put({ publicId: data.publicId, bytes, format: 'wav', nowMs: t.clock.now() })
  return data as { intentId: string; publicId: string }
}

async function outbox(kind: string) {
  return t.db.select().from(emailOutbox).where(eq(emailOutbox.kind, kind))
}

describe('firmar la subida de una entrada (4.5, §4.8.2)', () => {
  it('RF-ENT-04: el servidor fija el public_id (carpeta de la semana, sin id de usuario) y crea el intent de 1 h', async () => {
    const { id, cookie } = await openWeek()
    const res = await sign(cookie)
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data.publicId).toMatch(/^beatbattle-test\/entries\/2026-w42\/[0-9a-f-]{36}$/)
    expect(data.publicId).not.toContain(id)
    expect(data.chunkBytes).toBe(20 * 1024 * 1024)
    expect(data.expiresAt).toBe(t.clock.now() + INTENT_TTL_MS)
    const [intent] = await t.db.select().from(uploadIntent).where(eq(uploadIntent.id, data.intentId))
    expect(intent).toMatchObject({ userId: id, kind: 'entry', status: 'pending', publicId: data.publicId })
  })

  it('RF-ENT-02: sin bases → RULES_NOT_ACCEPTED; con los envíos cerrados → 409 SUBMISSIONS_CLOSED', async () => {
    await openWeek()
    const fresh = await producer('nuevo', { rules: false })
    expect((await sign(fresh.cookie)).json().error.code).toBe('RULES_NOT_ACCEPTED')
    const ready = await producer('aina')
    t.clock.set(W42.submitEndsAt)
    const closed = await sign(ready.cookie)
    expect(closed.statusCode).toBe(409)
    expect(closed.json().error.code).toBe('SUBMISSIONS_CLOSED')
  })

  it('RF-ENT-03: lo declarado ya se valida al firmar (5 min → DURATION_OUT_OF_RANGE; más de 100 MB → FILE_TOO_LARGE)', async () => {
    const { cookie } = await openWeek()
    const long = await sign(cookie, { durationMs: 300_000 })
    expect(long.statusCode).toBe(422)
    expect(long.json().error).toMatchObject({
      code: 'DURATION_OUT_OF_RANGE',
      details: { durationMs: 300_000, limit: 'max', limitMs: 240_000 },
    })
    expect((await sign(cookie, { bytes: 101 * 1024 * 1024 })).json().error.code).toBe('FILE_TOO_LARGE')
    expect((await sign(cookie, { mime: 'video/mp4' })).json().error.code).toBe('VALIDATION_FAILED')
    expect((await sign(cookie, { durationMs: 240_000 })).statusCode).toBe(200)
  })

  it('RNF-SEC-02: como mucho 10 firmas por hora y cuenta', async () => {
    const { cookie } = await openWeek()
    for (let i = 0; i < 10; i++) expect((await sign(cookie)).statusCode).toBe(200)
    expect((await sign(cookie)).statusCode).toBe(429)
  })

  it('RF-AUTH-01: sin verificar no se firma', async () => {
    await openWeek()
    const unverified = await createAccount(t, { email: 'sin@example.com', username: 'sin', verify: false })
    expect((await sign(unverified.cookie)).json().error.code).toBe('EMAIL_NOT_VERIFIED')
  })
})

describe('registrar la entrada (4.6, §4.8.4)', () => {
  it('RF-STO-04 / RF-NOTIF-06: verifica, mide en el servidor y crea la entrada activa con su alias, recibo y email', async () => {
    const { id, cookie } = await openWeek()
    const { intentId, publicId } = await upload(cookie)
    const res = await create(cookie, intentId)
    expect(res.statusCode, res.body).toBe(201)
    const own = res.json().data
    expect(own).toMatchObject({
      status: 'active',
      weekSlug: '2026-w42',
      title: 'Bruma en Gràcia',
      receiptCode: 'BB-2026W42-0001',
      durationMs: 31_000,
      format: 'wav',
      cover: { kind: 'generative' },
      producer: null,
      canReplaceAudio: true,
    })
    expect(own.alias).toMatch(/^\p{Lu}\p{Ll}+ \p{Lu}\p{Ll}+$/u)
    // Un seno a 0,316 mide −10 LUFS en estéreo; en mono, 3 LU menos.
    expect(own.loudnessLufs).toBeCloseTo(-13, 0)
    expect(own.peaks).toHaveLength(Math.ceil(2000 / 3) * 4)
    expect(own.streamUrl).toContain(publicId)
    const [intent] = await t.db.select().from(uploadIntent).where(eq(uploadIntent.id, intentId))
    expect(intent?.status).toBe('done')
    const receipts = await outbox('entry.receipt')
    expect(receipts).toHaveLength(1)
    expect(receipts[0]?.userId).toBe(id)
    expect(JSON.parse(receipts[0]?.payload ?? '{}')).toMatchObject({
      receiptCode: 'BB-2026W42-0001',
      alias: own.alias,
      title: 'Bruma en Gràcia',
      durationMs: 31_000,
    })
  })

  it('RF-ENT-05: la duración y los bytes los fija el servidor, no lo que declaró el navegador', async () => {
    const { cookie } = await openWeek()
    const { intentId } = await upload(cookie, beat(31), { durationMs: 200_000, bytes: 90_000_000 })
    const own = (await create(cookie, intentId)).json().data
    expect(own.durationMs).toBe(31_000)
    expect(own.bytes).toBe(beat(31).byteLength)
    // Y la ficha no acepta metadatos de integridad.
    const other = await producer('aina')
    const second = await upload(other.cookie)
    expect((await create(other.cookie, second.intentId, { durationMs: 1000 })).statusCode).toBe(422)
  })

  it('RF-ENT-01: una segunda subida en la semana → 409 ENTRY_EXISTS (al firmar y al registrar)', async () => {
    const { cookie } = await openWeek()
    const first = await upload(cookie)
    const second = await upload(cookie)
    expect((await create(cookie, first.intentId)).statusCode).toBe(201)
    expect((await sign(cookie)).json().error.code).toBe('ENTRY_EXISTS')
    const again = await create(cookie, second.intentId)
    expect(again.statusCode).toBe(409)
    expect(again.json().error.code).toBe('ENTRY_EXISTS')
  })

  it('RF-ENT-03 / RF-STO-03: un audio de 20 s (aunque declarara 31) se rechaza, se borra y sale entry.failed', async () => {
    const { id, cookie } = await openWeek()
    const { intentId, publicId } = await upload(cookie, beat(20), { durationMs: 31_000 })
    const res = await create(cookie, intentId)
    expect(res.statusCode).toBe(422)
    expect(res.json().error).toMatchObject({ code: 'DURATION_OUT_OF_RANGE', details: { limit: 'min' } })
    expect(await t.storage.read(publicId)).toBeNull()
    expect(await t.db.select().from(entry)).toEqual([])
    const [intent] = await t.db.select().from(uploadIntent).where(eq(uploadIntent.id, intentId))
    expect(intent?.status).toBe('failed')
    const failed = await outbox('entry.failed')
    expect(failed.map((row) => row.userId)).toEqual([id])
    expect(JSON.parse(failed[0]?.payload ?? '{}')).toMatchObject({
      code: 'DURATION_OUT_OF_RANGE',
      reason: 'audio',
    })
  })

  it('RF-STO-03: sin el recurso subido → 422 ENTRY_ASSET_INVALID y no se crea nada', async () => {
    const { cookie } = await openWeek()
    const signed = (await sign(cookie)).json().data
    const res = await create(cookie, signed.intentId)
    expect(res.statusCode).toBe(422)
    expect(res.json().error).toMatchObject({ code: 'ENTRY_ASSET_INVALID', details: { reason: 'missing' } })
    expect(await t.db.select().from(entry)).toEqual([])
  })

  it('RF-STO-03: un fichero que no es audio → 422 ENTRY_ASSET_INVALID (undecodable)', async () => {
    const { cookie } = await openWeek()
    const { intentId } = await upload(cookie, new TextEncoder().encode('no soy un wav'.repeat(100)))
    const res = await create(cookie, intentId)
    expect(res.statusCode).toBe(422)
    expect(res.json().error).toMatchObject({
      code: 'ENTRY_ASSET_INVALID',
      details: { reason: 'undecodable' },
    })
  })

  it('el intent: de otro, ya usado o caducado → 409 UPLOAD_INTENT_INVALID', async () => {
    const { cookie } = await openWeek()
    const mine = await upload(cookie)
    const other = await producer('aina')
    expect((await create(other.cookie, mine.intentId)).json().error.code).toBe('UPLOAD_INTENT_INVALID')
    const late = await upload(other.cookie)
    t.clock.advance(INTENT_TTL_MS)
    expect((await create(other.cookie, late.intentId)).json().error.code).toBe('UPLOAD_INTENT_INVALID')
    t.clock.advance(-INTENT_TTL_MS)
    expect((await create(cookie, mine.intentId)).statusCode).toBe(201)
    await t.db.update(entry).set({ status: 'withdrawn' })
    expect((await create(cookie, mine.intentId)).json().error.code).toBe('UPLOAD_INTENT_INVALID')
  })

  it('RF-ENT-11: el mismo fichero desde dos cuentas → la segunda se crea, marcada para revisión', async () => {
    const first = await openWeek()
    const second = await producer('aina')
    const bytes = beat()
    const a = await upload(first.cookie, bytes)
    const b = await upload(second.cookie, bytes)
    const one = (await create(first.cookie, a.intentId)).json().data
    const two = await create(second.cookie, b.intentId)
    expect(two.statusCode).toBe(201)
    const [row] = await t.db.select().from(entry).where(eq(entry.id, two.json().data.id))
    expect(row?.duplicateOf).toBe(one.id)
    expect(row?.alias).not.toBe(one.alias)
    expect(row?.receiptNumber).toBe(2)
    const audits = await t.db.select().from(auditLog).where(eq(auditLog.action, 'entry.duplicate'))
    expect(audits.map((item) => item.target)).toEqual([row?.id])
  })

  it('§4.8.4: si la medición no cabe en el presupuesto, la entrada queda en processing y el recibo espera', async () => {
    // El sample se mide de verdad; las entradas, nunca terminan.
    let hang = false
    const { cookie } = await openWeek({
      measure: (source) => (hang ? new Promise(() => {}) : measureAudio(source)),
      measureBudgetMs: 30,
    })
    hang = true
    const { intentId } = await upload(cookie)
    const res = await create(cookie, intentId)
    expect(res.statusCode).toBe(201)
    expect(res.json().data).toMatchObject({
      status: 'processing',
      loudnessLufs: null,
      peaks: null,
      durationMs: 31_000,
    })
    expect(await outbox('entry.receipt')).toEqual([])
  })

  it('RF-ENT-08 (parcial: firma): sustituir el audio de una entrada con votos → 409 ENTRY_HAS_VOTES', async () => {
    const { cookie } = await openWeek()
    const { intentId } = await upload(cookie)
    const own = (await create(cookie, intentId)).json().data
    expect((await sign(cookie, { replacing: own.id })).statusCode).toBe(200)
    await t.db.insert(vote).values({
      userId: 'votante',
      entryId: own.id,
      weekId: (await t.db.select({ w: entry.weekId }).from(entry).where(eq(entry.id, own.id)))[0]!.w,
      stars: 4,
      createdAt: t.clock.now(),
      updatedAt: t.clock.now(),
    })
    const res = await sign(cookie, { replacing: own.id })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('ENTRY_HAS_VOTES')
    // Un intent de sustitución no sirve para crear otra entrada.
    const [replace] = await t.db
      .select()
      .from(uploadIntent)
      .where(and(eq(uploadIntent.entryId, own.id), eq(uploadIntent.status, 'pending')))
    expect((await create(cookie, replace!.id)).json().error.code).toBe('UPLOAD_INTENT_INVALID')
  })

  it('RNF-SEC-03: sin sesión no se registra nada', async () => {
    await openWeek()
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/weeks/2026-w42/entries',
      headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      payload: { intentId: 'x', ...ficha },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('la entrada: ficha pública, editar, sustituir y retirar (4.7)', () => {
  const get = (id: string, cookie?: string) =>
    t.app.inject({ method: 'GET', url: `/api/entries/${id}`, headers: cookie ? { cookie } : {} })
  const patch = (cookie: string, id: string, payload: object) =>
    t.app.inject({ method: 'PATCH', url: `/api/entries/${id}`, headers: json(cookie), payload })

  /** Sube la portada propia (PNG) y devuelve su intent. */
  async function uploadCover(cookie: string) {
    const signed = await t.app.inject({
      method: 'POST',
      url: '/api/uploads/sign',
      headers: json(cookie),
      payload: { kind: 'entryCover', weekSlug: '2026-w42', mime: 'image/png', bytes: 33 },
    })
    expect(signed.statusCode, signed.body).toBe(200)
    const data = signed.json().data
    expect(data.publicId).toMatch(/^beatbattle-test\/entry-covers\/2026-w42\//)
    await t.storage.put({
      publicId: data.publicId,
      bytes: pngHeader(800, 800),
      format: 'png',
      nowMs: t.clock.now(),
    })
    return data as { intentId: string; publicId: string }
  }

  it('RF-ENT-10: en voto ciego, la ficha pública no lleva autoría ni la portada propia; tras el sellado, sí', async () => {
    const { id: userId, cookie } = await openWeek()
    const cover = await uploadCover(cookie)
    const { intentId } = await upload(cookie)
    const own = (await create(cookie, intentId, { coverIntentId: cover.intentId })).json().data
    expect(own.ownCoverUrl).toContain(cover.publicId)
    expect(own.cover).toMatchObject({ kind: 'generative' })
    const blind = await get(own.id)
    expect(blind.statusCode).toBe(200)
    const body = blind.body
    for (const leak of [userId, 'lilbru', cover.publicId, 'avatar', 'userId', 'username'])
      expect(body, leak).not.toContain(leak)
    expect(blind.json().data).toMatchObject({
      producer: null,
      cover: { kind: 'generative' },
      alias: own.alias,
    })
    await t.db.update(week).set({ sealedAt: t.clock.now() })
    const sealed = (await get(own.id)).json().data
    expect(sealed.producer).toMatchObject({ username: 'lilbru', displayName: 'lilbru' })
    expect(sealed.cover).toMatchObject({ kind: 'own' })
  })

  it('RNF-SEC-04 (parcial): una entrada en processing solo existe para su dueño', async () => {
    let hang = false
    const { cookie } = await openWeek({
      measure: (source) => (hang ? new Promise(() => {}) : measureAudio(source)),
      measureBudgetMs: 30,
    })
    hang = true
    const { intentId } = await upload(cookie)
    const own = (await create(cookie, intentId)).json().data
    expect((await get(own.id)).statusCode).toBe(404)
    expect((await get(own.id, cookie)).statusCode).toBe(200)
  })

  it('§2.5: la ficha se edita hasta el cierre de envíos, y solo su dueño', async () => {
    const { cookie } = await openWeek()
    const own = (await create(cookie, (await upload(cookie)).intentId)).json().data
    const edited = await patch(cookie, own.id, { title: 'Otro título', genres: ['Drill', 'Jersey'] })
    expect(edited.statusCode, edited.body).toBe(200)
    expect(edited.json().data).toMatchObject({
      title: 'Otro título',
      genres: ['Drill', 'Jersey'],
      alias: own.alias,
    })
    const other = await producer('aina')
    expect((await patch(other.cookie, own.id, { title: 'Mío' })).statusCode).toBe(404)
    t.clock.set(W42.submitEndsAt)
    expect((await patch(cookie, own.id, { title: 'Tarde' })).json().error.code).toBe('SUBMISSIONS_CLOSED')
  })

  it('RF-ENT-08: sin votos se sustituye el audio (mismo alias y recibo, entry.changed y el anterior borrado)', async () => {
    const { cookie } = await openWeek()
    const first = await upload(cookie)
    const own = (await create(cookie, first.intentId)).json().data
    const replacement = await upload(cookie, beat(45), { replacing: own.id })
    const res = await t.app.inject({
      method: 'PUT',
      url: `/api/entries/${own.id}/audio`,
      headers: json(cookie),
      payload: { intentId: replacement.intentId },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().data).toMatchObject({
      alias: own.alias,
      receiptCode: own.receiptCode,
      durationMs: 45_000,
      status: 'active',
    })
    expect(await t.storage.read(first.publicId)).toBeNull()
    const changed = await outbox('entry.changed')
    expect(JSON.parse(changed[0]?.payload ?? '{}')).toMatchObject({
      change: 'replaced',
      receiptCode: own.receiptCode,
    })
  })

  it('RF-ENT-09: retirar borra el audio y los votos, libera el hueco y el número de recibo no se reutiliza', async () => {
    const { cookie } = await openWeek()
    const first = await upload(cookie)
    const own = (await create(cookie, first.intentId)).json().data
    const [row] = await t.db.select().from(entry).where(eq(entry.id, own.id))
    await t.db.insert(vote).values({
      userId: 'votante',
      entryId: own.id,
      weekId: row!.weekId,
      stars: 5,
      createdAt: t.clock.now(),
      updatedAt: t.clock.now(),
    })
    const res = await t.app.inject({
      method: 'DELETE',
      url: `/api/entries/${own.id}`,
      headers: { cookie, origin: ORIGIN },
    })
    expect(res.statusCode).toBe(204)
    expect(await t.db.select().from(vote)).toEqual([])
    expect(await t.storage.read(first.publicId)).toBeNull()
    expect((await t.db.select().from(entry).where(eq(entry.id, own.id)))[0]?.status).toBe('withdrawn')
    expect((await get(own.id, cookie)).statusCode).toBe(404)
    const changed = await outbox('entry.changed')
    expect(JSON.parse(changed[0]?.payload ?? '{}')).toMatchObject({ change: 'withdrawn', votesLost: 1 })
    // Tras retirarla puede subir otra, con el recibo siguiente.
    const again = await create(cookie, (await upload(cookie)).intentId)
    expect(again.statusCode).toBe(201)
    expect(again.json().data.receiptCode).toBe('BB-2026W42-0002')
  })
})

describe('la semana con lo de quien mira (4.8, §3.8.3)', () => {
  const weekView = (cookie?: string) =>
    t.app.inject({ method: 'GET', url: '/api/weeks/2026-w42', headers: cookie ? { cookie } : {} })

  it('RNF-SEC-04: la semana dice cuántas entradas hay (dato de la semana) y a cada uno, la suya', async () => {
    const { cookie } = await openWeek()
    const own = (await create(cookie, (await upload(cookie)).intentId)).json().data
    const mine = (await weekView(cookie)).json().data
    expect(mine.entries).toBe(1)
    expect(mine.viewer.entry).toEqual({ id: own.id, status: 'active', alias: own.alias })
    const other = await producer('aina')
    expect((await weekView(other.cookie)).json().data.viewer.entry).toBeNull()
    const anonymous = (await weekView()).json().data
    expect(anonymous).toMatchObject({ entries: 1, viewer: null })
    // Una retirada no cuenta ni es «la suya».
    await t.app.inject({
      method: 'DELETE',
      url: `/api/entries/${own.id}`,
      headers: { cookie, origin: ORIGIN },
    })
    expect((await weekView(cookie)).json().data).toMatchObject({ entries: 0, viewer: { entry: null } })
  })
})
