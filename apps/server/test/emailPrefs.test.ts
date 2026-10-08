import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { emailConsent, emailPref } from '../src/db/schema'
import type { MemoryMailer } from '../src/email/mailer'
import { makeApp, ORIGIN, TEST_PASSWORD, type TestApp } from './helpers'

async function signUpWith(t: TestApp, consents?: object) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: ORIGIN },
    remoteAddress: '203.0.113.77',
    payload: {
      email: 'aina@example.com',
      password: TEST_PASSWORD,
      name: 'aina',
      username: 'aina',
      callbackURL: '/verificar',
      ...(consents ? { consents } : {}),
    },
  })
  expect(res.statusCode).toBe(200)
  const id = (res.json() as { user: { id: string } }).user.id
  // Verificar para tener sesión.
  const link = (t.app.email.mailer as MemoryMailer)
    .lastTo('aina@example.com')
    ?.text.match(/https?:\/\/\S+verify-email\?\S+/)?.[0] as string
  const verified = await t.app.inject({ method: 'GET', url: new URL(link).pathname + new URL(link).search })
  const cookie = String(verified.headers['set-cookie']).match(/bb\.session_token=[^;]+/)?.[0] as string
  return { id, cookie }
}

describe('preferencias y consentimientos de email (§2.12.4)', () => {
  it('RF-NOTIF-16: las casillas del registro quedan en el historial con fecha, versión del texto, origen y hash de la IP', async () => {
    const t = await makeApp()
    const { id } = await signUpWith(t, {
      marketing: true,
      otpNewsletter: false,
      notices: { reminderOn: false },
    })
    const consents = await t.db.select().from(emailConsent).where(eq(emailConsent.userId, id))
    expect(consents).toHaveLength(1)
    expect(consents[0]).toMatchObject({
      purpose: 'marketing',
      granted: true,
      source: 'registro',
      textVersion: 'marketing-2026-10',
    })
    expect(consents[0]?.ipHash).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(consents)).not.toContain('203.0.113.77')
    const [pref] = await t.db.select().from(emailPref).where(eq(emailPref.userId, id))
    expect(pref).toMatchObject({ reminderOn: false, dropOn: true, marketingOn: true })
  })

  it('sin casillas tocadas: avisos activos, sin marketing ni newsletter y sin filas de consentimiento', async () => {
    const t = await makeApp()
    const { id, cookie } = await signUpWith(t)
    expect(await t.db.select().from(emailConsent).where(eq(emailConsent.userId, id))).toHaveLength(0)
    const res = await t.app.inject({ method: 'GET', url: '/api/me/email-prefs', headers: { cookie } })
    expect(res.json().data).toEqual({
      dropOn: true,
      resultsOn: true,
      reminderOn: true,
      juryCallOn: true,
      firstVotesOn: true,
      labelPickOn: true,
      progressOn: true,
      seasonOn: true,
      mondayFormat: 'combined',
      marketing: false,
      otpNewsletter: false,
    })
  })

  it('RF-NOTIF-16: cambiar el consentimiento en Ajustes añade una fila (el historial nunca se sobrescribe); repetirlo no añade nada', async () => {
    const t = await makeApp()
    const { id, cookie } = await signUpWith(t, { marketing: true })
    const put = (payload: object) =>
      t.app.inject({
        method: 'PUT',
        url: '/api/me/email-prefs',
        headers: { cookie, origin: ORIGIN },
        payload,
      })
    const res = await put({ marketing: false, mondayFormat: 'separate', juryCallOn: false })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ marketing: false, mondayFormat: 'separate', juryCallOn: false })
    await put({ marketing: false })
    const history = await t.db.select().from(emailConsent).where(eq(emailConsent.userId, id))
    expect(history.map((c) => [c.granted, c.source])).toEqual([
      [true, 'registro'],
      [false, 'ajustes'],
    ])
    const [pref] = await t.db.select().from(emailPref).where(eq(emailPref.userId, id))
    expect(pref?.marketingOn).toBe(false)
  })

  it('sin sesión no se ven ni se cambian; un campo desconocido se rechaza', async () => {
    const t = await makeApp()
    expect((await t.app.inject({ method: 'GET', url: '/api/me/email-prefs' })).statusCode).toBe(401)
    const { cookie } = await signUpWith(t)
    const bad = await t.app.inject({
      method: 'PUT',
      url: '/api/me/email-prefs',
      headers: { cookie, origin: ORIGIN },
      payload: { spam: true },
    })
    expect(bad.statusCode).toBe(422)
  })
})
