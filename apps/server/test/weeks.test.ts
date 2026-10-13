import { scheduleWeek as boundaries } from '@beatbattle/rules'
import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLog, rulesAcceptance, sampleDownload, seenFlag, week } from '../src/db/schema'
import { sealWeek } from '../src/modules/weeks/seal'
import { createSample, json, makeWeeksApp, scheduleWeek, type WeeksApp } from './fixtures/weeks'
import { createAccount, ORIGIN } from './helpers'

let t: WeeksApp
afterEach(async () => {
  await t?.app.close()
})

const W42 = boundaries({ year: 2026, month: 10, day: 12 })
const HOUR = 3_600_000

async function audits(action: string) {
  return t.db.select().from(auditLog).where(eq(auditLog.action, action))
}

describe('samples del admin (3.6)', () => {
  it('RF-ADM-01: subir sample, marcar 8 chops y guardar; el servidor mide duración, sonoridad y onda', async () => {
    t = await makeWeeksApp()
    const created = await createSample(t, { seconds: 6 })
    expect(created).toMatchObject({ durationMs: 6000, format: 'wav', hasStems: false, chops: [] })
    expect((created as unknown as { loudnessLufs: number }).loudnessLufs).toBeCloseTo(-10, 0)
    const chops = Array.from({ length: 8 }, (_, i) => ({ startMs: i * 700, endMs: i * 700 + 500 }))
    const saved = await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/samples/${created.id}`,
      headers: json(t.admin.cookie),
      payload: { chops },
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().data.chops).toEqual(chops)
    const peaks = Buffer.from(saved.json().data.peaks, 'base64')
    expect(peaks).toHaveLength(2000)
  })

  it('RF-ADM-01: un chop fuera del audio, o menos de 8, no se guarda', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t, { seconds: 6 })
    const outside = Array.from({ length: 8 }, (_, i) => ({ startMs: i * 1000, endMs: i * 1000 + 900 }))
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/samples/${id}`,
      headers: json(t.admin.cookie),
      payload: { chops: outside },
    })
    expect(res.statusCode).toBe(422)
    const seven = await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/samples/${id}`,
      headers: json(t.admin.cookie),
      payload: { chops: outside.slice(0, 7) },
    })
    expect(seven.statusCode).toBe(422)
  })

  it('RF-STO-03: sin portada, con una portada pequeña o con un original que no es audio, no se crea nada', async () => {
    t = await makeWeeksApp()
    const sign = await t.app.inject({
      method: 'POST',
      url: '/api/admin/samples/sign',
      headers: json(t.admin.cookie),
      payload: { part: 'original' },
    })
    const { sampleId, upload } = sign.json().data
    await t.storage.put({
      publicId: upload.publicId,
      bytes: new TextEncoder().encode('no soy un wav'),
      format: 'wav',
    })
    const create = (payload: object) =>
      t.app.inject({
        method: 'POST',
        url: '/api/admin/samples',
        headers: json(t.admin.cookie),
        payload: {
          sampleId,
          title: 'X',
          credits: 'Y',
          licenseText: 'Z',
          bpm: 92,
          musicalKey: 'Dm',
          ...payload,
        },
      })
    const noCover = await create({})
    expect(noCover.statusCode).toBe(422)
    expect(noCover.json().error).toMatchObject({ code: 'SAMPLE_ASSET_INVALID', details: { part: 'cover' } })
    const { pngHeader } = await import('./fixtures/weeks')
    await t.storage.put({
      publicId: t.storage.publicIdFor(sampleId, 'cover'),
      bytes: pngHeader(800, 800),
      format: 'png',
    })
    expect((await create({})).json().error.details.part).toBe('cover')
    await t.storage.put({
      publicId: t.storage.publicIdFor(sampleId, 'cover'),
      bytes: pngHeader(1000, 1000),
      format: 'png',
    })
    const notAudio = await create({})
    expect(notAudio.json().error).toMatchObject({
      code: 'SAMPLE_ASSET_INVALID',
      details: { part: 'original' },
    })
    const list = await t.app.inject({
      method: 'GET',
      url: '/api/admin/samples',
      headers: { cookie: t.admin.cookie },
    })
    expect(list.json().data).toEqual([])
  })

  it('un sample que usa una semana no se borra; si no, sí, con sus ficheros', async () => {
    t = await makeWeeksApp()
    const used = await createSample(t)
    const free = await createSample(t, { title: 'Otro' })
    expect((await scheduleWeek(t, '2026-10-12', used.id)).statusCode).toBe(201)
    const del = (id: string) =>
      t.app.inject({
        method: 'DELETE',
        url: `/api/admin/samples/${id}`,
        headers: { cookie: t.admin.cookie, origin: ORIGIN },
      })
    const blocked = await del(used.id)
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().error).toMatchObject({ code: 'SAMPLE_IN_USE', details: { weeks: ['2026-w42'] } })
    expect((await del(free.id)).statusCode).toBe(204)
    expect(await t.storage.read(t.storage.publicIdFor(free.id, 'original'))).toBeNull()
  })
})

describe('calendario del admin (3.7)', () => {
  it('RF-DROP-02: programar una semana que solapa con otra devuelve 409', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t)
    expect((await scheduleWeek(t, '2026-10-12', id)).statusCode).toBe(201)
    const again = await scheduleWeek(t, '2026-10-12', id)
    expect(again.statusCode).toBe(409)
    expect(again.json().error).toMatchObject({ code: 'WEEK_OVERLAP', details: { slug: '2026-w42' } })
  })

  it('RF-ADM-02 / RF-DROP-05: las fronteras salen de Europe/Madrid; la semana del cambio de octubre dura 169 h', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t)
    const res = await scheduleWeek(t, '2026-10-19', id)
    expect(res.statusCode).toBe(201)
    const created = res.json().data
    expect(created).toMatchObject({
      slug: '2026-w43',
      label: '2026-W43',
      seasonId: '2026-T4',
      phase: 'scheduled',
    })
    expect(created.startsAt).toBe(Date.UTC(2026, 9, 18, 22))
    expect(created.submitEndsAt).toBe(Date.UTC(2026, 9, 25, 19))
    expect((created.voteEndsAt - created.startsAt) / HOUR).toBe(169)
  })

  it('el número de semana sigue el calendario aunque se programen desordenadas, y se recoloca al borrar', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-26', id)
    await scheduleWeek(t, '2026-10-12', id)
    await scheduleWeek(t, '2026-10-19', id)
    const numbers = async () =>
      (await t.app.inject({ method: 'GET', url: '/api/admin/weeks', headers: { cookie: t.admin.cookie } }))
        .json()
        .data.weeks.map((w: { slug: string; number: number }) => [w.slug, w.number])
    expect(await numbers()).toEqual([
      ['2026-w42', 1],
      ['2026-w43', 2],
      ['2026-w44', 3],
    ])
    await t.app.inject({
      method: 'DELETE',
      url: '/api/admin/weeks/2026-w42',
      headers: { cookie: t.admin.cookie, origin: ORIGIN },
    })
    expect(await numbers()).toEqual([
      ['2026-w43', 1],
      ['2026-w44', 2],
    ])
  })

  it('RF-ADM-02: el calendario marca los lunes sin semana; no se programa en el pasado ni fuera de lunes', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    const calendar = (
      await t.app.inject({ method: 'GET', url: '/api/admin/weeks', headers: { cookie: t.admin.cookie } })
    ).json().data
    expect(calendar.gaps.slice(0, 3)).toEqual(['2026-10-05', '2026-10-19', '2026-10-26'])
    expect(calendar.gaps).toHaveLength(11)
    const past = await scheduleWeek(t, '2026-10-05', id)
    expect(past.json().error.code).toBe('WEEK_LOCKED')
    const tuesday = await scheduleWeek(t, '2026-10-13', id)
    expect(tuesday.statusCode).toBe(422)
  })

  it('una semana que ya ha empezado no se cambia ni se borra', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    t.clock.set(W42.startsAt)
    const patch = await t.app.inject({
      method: 'PATCH',
      url: '/api/admin/weeks/2026-w42',
      headers: json(t.admin.cookie),
      payload: { golden: true },
    })
    expect(patch.json().error.code).toBe('WEEK_LOCKED')
    const del = await t.app.inject({
      method: 'DELETE',
      url: '/api/admin/weeks/2026-w42',
      headers: { cookie: t.admin.cookie, origin: ORIGIN },
    })
    expect(del.json().error.code).toBe('WEEK_LOCKED')
  })

  it('RF-ADM-05: cada acción de admin de la fase queda en audit_log con actor, objetivo y carga', async () => {
    t = await makeWeeksApp()
    const a = await createSample(t)
    const b = await createSample(t, { title: 'B' })
    await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/samples/${a.id}`,
      headers: json(t.admin.cookie),
      payload: { title: 'Nuevo' },
    })
    await scheduleWeek(t, '2026-10-12', a.id)
    await t.app.inject({
      method: 'PATCH',
      url: '/api/admin/weeks/2026-w42',
      headers: json(t.admin.cookie),
      payload: { sampleId: b.id },
    })
    await t.app.inject({
      method: 'DELETE',
      url: '/api/admin/weeks/2026-w42',
      headers: { cookie: t.admin.cookie, origin: ORIGIN },
    })
    await t.app.inject({
      method: 'DELETE',
      url: `/api/admin/samples/${a.id}`,
      headers: { cookie: t.admin.cookie, origin: ORIGIN },
    })
    for (const [action, target] of [
      ['sample.create', `sample:${a.id}`],
      ['sample.update', `sample:${a.id}`],
      ['sample.delete', `sample:${a.id}`],
      ['week.schedule', 'week:2026-w42'],
      ['week.update', 'week:2026-w42'],
      ['week.unschedule', 'week:2026-w42'],
    ]) {
      const rows = await audits(action as string)
      expect(
        rows.some((row) => row.target === target && row.actorId === t.admin.id && row.payload),
        action,
      ).toBe(true)
    }
  })

  it('RF-AUTH-03: cada ruta nueva de /api/admin responde 403 a un productor', async () => {
    t = await makeWeeksApp()
    const producer = await createAccount(t, { email: 'lilbru@example.com', username: 'lilbru' })
    for (const [method, url] of [
      ['POST', '/api/admin/samples/sign'],
      ['GET', '/api/admin/samples'],
      ['GET', '/api/admin/samples/x'],
      ['POST', '/api/admin/samples'],
      ['PATCH', '/api/admin/samples/x'],
      ['DELETE', '/api/admin/samples/x'],
      ['GET', '/api/admin/weeks'],
      ['POST', '/api/admin/weeks'],
      ['GET', '/api/admin/weeks/2026-w42'],
      ['PATCH', '/api/admin/weeks/2026-w42'],
      ['DELETE', '/api/admin/weeks/2026-w42'],
    ] as const) {
      const body = method !== 'GET' && method !== 'DELETE'
      const res = await t.app.inject({
        method,
        url,
        headers: body ? json(producer.cookie) : { cookie: producer.cookie, origin: ORIGIN },
        payload: body ? {} : undefined,
      })
      expect(res.statusCode, `${method} ${url}`).toBe(403)
    }
  })
})

