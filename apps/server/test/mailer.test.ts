import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type Server } from 'node:tls'
import MailComposer from 'nodemailer/lib/mail-composer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EnvError, loadEnv } from '../src/config/env'
import {
  createMailer,
  createMemoryMailer,
  createWorkspaceMailer,
  isAllowedRecipient,
  RecipientNotAllowedError,
  toMessage,
  workspaceTransportOptions,
} from '../src/email'

const SENDER = { name: 'Beat Battle · Other People', address: 'batalla@otherpeople.es' }
const EMAIL = {
  id: '0192f3a1-0000-7000-8000-000000000001',
  to: 'aina@example.com',
  subject: 'Prueba',
  html: '<p>Hola</p>',
  text: 'Hola',
}

/** El mensaje tal como saldría, con sus cabeceras, sin conectar a nada. */
async function raw(email: typeof EMAIL & { unsubscribeUrl?: string }): Promise<string> {
  const buffer = await new MailComposer(toMessage(email, SENDER)).compile().build()
  // Las cabeceras largas se pliegan en varias líneas (RFC 5322): se despliegan para comparar.
  return buffer.toString('utf8').replace(/\r\n[ \t]+/g, ' ')
}

describe('transporte de email (§4.19.1)', () => {
  let server: Server
  let port = 0
  let opensslAvailable = true

  beforeAll(async () => {
    // Un servidor TLS con un certificado autofirmado de usar y tirar, como un SMTP «impostor».
    const dir = mkdtempSync(path.join(tmpdir(), 'bb-tls-'))
    try {
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '1',
          '-subj',
          '/CN=localhost',
          '-keyout',
          path.join(dir, 'key.pem'),
          '-out',
          path.join(dir, 'cert.pem'),
        ],
        { stdio: 'ignore' },
      )
    } catch {
      opensslAvailable = false
      return
    }
    server = createServer(
      { key: readFileSync(path.join(dir, 'key.pem')), cert: readFileSync(path.join(dir, 'cert.pem')) },
      (socket) => socket.write('220 impostor ESMTP\r\n'),
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    port = typeof address === 'object' && address ? address.port : 0
  })

  afterAll(() => server?.close())

  it('RF-NOTIF-18: el transporte rechaza un servidor SMTP con certificado autofirmado', async (context) => {
    if (!opensslAvailable) context.skip()
    const mailer = createWorkspaceMailer({
      user: 'batalla@otherpeople.es',
      pass: 'contraseña-de-prueba',
      sender: SENDER,
      host: '127.0.0.1',
      port,
    })
    await expect(mailer.send(EMAIL)).rejects.toThrow(/self[- ]signed|certificate/i)
    await mailer.close()
  })

  it('RF-NOTIF-18: Workspace por TLS directo en el 465, sin desactivar la verificación, a 1 mensaje por segundo', () => {
    const options = workspaceTransportOptions({ user: 'u@otherpeople.es', pass: 'p', sender: SENDER })
    expect(options).toMatchObject({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      maxConnections: 1,
      rateLimit: 1,
      rateDelta: 1000,
    })
    expect(JSON.stringify(options)).not.toContain('rejectUnauthorized')
  })

  it('RF-NOTIF-05: avisos y marketing llevan List-Unsubscribe y List-Unsubscribe-Post (RFC 8058); el servicio, no', async () => {
    const url = 'https://battle.otherpeople.es/api/unsubscribe/one-click?token=abc'
    const withLink = await raw({ ...EMAIL, unsubscribeUrl: url })
    expect(withLink).toMatch(new RegExp(`List-Unsubscribe: <${url.replace(/[?.]/g, '\\$&')}>`))
    expect(withLink).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click')
    const service = await raw(EMAIL)
    expect(service).not.toContain('List-Unsubscribe')
  })

  it('Message-ID propio por fila de la cola, remitente del Workspace y un solo destinatario', async () => {
    const message = await raw(EMAIL)
    expect(message).toContain(`Message-ID: <${EMAIL.id}@otherpeople.es>`)
    expect(message).toMatch(/From: =\?UTF-8\?[QB]\?.+\?= <batalla@otherpeople\.es>/)
    expect(message).toContain('To: aina@example.com')
    expect(message).not.toMatch(/^Bcc:/m)
  })

  it('la preview solo envía a la lista blanca (direcciones o @dominio)', async () => {
    expect(isAllowedRecipient('Ana@OtherPeople.es', ['@otherpeople.es'])).toBe(true)
    expect(isAllowedRecipient('aina@example.com', ['alex@example.com', '@otherpeople.es'])).toBe(false)
    const config = loadEnv({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      BB_PUBLIC_URL: 'https://beatbattle-pr-21.vercel.app',
      GMAIL_USER: 'batalla@otherpeople.es',
      GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
      UNSUBSCRIBE_SECRET: 'x'.repeat(40),
      MAIL_PREVIEW_ALLOWLIST: '@otherpeople.es',
      BETTER_AUTH_SECRET: 'x'.repeat(40),
    })
    const mailer = createMailer(config.mail)
    await expect(mailer?.send(EMAIL)).rejects.toBeInstanceOf(RecipientNotAllowedError)
    await mailer?.close()
  })

  it('el Mailer en memoria guarda lo enviado y puede simular fallos', async () => {
    const mailer = createMemoryMailer(SENDER)
    mailer.failNext(1)
    await expect(mailer.send(EMAIL)).rejects.toThrow()
    await mailer.send(EMAIL)
    expect(mailer.lastTo('AINA@example.com')?.subject).toBe('Prueba')
  })
})

