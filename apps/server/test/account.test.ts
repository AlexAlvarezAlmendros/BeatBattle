import { describe, expect, it } from 'vitest'
import type { MemoryMailer } from '../src/email/mailer'
import type { ImageStorage } from '../src/modules/storage/cloudinary'
import { createAccount, makeApp, ORIGIN, TEST_PASSWORD, type TestApp } from './helpers'

const exportOf = (t: TestApp, cookie: string) =>
  t.app.inject({ method: 'GET', url: '/api/me/export', headers: { cookie } })
const remove = (t: TestApp, cookie: string, confirm: string) =>
  t.app.inject({
    method: 'DELETE',
    url: '/api/me',
    headers: { cookie, origin: ORIGIN },
    payload: { confirm },
  })

/** Todas las filas de todas las tablas, como texto, para buscar restos de una cuenta. */
async function everything(t: TestApp): Promise<Record<string, string>> {
  const tables = await t.db.$client.execute(
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'",
  )
  const out: Record<string, string> = {}
  for (const { name } of tables.rows) {
    const rows = await t.db.$client.execute(`select * from "${String(name)}"`)
    out[String(name)] = JSON.stringify(rows.rows)
  }
  return out
}

function fakeImages() {
  const removed: string[] = []
  const images: ImageStorage = {
    prefix: 'bbt',
    signImageUpload: ({ publicId }) => ({ uploadUrl: 'https://x', publicId, fields: {} }),
    verifyImage: async (publicId) => ({
      publicId,
      format: 'png',
      width: 512,
      height: 512,
      bytes: 1,
      version: 1,
    }),
    imageUrl: (publicId, { size }) => `https://res.cloudinary.com/demo/w_${size}/${publicId}`,
    removeImage: async (publicId) => {
      removed.push(publicId)
    },
  }
  return { images, removed }
}

describe('exportar los datos (RF-PRF-05)', () => {
  it('RF-PRF-05: /api/me/export da cuenta, perfil, emails y consentimientos, sesiones y lo del juego, como descarga', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'Aina' })
    await t.app.inject({
      method: 'PUT',
      url: '/api/me/profile',
      headers: { cookie, origin: ORIGIN },
      payload: { city: 'Girona', links: { youtube: 'youtube.com/@aina' } },
    })
    await t.app.inject({
      method: 'PUT',
      url: '/api/me/email-prefs',
      headers: { cookie, origin: ORIGIN },
      payload: { marketing: true },
    })
    // Un aviso dirigido a la cuenta (los que van a una dirección suelta no se guardan tras enviarse).
    await t.app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie, origin: ORIGIN },
      payload: { currentPassword: TEST_PASSWORD, newPassword: 'otra contraseña larga 41' },
    })
    const res = await exportOf(t, cookie)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="beatbattle-aina-2026-10-05\.json"$/,
    )
    const data = res.json().data
    expect(data.format).toBe('beatbattle-export/1')
    expect(data.account).toMatchObject({
      email: 'aina@example.com',
      username: 'aina',
      displayUsername: 'Aina',
      signInMethods: [{ method: 'password' }],
    })
    expect(data.account.sessions.length).toBeGreaterThan(0)
    expect(data.profile).toMatchObject({
      cardNumber: 1,
      city: 'Girona',
      links: { youtube: 'https://youtube.com/@aina' },
    })
    expect(data.email.consents).toEqual([
      expect.objectContaining({ purpose: 'marketing', granted: true, source: 'ajustes' }),
    ])
    expect(data.email.emails.map((item: { kind: string }) => item.kind)).toContain('auth.security')
    expect(data.game).toEqual({ entries: [], votes: [], achievements: [], xpEvents: [] })
    // Nada que sirva para entrar: ni el hash de la contraseña ni los tokens de sesión.
    const accounts = await t.db.$client.execute('select password from account')
    const sessions = await t.db.$client.execute('select token from session')
    for (const secret of [...accounts.rows.map((r) => r.password), ...sessions.rows.map((r) => r.token)])
      expect(res.body).not.toContain(String(secret))
  })

  it('RNF-SEC-03: sin sesión no hay exportación', async () => {
    const t = await makeApp()
    expect((await t.app.inject({ method: 'GET', url: '/api/me/export' })).statusCode).toBe(401)
  })
})

describe('borrar la cuenta (RF-PRF-04)', () => {
  it('RF-PRF-04: con la confirmación escrita, no queda ningún dato personal; sale account.deleted y se cierra la sesión', async () => {
    const fake = fakeImages()
    const t = await makeApp({ images: fake.images })
    const { id, cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const other = await createAccount(t, { email: 'bru@example.com', username: 'bru' })
    // Datos repartidos por los módulos: perfil, avatar, cambio de nombre, preferencias, consentimiento.
    const put = (url: string, payload: object) =>
      t.app.inject({ method: 'PUT', url, headers: { cookie, origin: ORIGIN }, payload })
    await put('/api/me/profile', { bio: 'Hola', city: 'Girona' })
    await put('/api/me/avatar', { publicId: `bbt/avatars/${id}/a` })
    await put('/api/me/username', { username: 'aina.beats' })
    await put('/api/me/email-prefs', { marketing: true, dropOn: false })
    await exportOf(t, cookie)

    expect((await remove(t, cookie, 'otra')).statusCode).toBe(422)
    const res = await remove(t, cookie, 'AINA.BEATS')
    expect(res.statusCode).toBe(200)
    expect(String(res.headers['set-cookie'])).toMatch(/bb\.session_token=; Path=\/; Max-Age=0/)
    // La sesión ya no vale.
    expect((await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json()).toEqual({
      data: null,
    })
    // El último email, a la dirección (la cuenta ya no existe).
    const farewell = (t.app.email.mailer as MemoryMailer).lastTo('aina@example.com')
    expect(farewell?.subject).toBe('Tu cuenta se ha borrado')
    // El avatar, fuera de Cloudinary.
    expect(fake.removed).toEqual([`bbt/avatars/${id}/a`])
    // Ni el id, ni el email, ni los nombres, en ninguna tabla.
    const tables = await everything(t)
    for (const [table, rows] of Object.entries(tables))
      for (const trace of [id, 'aina@example.com', 'aina.beats', '"aina"', 'Girona'])
        expect(rows.includes(trace), `${table} conserva ${trace}`).toBe(false)
    // La otra cuenta, intacta.
    expect(
      (await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: other.cookie } })).json().data,
    ).toMatchObject({
      username: 'bru',
    })
    // El nombre y el email quedan libres.
    await createAccount(t, { email: 'aina@example.com', username: 'aina' })
  })

  it('§4.14: la supresión (solo el hash) se conserva tras borrar la cuenta', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    await t.db.$client.execute(
      "insert into email_suppression (email_hash, reason, created_at) values ('hash-de-aina', 'unsubscribed_all', 1)",
    )
    await remove(t, cookie, 'aina')
    expect((await t.db.$client.execute('select count(*) as n from email_suppression')).rows[0]?.n).toBe(1)
  })

  it('RNF-SEC-03: sin sesión no se borra nada', async () => {
    const t = await makeApp()
    const res = await t.app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: { origin: ORIGIN },
      payload: { confirm: 'x' },
    })
    expect(res.statusCode).toBe(401)
  })
})