describe('semana pública (3.8, 3.9)', () => {
  it('antes del drop solo se sabe cuándo es; en la frontera, la home cambia de semana', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    const current = async () => (await t.app.inject({ method: 'GET', url: '/api/weeks/current' })).json().data
    expect(await current()).toEqual({ week: null, next: { startsAt: W42.startsAt, number: 1 } })
    expect((await t.app.inject({ method: 'GET', url: '/api/weeks/2026-w42' })).statusCode).toBe(404)
    t.clock.set(W42.startsAt - 1)
    expect((await current()).week).toBeNull()
    t.clock.set(W42.startsAt)
    const live = await current()
    expect(live.next).toBeNull()
    expect(live.week).toMatchObject({
      slug: '2026-w42',
      phase: 'open',
      number: 1,
      challenge: 'Usa solo el primer compás',
    })
    expect(live.week.sample).toMatchObject({
      title: 'Lluvia en Gràcia',
      bpm: 92,
      musicalKey: 'Dm',
      durationMs: 6000,
    })
    t.clock.set(W42.submitEndsAt)
    expect((await current()).week.phase).toBe('voting')
  })

  it('RF-DROP-09: el visitante oye el sample (MP3 de escucha firmado) sin cuenta', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    t.clock.set(W42.startsAt + HOUR)
    const week42 = (await t.app.inject({ method: 'GET', url: '/api/weeks/2026-w42' })).json().data
    expect(week42.viewer).toBeNull()
    expect(JSON.stringify(week42)).not.toContain('"audioPublicId"')
    const audio = await t.app.inject({ method: 'GET', url: week42.sample.streamUrl })
    expect(audio.statusCode).toBe(200)
    expect(audio.headers['content-type']).toBe('audio/wav')
    const unsigned = await t.app.inject({
      method: 'GET',
      url: week42.sample.streamUrl.replace(/sig=[^&]+/, 'sig=x'),
    })
    expect(unsigned.statusCode).toBe(401)
  })

  it('RF-DROP-03: sellar dos veces (o a la vez) deja un único sellado, con el mismo instante', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    const [row] = await t.db.select().from(week)
    if (!row) throw new Error('sin semana')
    expect(await sealWeek(t.db, { weekId: row.id, now: W42.voteEndsAt - 1, holder: 'a' })).toBe(false)
    const results = await Promise.all(
      ['a', 'b', 'c'].map((holder, i) => sealWeek(t.db, { weekId: row.id, now: W42.voteEndsAt + i, holder })),
    )
    expect(results.filter(Boolean)).toHaveLength(1)
    const [first] = await t.db.select().from(week)
    expect(await sealWeek(t.db, { weekId: row.id, now: W42.voteEndsAt + 99, holder: 'd' })).toBe(false)
    const [second] = await t.db.select().from(week)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(first?.resultRevision).toBe(1)
  })

  it('RF-DROP-03: la primera lectura tras el cierre sella la semana (perezoso)', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    t.clock.set(W42.voteEndsAt + 5)
    const page = (await t.app.inject({ method: 'GET', url: '/api/weeks/2026-w42' })).json().data
    expect(page.phase).toBe('sealed')
    const [row] = await t.db.select().from(week)
    expect(row?.sealedAt).toBe(W42.voteEndsAt + 5)
  })
})

