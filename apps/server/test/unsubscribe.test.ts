import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { DEV_UNSUBSCRIBE_SECRET } from '../src/config/env'
import { runBatch } from '../src/db/batch'
import { emailConsent, emailOutbox, emailPref, emailSubscriber, emailSuppression } from '../src/db/schema'
import { createMemoryMailer } from '../src/email/mailer'
import { emailDrain, emailHash, enqueueEmail } from '../src/email/outbox'
import { createRenderer, MissingTemplateError } from '../src/email/render'
import {
  createUnsubscribeLinks,
  createUnsubscribeToken,
  maskEmail,
  pageFromOneClick,
  readUnsubscribeToken,
} from '../src/email/unsubscribe'
import { makeApp, ORIGIN, T0 } from './helpers'

const PUBLIC = 'http://localhost:5173'
const links = createUnsubscribeLinks({ publicUrl: PUBLIC, secret: DEV_UNSUBSCRIBE_SECRET })

async function withUser(email = 'aina@example.com') {
  const t = await makeApp()
  await t.db.$client.execute({
    sql: "INSERT INTO user (id, name, email, username, updated_at) VALUES ('aina', 'Aina', ?, 'aina', 0)",
    args: [email],
  })
  return t
}

const tokenOf = (url: string) => new URL(url).searchParams.get('token') ?? ''

describe('bajas (§2.12.4, §4.19.6)', () => {
  it('RF-NOTIF-05: la baja en un clic (RFC 8058) sin sesión ni Origin desactiva ese tipo y el siguiente envío lo omite', async () => {
    const { app, db, clock } = await withUser()
    const url = new URL(links.oneClick('aina@example.com', 'battle.reminder'))
    const res = await app.inject({
      method: 'POST',
      url: `${url.pathname}${url.search}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    })
    expect(res.statusCode).toBe(200)
    const [pref] = await db.select().from(emailPref).where(eq(emailPref.userId, 'aina'))
    expect(pref).toMatchObject({ reminderOn: false, juryCallOn: true, marketingOn: false })
    // El siguiente recordatorio queda omitido; otro tipo de aviso sigue saliendo.
    const mailer = createMemoryMailer({ name: 'BB', address: 'batalla@otherpeople.es' })
    await runBatch(db, [
      enqueueEmail(db, {
        id: 'r1',
        kind: 'battle.reminder',
        target: { userId: 'aina' },
        idempotencyKey: 'r1',
        payload: {},
        now: clock.now(),
      }),
    ])
    await emailDrain({
      db,
      mailer,
      now: () => clock.now(),
      dailyLimit: 100,
      render: async () => ({ subject: 's', html: 'h', text: 't' }),
      unsubscribeUrl: links.oneClick,
    })
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, 'r1'))
    expect(row).toMatchObject({ status: 'skipped', skipReason: 'pref_off' })
    expect(mailer.sent).toHaveLength(0)
  })

  it('RF-NOTIF-05: la baja en un clic admite también multipart/form-data', async () => {
    const { app } = await withUser()
    const url = new URL(links.oneClick('aina@example.com', 'battle.jury_call'))
    const res = await app.inject({
      method: 'POST',
      url: `${url.pathname}${url.search}`,
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      payload: '--x\r\nContent-Disposition: form-data; name="List-Unsubscribe"\r\n\r\nOne-Click\r\n--x--\r\n',
    })
    expect(res.statusCode).toBe(200)
  })

  it('un token manipulado, de otro secreto o de un email de servicio no sirve', async () => {
    const { app } = await withUser()
    const good = createUnsubscribeToken(DEV_UNSUBSCRIBE_SECRET, 'aina@example.com', 'battle.reminder')
    const [body, sig] = good.split('.')
    const forged = `${Buffer.from(JSON.stringify({ e: 'otra@example.com', k: 'battle.reminder' })).toString('base64url')}.${sig}`
    expect(readUnsubscribeToken(DEV_UNSUBSCRIBE_SECRET, forged)).toBeNull()
    expect(readUnsubscribeToken('otro-secreto-de-mas-de-treinta-y-dos-caracteres', good)).toBeNull()
    expect(
      readUnsubscribeToken(
        DEV_UNSUBSCRIBE_SECRET,
        createUnsubscribeToken(DEV_UNSUBSCRIBE_SECRET, 'a@b.es', 'auth.reset'),
      ),
    ).toBeNull()
    expect(body).toBeTruthy()
    const res = await app.inject({
      method: 'GET',
      url: `/api/unsubscribe?token=${encodeURIComponent(forged)}`,
    })
    expect(res.statusCode).toBe(404)
  })

  it('la página de baja sabe a quién y de qué, con el email enmascarado', async () => {
    const { app } = await withUser()
    const res = await app.inject({
      method: 'GET',
      url: `/api/unsubscribe?token=${encodeURIComponent(tokenOf(links.page('aina@example.com', 'mkt.campaign')))}`,
    })
    expect(res.json()).toEqual({
      data: { kind: 'mkt.campaign', family: 'marketing', email: 'a•••@example.com' },
    })
    expect(maskEmail('kairo.wav@gmail.com')).toBe('k•••@gmail.com')
  })

  it('RF-NOTIF-16: darse de baja de todo apaga los avisos, registra el consentimiento retirado y suprime la dirección (solo su hash)', async () => {
    const { app, db } = await withUser()
    const token = tokenOf(links.page('aina@example.com', 'battle.drop'))
    const noOrigin = await app.inject({
      method: 'POST',
      url: '/api/unsubscribe',
      payload: { token, scope: 'all' },
    })
    expect(noOrigin.statusCode).toBe(403)
    const res = await app.inject({
      method: 'POST',
      url: '/api/unsubscribe',
      headers: { origin: ORIGIN },
      payload: { token, scope: 'all' },
    })
    expect(res.statusCode).toBe(200)
    const [pref] = await db.select().from(emailPref).where(eq(emailPref.userId, 'aina'))
    expect(pref).toMatchObject({
      dropOn: false,
      resultsOn: false,
      reminderOn: false,
      seasonOn: false,
      marketingOn: false,
    })
    const consents = await db.select().from(emailConsent).where(eq(emailConsent.userId, 'aina'))
    expect(consents).toMatchObject([{ purpose: 'marketing', granted: false, source: 'baja', createdAt: T0 }])
    const suppressed = await db.select().from(emailSuppression)
    expect(suppressed).toEqual([
      { emailHash: emailHash('aina@example.com'), reason: 'unsubscribed_all', createdAt: T0 },
    ])
    expect(JSON.stringify(suppressed)).not.toContain('aina@')
  })

  it('un suscriptor sin cuenta que se da de baja del drop deja de estar suscrito', async () => {
    const { app, db } = await makeApp()
    await db
      .insert(emailSubscriber)
      .values({ id: 's1', email: 'nadie@example.com', status: 'confirmed', createdAt: T0 })
    const url = new URL(links.oneClick('nadie@example.com', 'battle.drop'))
    await app.inject({
      method: 'POST',
      url: `${url.pathname}${url.search}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    })
    const [subscriber] = await db.select().from(emailSubscriber)
    expect(subscriber?.status).toBe('unsubscribed')
  })
})

