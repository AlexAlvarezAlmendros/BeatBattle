import type { FastifyInstance } from 'fastify'
import { describe, expect, it } from 'vitest'
import { requireSession } from '../src/auth/guards'
import type { MemoryMailer } from '../src/email/mailer'
import { createAccount, makeApp, ORIGIN, TEST_PASSWORD, type TestApp } from './helpers'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const routes = (app: FastifyInstance) => {
  app.get('/api/prueba/sesion', { preHandler: requireSession }, async (req) => ({
    data: { id: req.user?.id },
  }))
}
const mailer = (t: TestApp) => t.app.email.mailer as MemoryMailer
const sessionStatus = async (t: TestApp, cookie: string) =>
  (await t.app.inject({ method: 'GET', url: '/api/prueba/sesion', headers: { cookie } })).statusCode

/** Otra sesión de la misma cuenta, «en otro navegador». */
async function signInAgain(t: TestApp, email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN, 'user-agent': UA },
    remoteAddress: '198.51.100.250',
    payload: { email, password },
  })
  const cookie = String(res.headers['set-cookie'] ?? '').match(/bb\.session_token=[^;]+/)?.[0]
  if (!cookie) throw new Error(`no entró: ${res.statusCode} ${res.body}`)
  return cookie
}

const post = (t: TestApp, url: string, cookie: string | undefined, payload: object) =>
  t.app.inject({
    method: 'POST',
    url,
    headers: { origin: ORIGIN, 'user-agent': UA, ...(cookie ? { cookie } : {}) },
    payload,
  })

describe('flujos de cuenta (§2.3)', () => {
  it('RF-AUTH-08: al restablecer la contraseña se revocan todas las sesiones, también la de otro navegador', async () => {
    const t = await makeApp({ routes })
    const first = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const second = await signInAgain(t, 'aina@example.com')
    expect(await sessionStatus(t, second)).toBe(200)
    expect(
      (
        await post(t, '/api/auth/request-password-reset', undefined, {
          email: 'aina@example.com',
          redirectTo: '/recuperar',
        })
      ).statusCode,
    ).toBe(200)
    const email = mailer(t).lastTo('aina@example.com')
    expect(email?.subject).toBe('Restablece tu contraseña')
    const link = email?.text.match(/https?:\/\/\S+reset-password\/\S+/)?.[0] as string
    const token = new URL(link).pathname.split('/').pop() as string
    const reset = await post(t, '/api/auth/reset-password', undefined, {
      newPassword: 'otra contraseña larga 41',
      token,
    })
    expect(reset.statusCode).toBe(200)
    expect(await sessionStatus(t, first.cookie)).toBe(401)
    expect(await sessionStatus(t, second)).toBe(401)
    // Con la nueva se entra; con la vieja, no.
    expect(
      (
        await post(t, '/api/auth/sign-in/email', undefined, {
          email: 'aina@example.com',
          password: TEST_PASSWORD,
        })
      ).statusCode,
    ).toBe(401)
    await signInAgain(t, 'aina@example.com', 'otra contraseña larga 41')
  })

  it('cambiar la contraseña avisa con auth.security (qué, cuándo y desde dónde)', async () => {
    const t = await makeApp({ routes })
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const res = await post(t, '/api/auth/change-password', cookie, {
      currentPassword: TEST_PASSWORD,
      newPassword: 'otra contraseña larga 41',
      revokeOtherSessions: true,
    })
    expect(res.statusCode).toBe(200)
    const notice = mailer(t).lastTo('aina@example.com')
    expect(notice?.subject).toBe('Han cambiado la contraseña de tu cuenta')
    expect(notice?.text).toContain('Chrome en Linux')
  })

  it('RF-AUTH-10: lista las sesiones con su navegador y «Cerrar las demás» las revoca (y avisa)', async () => {
    const t = await makeApp({ routes })
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const other = await signInAgain(t, 'aina@example.com')
    const list = await t.app.inject({ method: 'GET', url: '/api/auth/list-sessions', headers: { cookie } })
    const sessions = list.json() as { userAgent: string | null; updatedAt: string }[]
    expect(sessions).toHaveLength(2)
    expect(sessions.some((s) => s.userAgent === UA)).toBe(true)
    expect((await post(t, '/api/auth/revoke-other-sessions', cookie, {})).statusCode).toBe(200)
    expect(await sessionStatus(t, other)).toBe(401)
    expect(await sessionStatus(t, cookie)).toBe(200)
    expect(mailer(t).lastTo('aina@example.com')?.subject).toBe('Se han cerrado tus otras sesiones')
  })

  it('cambiar el email: aprobar desde la dirección actual, verificar la nueva y avisar a las dos', async () => {
    const t = await makeApp({ routes })
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    expect(
      (
        await post(t, '/api/auth/change-email', cookie, {
          newEmail: 'nueva@example.com',
          callbackURL: '/ajustes/cuenta',
        })
      ).statusCode,
    ).toBe(200)
    const approve = mailer(t).lastTo('aina@example.com')
    expect(approve?.subject).toBe('Confirma el cambio de email de tu cuenta')
    expect(approve?.text).toContain('n•••@example.com')
    const open = async (address: string) => {
      const link = mailer(t)
        .lastTo(address)
        ?.text.match(/https?:\/\/\S+verify-email\?\S+/)?.[0] as string
      // Se abre sin cookie, como desde otro navegador o desde el móvil.
      return t.app.inject({ method: 'GET', url: new URL(link).pathname + new URL(link).search })
    }
    expect((await open('aina@example.com')).statusCode).toBe(302)
    expect((await open('nueva@example.com')).statusCode).toBe(302)
    const notices = mailer(t)
      .sent.filter((e) => e.subject === 'Han cambiado el email de tu cuenta')
      .map((e) => e.to)
      .sort()
    expect(notices).toEqual(['aina@example.com', 'nueva@example.com'])
    const rows = await t.db.$client.execute('select email, email_verified from user')
    expect(rows.rows[0]).toMatchObject({ email: 'nueva@example.com', email_verified: 1 })
  })

  it('RF-AUTH-09: tampoco se puede cambiar a un email desechable', async () => {
    const t = await makeApp({ routes })
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const sent = mailer(t).sent.length
    const res = await post(t, '/api/auth/change-email', cookie, {
      newEmail: 'x@mailinator.com',
      callbackURL: '/ajustes/cuenta',
    })
    // Se rechaza al pedirlo, con su código, y no sale ningún email.
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: 'EMAIL_DISPOSABLE' })
    expect(mailer(t).sent.length).toBe(sent)
    const link = mailer(t)
      .lastTo('aina@example.com')
      ?.text.match(/https?:\/\/\S+verify-email\?\S+/)?.[0]
    if (link) {
      await t.app.inject({ method: 'GET', url: new URL(link).pathname + new URL(link).search })
      const next = mailer(t)
        .lastTo('x@mailinator.com')
        ?.text.match(/https?:\/\/\S+verify-email\?\S+/)?.[0]
      if (next) await t.app.inject({ method: 'GET', url: new URL(next).pathname + new URL(next).search })
    }
    const rows = await t.db.$client.execute('select email from user')
    expect(rows.rows[0]?.email).toBe('aina@example.com')
  })
})
