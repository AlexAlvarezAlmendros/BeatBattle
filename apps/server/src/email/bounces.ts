import { sql } from 'drizzle-orm'
import { ImapFlow } from 'imapflow'
import type { Db } from '../db/client'
import { emailStat, emailSuppression } from '../db/schema'
import { emailHash } from './outbox'

/**
 * Rebotes (guía §4.19.2, `RF-NOTIF-10`, tarea 2.11). Gmail no informa de los fallos de entrega por una API:
 * los devuelve como emails al propio buzón («Mail Delivery Subsystem»). `bounceScan` los lee por IMAP, saca
 * el destinatario y, si el fallo es permanente (5.x.x), suprime la dirección (solo su hash); después mueve
 * el aviso a la etiqueta `beatbattle/rebotes` para no volver a leerlo. Los temporales (4.x.x) no suprimen.
 */

export interface Bounce {
  recipient: string
  /** 5.x.x: la dirección no existe o no acepta; 4.x.x: problema temporal (buzón lleno, servidor caído). */
  permanent: boolean
  status: string | null
}

const EMAIL = /[^\s<>"';,]+@[^\s<>"';,]+\.[A-Za-z]{2,}/

/**
 * Lee un aviso de rebote (el mensaje entero, en crudo). Mira primero el informe de entrega (RFC 3464:
 * `Final-Recipient`, `Action`, `Status`) y, si no lo hay, la cabecera `X-Failed-Recipients` de Gmail.
 * Devuelve `null` si no es un rebote.
 */
export function parseBounce(raw: string): Bounce | null {
  const text = raw.replace(/\r\n/g, '\n')
  const finalRecipient = text.match(/^Final-Recipient:\s*rfc822;\s*(.+)$/im)?.[1]?.match(EMAIL)?.[0]
  const status = text.match(/^Status:\s*([245]\.\d{1,3}\.\d{1,3})/im)?.[1] ?? null
  const action = text.match(/^Action:\s*(\w+)/im)?.[1]?.toLowerCase() ?? null
  const failedHeader = text.match(/^X-Failed-Recipients:\s*(.+)$/im)?.[1]?.match(EMAIL)?.[0]
  const recipient = finalRecipient ?? failedHeader
  if (!recipient) return null
  // Sin informe de entrega, `X-Failed-Recipients` solo lo pone Gmail en los fallos definitivos.
  const permanent = status ? status.startsWith('5') && action !== 'delayed' : Boolean(failedHeader)
  return { recipient: recipient.toLowerCase(), permanent, status }
}

/** Lo que `bounceScan` necesita del buzón (lo cumple `imapflow`, y un falso en los tests). */
export interface BounceMailbox {
  /** Avisos de rebote sin procesar de la bandeja de entrada: `uid` y el mensaje en crudo. */
  pending(): Promise<{ uid: number; raw: string }[]>
  /** Los saca de la bandeja de entrada a la etiqueta de rebotes. */
  archive(uids: number[]): Promise<void>
  close(): Promise<void>
}

export const BOUNCES_LABEL = 'beatbattle/rebotes'

export interface BounceScanResult {
  read: number
  suppressed: number
  temporary: number
  ignored: number
}

export async function bounceScan(deps: {
  db: Db
  mailbox: BounceMailbox
  now: number
}): Promise<BounceScanResult> {
  const result: BounceScanResult = { read: 0, suppressed: 0, temporary: 0, ignored: 0 }
  const messages = await deps.mailbox.pending()
  const done: number[] = []
  for (const { uid, raw } of messages) {
    result.read += 1
    const bounce = parseBounce(raw)
    done.push(uid)
    if (!bounce) {
      result.ignored += 1
      continue
    }
    if (!bounce.permanent) {
      result.temporary += 1
      continue
    }
    await deps.db
      .insert(emailSuppression)
      .values({ emailHash: emailHash(bounce.recipient), reason: 'hard_bounce', createdAt: deps.now })
      .onConflictDoNothing()
    await deps.db
      .insert(emailStat)
      .values({
        scope: 'all',
        day: new Date(deps.now).toISOString().slice(0, 10),
        metric: 'bounced',
        count: 1,
      })
      .onConflictDoUpdate({
        target: [emailStat.scope, emailStat.day, emailStat.metric],
        set: { count: sql`${emailStat.count} + 1` },
      })
    result.suppressed += 1
  }
  if (done.length > 0) await deps.mailbox.archive(done)
  return result
}

/**
 * El buzón de Google por IMAP (`imap.gmail.com:993`, TLS verificado, la misma contraseña de aplicación que
 * el envío). Solo los avisos del «Mail Delivery Subsystem» sin leer de la bandeja de entrada.
 */
export async function openGoogleBounceMailbox(options: {
  user: string
  pass: string
}): Promise<BounceMailbox> {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: options.user, pass: options.pass },
    logger: false,
  })
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  return {
    async pending() {
      const uids = (await client.search({ seen: false, from: 'mailer-daemon' }, { uid: true })) || []
      const out: { uid: number; raw: string }[] = []
      for (const uid of uids.slice(0, 200)) {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true })
        if (message && message.source) out.push({ uid, raw: message.source.toString('utf8') })
      }
      return out
    },
    async archive(uids) {
      await client.mailboxCreate(BOUNCES_LABEL).catch(() => undefined)
      await client.messageMove(uids.join(','), BOUNCES_LABEL, { uid: true })
    },
    async close() {
      lock.release()
      await client.logout()
    },
  }
}