describe('bases y descarga (3.10)', () => {
  async function openWeek() {
    t = await makeWeeksApp()
    const { id } = await createSample(t, { stems: true })
    await scheduleWeek(t, '2026-10-12', id)
    t.clock.set(W42.startsAt + HOUR)
    return t
  }
  const download = (cookie: string, kind = 'original') =>
    t.app.inject({
      method: 'POST',
      url: '/api/weeks/2026-w42/sample/download',
      headers: json(cookie),
      payload: { kind },
    })
  const accept = (cookie: string) =>
    t.app.inject({
      method: 'POST',
      url: '/api/weeks/2026-w42/rules',
      headers: json(cookie),
      payload: { rulesVersion: 1 },
    })

  it('RF-DROP-06: sin aceptar las bases → 409 RULES_NOT_ACCEPTED; tras aceptarlas → 200 con downloadUrl', async () => {
    await openWeek()
    const producer = await createAccount(t, { email: 'lilbru@example.com', username: 'lilbru' })
    const before = await download(producer.cookie)
    expect(before.statusCode).toBe(409)
    expect(before.json().error.code).toBe('RULES_NOT_ACCEPTED')
    expect((await accept(producer.cookie)).statusCode).toBe(204)
    const after = await download(producer.cookie)
    expect(after.statusCode).toBe(200)
    expect(after.json().data).toMatchObject({ expiresAt: W42.startsAt + 2 * HOUR })
    const week42 = await t.app.inject({
      method: 'GET',
      url: '/api/weeks/2026-w42',
      headers: { cookie: producer.cookie },
    })
    expect(week42.json().data.viewer).toEqual({ rulesAccepted: true, dropSeen: false })
  })

  it('RF-AUTH-01: sin email verificado no se descarga (403 EMAIL_NOT_VERIFIED); sin sesión, 401', async () => {
    await openWeek()
    const unverified = await createAccount(t, {
      email: 'nuevo@example.com',
      username: 'nuevo',
      verify: false,
    })
    const res = await download(unverified.cookie)
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('EMAIL_NOT_VERIFIED')
    const anonymous = await t.app.inject({
      method: 'POST',
      url: '/api/weeks/2026-w42/sample/download',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: {},
    })
    expect(anonymous.statusCode).toBe(401)
  })

  it('RF-DROP-07: la URL va firmada, como adjunto, y caduca a la hora (401)', async () => {
    await openWeek()
    const producer = await createAccount(t, { email: 'lilbru@example.com', username: 'lilbru' })
    await accept(producer.cookie)
    const { downloadUrl } = (await download(producer.cookie)).json().data
    expect(downloadUrl).toMatch(/sig=/)
    expect(downloadUrl).toMatch(/attachment=true/)
    const fresh = await t.app.inject({ method: 'GET', url: downloadUrl })
    expect(fresh.statusCode).toBe(200)
    expect(fresh.headers['content-disposition']).toMatch(/^attachment; filename=".+\.wav"$/)
    t.clock.advance(HOUR)
    expect((await t.app.inject({ method: 'GET', url: downloadUrl })).statusCode).toBe(401)
    const stems = (await download(producer.cookie, 'stems')).json().data.downloadUrl
    t.clock.advance(-HOUR)
    expect((await t.app.inject({ method: 'GET', url: stems })).headers['content-disposition']).toMatch(
      /stems\.zip"$/,
    )
  })

  it('RF-DROP-08: se registra la primera descarga y cuántas; el panel lo cuenta', async () => {
    await openWeek()
    const a = await createAccount(t, { email: 'a@example.com', username: 'aaa' })
    const b = await createAccount(t, { email: 'b@example.com', username: 'bbb' })
    await accept(a.cookie)
    await accept(b.cookie)
    await download(a.cookie)
    t.clock.advance(60_000)
    await download(a.cookie)
    await download(b.cookie)
    const [row] = await t.db
      .select()
      .from(sampleDownload)
      .where(and(eq(sampleDownload.userId, a.id), eq(sampleDownload.kind, 'original')))
    expect(row).toMatchObject({
      count: 2,
      firstAt: W42.startsAt + HOUR,
      lastAt: W42.startsAt + HOUR + 60_000,
    })
    const admin = await t.app.inject({
      method: 'GET',
      url: '/api/admin/weeks/2026-w42',
      headers: { cookie: t.admin.cookie },
    })
    expect(admin.json().data.downloads).toEqual({ accounts: 2, total: 3 })
  })

  it('en «voting» ya no se descarga ni se aceptan bases (WEEK_PHASE_CLOSED)', async () => {
    await openWeek()
    const producer = await createAccount(t, { email: 'lilbru@example.com', username: 'lilbru' })
    await accept(producer.cookie)
    t.clock.set(W42.submitEndsAt)
    expect((await download(producer.cookie)).json().error.code).toBe('WEEK_PHASE_CLOSED')
    expect((await accept(producer.cookie)).json().error.code).toBe('WEEK_PHASE_CLOSED')
  })
})

