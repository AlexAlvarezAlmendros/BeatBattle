import { scheduleWeek as boundaries } from '@beatbattle/rules'
import { afterEach, describe, expect, it } from 'vitest'
import { emailSubscriber } from '../src/db/schema'
import type { MemoryMailer } from '../src/email/mailer'
import { encodeGif } from '../src/media/gif'
import { createSample, makeWeeksApp, scheduleWeek, type WeeksApp } from './fixtures/weeks'
import { createAccount, ORIGIN } from './helpers'

const SECRET = 's'.repeat(40)
const W42 = boundaries({ year: 2026, month: 10, day: 12 })
const HOUR = 3_600_000
/** Lunes 12 a las 08:00 de Madrid (UTC+2). */
const DROP_MAIL_AT = Date.UTC(2026, 9, 12, 6, 0, 0)

let t: WeeksApp
afterEach(async () => {
  await t?.app.close()
})

const mailer = () => t.app.email.mailer as MemoryMailer
const tick = (secret = SECRET) =>
  t.app.inject({ method: 'GET', url: '/api/cron/tick', headers: { authorization: `Bearer ${secret}` } })
const subscribe = (email: string, ip = '203.0.113.7') =>
  t.app.inject({
    method: 'POST',
    url: '/api/subscribe',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    remoteAddress: ip,
    payload: { email },
  })
const confirm = (token: string) =>
  t.app.inject({
    method: 'POST',
    url: '/api/subscribe/confirm',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: { token },
  })
const tokenFor = (email: string) =>
  mailer()
    .lastTo(email)
    ?.text.match(/alerta\?token=([\w-]+)/)?.[1] ?? ''

describe('/api/cron/tick (3.12)', () => {
  it('sin CRON_SECRET responde 503; con un secreto que no es, 401; con el bueno, 200', async () => {
    t = await makeWeeksApp()
    expect((await tick()).statusCode).toBe(503)
    await t.app.close()
    t = await makeWeeksApp({ cronSecret: SECRET })
    expect((await tick('x'.repeat(40))).statusCode).toBe(401)
    expect((await t.app.inject({ method: 'GET', url: '/api/cron/tick' })).statusCode).toBe(401)
    const ok = await tick()
    expect(ok.statusCode).toBe(200)
    expect(ok.json().data.errors).toEqual([])
  })

  it('RF-DROP-04: con el calendario vacío a 72 h, el tick avisa al admin (una vez por lunes)', async () => {
    t = await makeWeeksApp({ cronSecret: SECRET })
    t.clock.set(W42.startsAt - 73 * HOUR)
    expect((await tick()).json().data.calendarGaps).toEqual([])
    t.clock.set(W42.startsAt - 70 * HOUR)
    expect((await tick()).json().data.calendarGaps).toEqual(['2026-10-12'])
    await tick()
    const toAdmin = mailer().sent.filter(
      (email) => email.to === 'jefa@example.com' && /Calendario vacío/.test(email.subject),
    )
    expect(toAdmin).toHaveLength(1)
    expect(toAdmin[0]?.subject).toBe('Calendario vacío: falta el drop del lunes 12 de oc')
  })

  it('RF-DROP-04: con la semana programada no hay aviso', async () => {
    t = await makeWeeksApp({ cronSecret: SECRET })
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    t.clock.set(W42.startsAt - 70 * HOUR)
    expect((await tick()).json().data.calendarGaps).toEqual([])
  })

  it('RF-DROP-03: el tick sella la semana cerrada', async () => {
    t = await makeWeeksApp({ cronSecret: SECRET })
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    t.clock.set(W42.voteEndsAt + 1)
    expect((await tick()).json().data.sealed).toEqual(['2026-w42'])
    expect((await tick()).json().data.sealed).toEqual([])
  })
})