describe('render de la cola (§4.19.3, tarea 2.9)', () => {
  const row = (kind: string, family: 'service' | 'battle', payload: object) => ({
    id: 'x',
    idempotencyKey: 'x',
    userId: 'aina',
    subscriberId: null,
    campaignId: null,
    toAddress: null,
    kind,
    family,
    priority: 0,
    payload: JSON.stringify(payload),
    status: 'sending' as const,
    skipReason: null,
    attempts: 0,
    notBefore: T0,
    providerId: null,
    createdAt: T0,
    sentAt: null,
  })
  const render = createRenderer({ publicUrl: PUBLIC })

  it('pinta la plantilla con el payload guardado: asunto, HTML y texto', async () => {
    const email = await render(
      row('auth.verify', 'service', { name: 'Aina', url: `${PUBLIC}/api/auth/verify-email?token=t` }),
      { to: 'aina@example.com' },
    )
    expect(email.subject).toBe('Confirma tu email y entra en la batalla')
    expect(email.html).toContain('verify-email?token=t')
    expect(email.text).toContain('Aina')
    expect(email.html).not.toContain('Darme de baja')
  })

  it('con baja, el pie enlaza a la página de baja (el mismo token que la de un clic)', async () => {
    const oneClick = links.oneClick('aina@example.com', 'game.progress')
    const email = await render(row('auth.welcome', 'battle', { name: 'Aina', cardNumber: 7 }), {
      to: 'aina@example.com',
      unsubscribeUrl: oneClick,
    })
    const page = pageFromOneClick(oneClick, PUBLIC)
    expect(page).toBe(links.page('aina@example.com', 'game.progress'))
    expect(email.html).toContain(page.replace(/&/g, '&amp;'))
  })

  it('un tipo sin plantilla todavía falla (y la cola lo reintenta)', async () => {
    await expect(render(row('battle.monday', 'battle', {}), { to: 'a@b.es' })).rejects.toBeInstanceOf(
      MissingTemplateError,
    )
  })
})