describe('lo ya visto y los datos de la cuenta (3.11, 3.3)', () => {
  it('RF-DROP-11: marcar la revelación como vista; la siguiente lectura lo sabe', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    t.clock.set(W42.startsAt)
    const producer = await createAccount(t, { email: 'lilbru@example.com', username: 'lilbru' })
    const seen = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/me/seen',
        headers: json(producer.cookie),
        payload: { kind: 'drop', ref: '2026-w42' },
      })
    expect((await seen()).statusCode).toBe(204)
    expect((await seen()).statusCode).toBe(204)
    const page = await t.app.inject({
      method: 'GET',
      url: '/api/weeks/2026-w42',
      headers: { cookie: producer.cookie },
    })
    expect(page.json().data.viewer.dropSeen).toBe(true)
  })

  it('RNF-PRIV-01: bases, descargas y vistos salen en la exportación y se borran con la cuenta', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    t.clock.set(W42.startsAt)
    const producer = await createAccount(t, { email: 'lilbru@example.com', username: 'lilbru' })
    await t.app.inject({
      method: 'POST',
      url: '/api/weeks/2026-w42/rules',
      headers: json(producer.cookie),
      payload: { rulesVersion: 1 },
    })
    await t.app.inject({
      method: 'POST',
      url: '/api/weeks/2026-w42/sample/download',
      headers: json(producer.cookie),
      payload: {},
    })
    await t.app.inject({
      method: 'POST',
      url: '/api/me/seen',
      headers: json(producer.cookie),
      payload: { kind: 'drop', ref: '2026-w42' },
    })
    const exported = (
      await t.app.inject({ method: 'GET', url: '/api/me/export', headers: { cookie: producer.cookie } })
    ).json()
    const weeks = (exported.data ?? exported).weeks
    expect(weeks.rulesAccepted).toEqual([{ week: '2026-w42', rulesVersion: 1, acceptedAt: W42.startsAt }])
    expect(weeks.sampleDownloads).toHaveLength(1)
    expect(weeks.seen).toEqual([{ kind: 'drop', ref: '2026-w42', seenAt: W42.startsAt }])
    const { ACCOUNT_DATA } = await import('../src/modules/account/modules')
    const module = ACCOUNT_DATA.find((m) => m.name === 'weeks')
    const { statements } = await (module as NonNullable<typeof module>).cleanup({
      db: t.db,
      images: null,
      userId: producer.id,
      email: 'lilbru@example.com',
      now: W42.startsAt,
    })
    await t.db.batch(statements as never)
    for (const table of [rulesAcceptance, sampleDownload, seenFlag])
      expect(await t.db.select().from(table).where(eq(table.userId, producer.id))).toEqual([])
  })
})
