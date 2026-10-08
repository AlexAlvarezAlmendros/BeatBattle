import nodemailer from 'nodemailer'

/**
 * Transporte de email (guía §4.19.1, tarea 2.7). La cola (`email_outbox`, §4.19.3) decide **qué** sale y
 * **cuándo** (familias, preferencias, supresiones, presupuesto diario); el `Mailer` solo lo entrega. Tres
 * implementaciones:
 *
 * - **Workspace** (producción y preview): nodemailer contra `smtp.gmail.com:465` con TLS verificado (nunca
 *   `rejectUnauthorized: false`, que el sello sí desactiva), *pool* de una conexión a un mensaje por
 *   segundo y contraseña de aplicación de una dirección del Google Workspace de `otherpeople.es`.
 * - **SMTP** (local): Mailpit (`pnpm mail:dev`), sin TLS. Ningún email sale de la máquina.
 * - **Memoria** (tests y E2E): guarda lo enviado para inspeccionarlo.
 *
 * Un destinatario por mensaje, siempre (nunca CCO masiva).
 */

export interface OutgoingEmail {
  /** Id de la fila de `email_outbox`: da el `Message-ID` propio y la referencia de los rebotes. */
  id: string
  to: string
  subject: string
  html: string
  text: string
  /**
   * URL de baja en un clic (RFC 8058) en avisos y marketing: va en `List-Unsubscribe` con
   * `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Los de servicio no la llevan.
   */
  unsubscribeUrl?: string
}

export interface SendResult {
  /** Lo que devuelve el servidor (el `Message-ID` aceptado): `email_outbox.provider_id`. */
  providerId: string
}

export type MailerKind = 'workspace' | 'smtp' | 'memory'

export interface Mailer {
  readonly kind: MailerKind
  send(email: OutgoingEmail): Promise<SendResult>
  /** Cierra las conexiones del *pool* (en Vercel, al acabar cada `tick`). */
  close(): Promise<void>
}

export interface Sender {
  name: string
  address: string
  replyTo?: string
}

/** El destinatario no está en la lista blanca de la preview (§4.19.1): no se envía. */
export class RecipientNotAllowedError extends Error {
  constructor() {
    super('Destinatario fuera de la lista blanca de la preview')
    this.name = 'RecipientNotAllowedError'
  }
}

/** Servidor SMTP de Google: el mismo para Gmail y Workspace. */
export const GOOGLE_SMTP = { host: 'smtp.gmail.com', port: 465 } as const

/** Dominio del remitente, para el `Message-ID` propio (`<id@dominio>`). */
function messageIdDomain(sender: Sender): string {
  return sender.address.split('@')[1] ?? 'localhost'
}

/** El mensaje de nodemailer para un email: remitente, cabeceras de baja y `Message-ID` (exportado para los tests). */
export function toMessage(email: OutgoingEmail, sender: Sender) {
  return {
    from: { name: sender.name, address: sender.address },
    to: email.to,
    replyTo: sender.replyTo,
    subject: email.subject,
    html: email.html,
    text: email.text,
    messageId: `<${email.id}@${messageIdDomain(sender)}>`,
    // Las cabeceras a mano (no la opción `list` de nodemailer, que solo se aplica dentro de `sendMail`):
    // así lo que se prueba es lo que sale.
    ...(email.unsubscribeUrl
      ? {
          headers: {
            'List-Unsubscribe': `<${email.unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }
      : {}),
  }
}

export interface WorkspaceOptions {
  user: string
  pass: string
  sender: Sender
  /** Solo para los tests del TLS: por defecto, `smtp.gmail.com:465`. */
  host?: string
  port?: number
}

/**
 * Las opciones de nodemailer del transporte de Workspace (exportadas para el test de `RF-NOTIF-18`): TLS
 * directo en el 465 con la verificación de certificado por defecto, una conexión, 1 mensaje por segundo.
 */
export function workspaceTransportOptions(options: WorkspaceOptions) {
  return {
    pool: true as const,
    host: options.host ?? GOOGLE_SMTP.host,
    port: options.port ?? GOOGLE_SMTP.port,
    secure: true,
    auth: { user: options.user, pass: options.pass },
    maxConnections: 1,
    rateDelta: 1000,
    rateLimit: 1,
    tls: { minVersion: 'TLSv1.2' as const },
  }
}

export function createWorkspaceMailer(options: WorkspaceOptions): Mailer {
  const transport = nodemailer.createTransport(workspaceTransportOptions(options))
  return {
    kind: 'workspace',
    async send(email) {
      const info = await transport.sendMail(toMessage(email, options.sender))
      return { providerId: info.messageId }
    },
    async close() {
      transport.close()
    },
  }
}

/** Mailpit en local (`smtp://127.0.0.1:1025`). */
export function createSmtpMailer(url: string, sender: Sender): Mailer {
  const transport = nodemailer.createTransport(url)
  return {
    kind: 'smtp',
    async send(email) {
      const info = await transport.sendMail(toMessage(email, sender))
      return { providerId: info.messageId }
    },
    async close() {
      transport.close()
    },
  }
}

export interface MemoryMailer extends Mailer {
  readonly kind: 'memory'
  /** Todo lo enviado, en orden, con el remitente y las cabeceras de baja tal como saldrían. */
  readonly sent: readonly (OutgoingEmail & { from: Sender; providerId: string })[]
  /** El último email a una dirección (los E2E sacan de aquí el enlace de verificación). */
  lastTo(address: string): (OutgoingEmail & { from: Sender; providerId: string }) | undefined
  clear(): void
  /** Hace fallar los próximos `n` envíos (para probar los reintentos de la cola). */
  failNext(n: number): void
}

export function createMemoryMailer(sender: Sender): MemoryMailer {
  const sent: (OutgoingEmail & { from: Sender; providerId: string })[] = []
  let failures = 0
  return {
    kind: 'memory',
    sent,
    async send(email) {
      if (failures > 0) {
        failures -= 1
        throw new Error('Fallo simulado del transporte')
      }
      const providerId = `<${email.id}@${messageIdDomain(sender)}>`
      sent.push({ ...email, from: sender, providerId })
      return { providerId }
    },
    async close() {},
    lastTo(address) {
      const lower = address.toLowerCase()
      return sent.findLast((email) => email.to.toLowerCase() === lower)
    },
    clear() {
      sent.length = 0
    },
    failNext(n) {
      failures = n
    },
  }
}

/** ¿Está la dirección en la lista blanca? Elementos: direcciones completas o `@dominio`. */
export function isAllowedRecipient(address: string, allowlist: readonly string[]): boolean {
  const lower = address.toLowerCase()
  return allowlist.some((item) => {
    const entry = item.toLowerCase()
    return entry.startsWith('@') ? lower.endsWith(entry) : lower === entry
  })
}

/** En la preview, solo la lista blanca (§4.19.1): el resto lanza `RecipientNotAllowedError`. */
export function withAllowlist(mailer: Mailer, allowlist: readonly string[]): Mailer {
  return {
    kind: mailer.kind,
    async send(email) {
      if (!isAllowedRecipient(email.to, allowlist)) throw new RecipientNotAllowedError()
      return mailer.send(email)
    },
    close: () => mailer.close(),
  }
}
