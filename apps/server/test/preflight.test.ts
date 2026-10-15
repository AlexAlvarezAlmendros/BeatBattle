import { describe, expect, it } from 'vitest'
import { preflight } from '../src/config/preflight'

/** La configuración de producción de la beta (B.4), completa y con valores de mentira. */
const READY = {
  BB_PUBLIC_URL: 'https://battle.otherpeople.es',
  DATABASE_URL: 'libsql://beatbattle-otp.turso.io',
  DATABASE_AUTH_TOKEN: 'token',
  BETTER_AUTH_SECRET: 'x'.repeat(48),
  CLOUDINARY_CLOUD_NAME: 'beatbattle',
  CLOUDINARY_API_KEY: 'k',
  CLOUDINARY_API_SECRET: 's',
  BB_CLOUDINARY_PREFIX: 'beatbattle',
  GMAIL_USER: 'beatbattle@otherpeople.es',
  GMAIL_APP_PASSWORD: 'abcdabcdabcdabcd',
  EMAIL_FROM_ADDRESS: 'beatbattle@otherpeople.es',
  MAIL_REPLY_TO: 'hola@otherpeople.es',
  CRON_SECRET: 'c'.repeat(40),
  UNSUBSCRIBE_SECRET: 'u'.repeat(48),
  IP_HASH_SALT: 'i'.repeat(32),
  TRUST_PROXY: '1',
  GOOGLE_CLIENT_ID: 'g',
  GOOGLE_CLIENT_SECRET: 'g',
  DISCORD_CLIENT_ID: 'd',
  DISCORD_CLIENT_SECRET: 'd',
}

describe('preflight de producción (beta, B.4)', () => {
  it('con todo, listo y sin avisos', () => {
    expect(preflight(READY)).toEqual({ problems: [], warnings: [] })
  })

  it('dice qué falta o está mal, sin enseñar ningún valor', () => {
    const { problems, warnings } = preflight({
      ...READY,
      DATABASE_URL: 'file:./data/local.db',
      DATABASE_AUTH_TOKEN: '',
      BB_CLOUDINARY_PREFIX: 'beatbattle-dev',
      TRUST_PROXY: '0',
      SMTP_URL: 'smtp://127.0.0.1:1025',
      GOOGLE_CLIENT_SECRET: '',
    })
    expect(problems.map((issue) => issue.variable)).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'DATABASE_AUTH_TOKEN',
        'BB_CLOUDINARY_PREFIX',
        'TRUST_PROXY',
        'SMTP_URL',
      ]),
    )
    expect(warnings.map((issue) => issue.variable)).toEqual(['GOOGLE_CLIENT_ID'])
    expect(JSON.stringify({ problems, warnings })).not.toContain('abcdabcdabcdabcd')
  })

  it('RF-NOTIF-17 / §4.19.1: con una cuenta @gmail.com, un cupo de más de 450 no pasa', () => {
    const personal = { ...READY, GMAIL_USER: 'sello@gmail.com', EMAIL_FROM_ADDRESS: 'sello@gmail.com' }
    expect(preflight(personal).problems.map((issue) => issue.variable)).toEqual(['MAIL_DAILY_LIMIT'])
    expect(preflight({ ...personal, MAIL_DAILY_LIMIT: '450' }).problems).toEqual([])
    expect(preflight({ ...READY, MAIL_DAILY_LIMIT: '1900' }).problems).toEqual([])
  })

  it('con el entorno vacío, lo que pide el propio servidor (el secreto de Better Auth y la URL pública)', () => {
    const variables = preflight({}).problems.map((issue) => issue.variable)
    expect(variables).toEqual(expect.arrayContaining(['BETTER_AUTH_SECRET', 'BB_PUBLIC_URL', 'CRON_SECRET']))
  })
})
