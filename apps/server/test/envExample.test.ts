import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'

// mismo intérprete que `tsx --env-file` (Node)
const example = parseEnv(readFileSync(new URL('../.env.example', import.meta.url), 'utf8')) as Record<
  string,
  string
>

/** Variables de la guía §4.15 (más las de la Fase 0). */
const GUIDE_VARIABLES = [
  'BB_PUBLIC_URL',
  'DATABASE_URL',
  'DATABASE_AUTH_TOKEN',
  'BETTER_AUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'BB_CLOUDINARY_PREFIX',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'EMAIL_FROM_NAME',
  'EMAIL_FROM_ADDRESS',
  'MAIL_REPLY_TO',
  'MAIL_DAILY_LIMIT',
  'UNSUBSCRIBE_SECRET',
  'SMTP_URL',
  'OTP_NEWSLETTER_API',
  'CRON_SECRET',
  'IP_HASH_SALT',
  'OTP_ORIGINS',
  'SENTRY_DSN',
  'NODE_ENV',
  'HOST',
  'PORT',
  'ALLOWED_ORIGINS',
  'BB_TEST_CLOCK',
  'LOG_LEVEL',
  'TRUST_PROXY',
]

const SECRETS = [
  'DATABASE_AUTH_TOKEN',
  'BETTER_AUTH_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'DISCORD_CLIENT_SECRET',
  'CLOUDINARY_API_SECRET',
  'GMAIL_APP_PASSWORD',
  'UNSUBSCRIBE_SECRET',
  'CRON_SECRET',
  'IP_HASH_SALT',
]

describe('apps/server/.env.example', () => {
  it('documenta todas las variables de la guía §4.15', () => {
    const missing = GUIDE_VARIABLES.filter((v) => !(v in example))
    expect(missing).toEqual([])
  })

  it('copiado tal cual a .env, el servidor arranca en local', () => {
    const config = loadEnv(example)
    expect(config.env).toBe('development')
    expect(config.testClock).toBe(false)
    expect(config.databaseUrl).toBe('file:./data/local.db')
  })

  it('no trae secretos con valor y usa Mailpit como SMTP local', () => {
    for (const name of SECRETS) expect(example[name], name).toBe('')
    expect(example.SMTP_URL).toBe('smtp://127.0.0.1:1025')
    expect(example.BB_CLOUDINARY_PREFIX).not.toBe('beatbattle')
  })
})