describe('configuración del email (§4.19.1)', () => {
  const PROD = {
    NODE_ENV: 'production',
    BB_PUBLIC_URL: 'https://battle.otherpeople.es',
    BETTER_AUTH_SECRET: 'x'.repeat(40),
  }
  const issues = (source: Record<string, string>) => {
    try {
      loadEnv(source)
    } catch (error) {
      if (error instanceof EnvError) return error.issues.map((issue) => issue.variable)
      throw error
    }
    return []
  }

  it('memoria en los tests, Workspace con sus credenciales, Mailpit en local y nada sin configurar', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).mail.transport).toBe('memory')
    expect(loadEnv({ SMTP_URL: 'smtp://127.0.0.1:1025' }).mail.transport).toBe('smtp')
    expect(loadEnv({}).mail.transport).toBeNull()
    const workspace = loadEnv({ GMAIL_USER: 'batalla@otherpeople.es', GMAIL_APP_PASSWORD: 'p' }).mail
    expect(workspace).toMatchObject({ transport: 'workspace', dailyLimit: 1900 })
    expect(workspace.sender.address).toBe('batalla@otherpeople.es')
  })

  it('RF-NOTIF-18: en producción, nada de Mailpit, remitente = la cuenta y clave de baja obligatoria', () => {
    expect(issues({ ...PROD, SMTP_URL: 'smtp://127.0.0.1:1025' })).toContain('SMTP_URL')
    expect(
      issues({
        ...PROD,
        GMAIL_USER: 'batalla@otherpeople.es',
        GMAIL_APP_PASSWORD: 'p',
        EMAIL_FROM_ADDRESS: 'noreply@otherpeople.com',
      }),
    ).toEqual(expect.arrayContaining(['EMAIL_FROM_ADDRESS', 'UNSUBSCRIBE_SECRET']))
    expect(issues({ GMAIL_USER: 'batalla@otherpeople.es' })).toEqual(['GMAIL_APP_PASSWORD'])
    expect(
      issues({
        ...PROD,
        VERCEL_ENV: 'preview',
        GMAIL_USER: 'b@otherpeople.es',
        GMAIL_APP_PASSWORD: 'p',
        UNSUBSCRIBE_SECRET: 'x'.repeat(40),
      }),
    ).toEqual(['MAIL_PREVIEW_ALLOWLIST'])
  })

  it('los mensajes de error nunca incluyen los valores (ni la contraseña de aplicación)', () => {
    try {
      loadEnv({
        ...PROD,
        GMAIL_USER: 'batalla@otherpeople.es',
        GMAIL_APP_PASSWORD: 'secreto-muy-secreto',
        SMTP_URL: 'smtp://x',
      })
    } catch (error) {
      expect(String(error)).not.toContain('secreto-muy-secreto')
      return
    }
    throw new Error('debía fallar')
  })
})