describe('alerta de drop sin cuenta y email del drop (3.13)', () => {
  it('RF-NOTIF-09: alta → alert.confirm → confirmar → battle.drop el lunes a las 08:00, sin duplicar', async () => {
    t = await makeWeeksApp({ cronSecret: SECRET })
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    await createAccount(t, { email: 'lilbru@example.com', username: 'lilbru' })
    const res = await subscribe('Fan@Example.com')
    expect(res.statusCode).toBe(202)
    const confirmMail = mailer().lastTo('fan@example.com')
    expect(confirmMail?.subject).toBe('Confirma tu alerta de drop')
    expect((await confirm(tokenFor('fan@example.com'))).statusCode).toBe(200)
    expect((await confirm(tokenFor('fan@example.com'))).statusCode).toBe(200)

    t.clock.set(DROP_MAIL_AT - 1)
    expect((await tick()).json().data.dropEmails).toBe(0)
    t.clock.set(DROP_MAIL_AT)
    const first = (await tick()).json().data
    expect(first.dropEmails).toBe(3)
    const drop = mailer().lastTo('fan@example.com')
    expect(drop?.subject).toBe('Nuevo drop: Lluvia en Gràcia · 92 BPM · Re menor')
    expect(drop?.text).toContain('crea la tuya')
    expect(drop?.html).toContain('/api/email/countdown/2026-w42.gif')
    expect(mailer().lastTo('lilbru@example.com')?.text).not.toContain('crea la tuya')
    await tick()
    const drops = mailer().sent.filter((email) => email.subject.startsWith('Nuevo drop'))
    expect(drops.map((email) => email.to).sort()).toEqual([
      'fan@example.com',
      'jefa@example.com',
      'lilbru@example.com',
    ])
  })

  it('RF-NOTIF-09: sin confirmar no llega el drop, y a los 7 días se borra; el enlace caduca', async () => {
    t = await makeWeeksApp({ cronSecret: SECRET })
    await subscribe('fan@example.com')
    const token = tokenFor('fan@example.com')
    t.clock.advance(7 * 24 * HOUR)
    expect((await confirm(token)).statusCode).toBe(404)
    expect((await tick()).json().data.cleaned.unconfirmedAlerts).toBe(1)
    expect(await t.db.select().from(emailSubscriber)).toEqual([])
  })

  it('RF-NOTIF-09: al registrarse con el mismo email, la alerta se fusiona y el drop llega una vez, como cuenta', async () => {
    t = await makeWeeksApp({ cronSecret: SECRET })
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    await subscribe('fan@example.com')
    await confirm(tokenFor('fan@example.com'))
    const account = await createAccount(t, { email: 'fan@example.com', username: 'fanatica' })
    const [row] = await t.db.select().from(emailSubscriber)
    expect(row?.mergedUserId).toBe(account.id)
    t.clock.set(DROP_MAIL_AT)
    await tick()
    const drops = mailer().sent.filter(
      (email) => email.to === 'fan@example.com' && email.subject.startsWith('Nuevo drop'),
    )
    expect(drops).toHaveLength(1)
    expect(drops[0]?.text).not.toContain('crea la tuya')
  })

  it('no dice si la dirección ya es de una cuenta: 202 y ningún email', async () => {
    t = await makeWeeksApp({ cronSecret: SECRET })
    mailer().clear()
    const res = await subscribe('jefa@example.com')
    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({ data: { status: 'pending' } })
    expect(mailer().sent).toEqual([])
  })

  it('RNF-SEC-02: altas sin cuenta, 3 por hora e IP', async () => {
    t = await makeWeeksApp({ cronSecret: SECRET })
    for (const n of [1, 2, 3]) expect((await subscribe(`fan${n}@example.com`)).statusCode).toBe(202)
    expect((await subscribe('fan4@example.com')).statusCode).toBe(429)
    expect((await subscribe('fan4@example.com', '203.0.113.8')).statusCode).toBe(202)
  })
})

describe('cuenta atrás en GIF (3.14)', () => {
  const frames = (gif: Buffer) => {
    let count = 0
    for (let i = 0; i + 2 < gif.length; i++)
      if (gif[i] === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 4) count++
    return count
  }

  it('RF-NOTIF-14: la imagen de la cuenta atrás cambia entre dos peticiones separadas un minuto', async () => {
    t = await makeWeeksApp()
    const { id } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', id)
    t.clock.set(W42.startsAt + HOUR)
    const get = () => t.app.inject({ method: 'GET', url: '/api/email/countdown/2026-w42.gif' })
    const a = await get()
    expect(a.statusCode).toBe(200)
    expect(a.headers['content-type']).toBe('image/gif')
    expect(a.headers['cache-control']).toBe('public, max-age=30')
    expect(a.rawPayload.subarray(0, 6).toString()).toBe('GIF89a')
    expect(frames(a.rawPayload)).toBe(60)
    t.clock.advance(10_000)
    expect((await get()).rawPayload.equals(a.rawPayload)).toBe(true)
    t.clock.advance(50_000)
    expect((await get()).rawPayload.equals(a.rawPayload)).toBe(false)
  })

  it('una semana que no existe o cerrada da la imagen de ceros (un email viejo no se rompe)', async () => {
    t = await makeWeeksApp()
    const res = await t.app.inject({ method: 'GET', url: '/api/email/countdown/2020-w01.gif' })
    expect(res.statusCode).toBe(200)
    expect(frames(res.rawPayload)).toBe(1)
  })
})

describe('codificador GIF', () => {
  /** Decodificador LZW de GIF (el de la especificación) para comprobar la ida y vuelta. */
  function decode(gif: Uint8Array, pixelsCount: number): number[] {
    let p = 13 + 3 * 4
    while (gif[p] !== 0x2c) p++
    p += 10
    const minCodeSize = gif[p++] as number
    const data: number[] = []
    while (gif[p] !== 0) {
      const len = gif[p++] as number
      data.push(...gif.subarray(p, p + len))
      p += len
    }
    const clear = 1 << minCodeSize
    const end = clear + 1
    let size = minCodeSize + 1
    let dict: number[][] = []
    const reset = () => {
      dict = Array.from({ length: clear }, (_, i) => [i])
      dict.push([], [])
      size = minCodeSize + 1
    }
    reset()
    const out: number[] = []
    let bit = 0
    let prev: number[] | null = null
    while (out.length < pixelsCount) {
      let code = 0
      for (let i = 0; i < size; i++, bit++) code |= (((data[bit >> 3] as number) >> (bit & 7)) & 1) << i
      if (code === clear) {
        reset()
        prev = null
        continue
      }
      if (code === end) break
      const entry: number[] =
        code < dict.length
          ? (dict[code] as number[])
          : [...(prev as number[]), (prev as number[])[0] as number]
      out.push(...entry)
      if (prev) dict.push([...prev, entry[0] as number])
      if (dict.length === 1 << size && size < 12) size++
      prev = entry
    }
    return out
  }

  it('el LZW va y vuelve (también pasando de 4096 códigos)', () => {
    const width = 300
    const height = 200
    const pixels = new Uint8Array(width * height)
    let seed = 7
    for (let i = 0; i < pixels.length; i++) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      pixels[i] = (seed >> 16) % 4
    }
    const gif = encodeGif({
      width,
      height,
      palette: ['#000000', '#ffffff', '#ff003c', '#4a0d1c'],
      frames: [{ pixels, delayCs: 100 }],
    })
    expect(decode(gif, pixels.length)).toEqual([...pixels])
  })
})
