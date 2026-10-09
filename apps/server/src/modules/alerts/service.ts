import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull, lte, sql } from 'drizzle-orm'
import { isDisposableEmail } from '../../auth/disposable'
import { runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { emailSubscriber, emailSuppression, user } from '../../db/schema'
import { emailHash } from '../../email/outbox'
import type { ServiceEmails } from '../../email/service'
import { appError } from '../../lib/errors'

/**
 * Alerta de drop sin cuenta (§2.12.3, `RF-NOTIF-09`; tarea 3.13): solo con el email y con doble
 * confirmación (`alert.confirm`). Sin confirmar en 7 días, se borra (`cleanup` del `tick`). Si después se
 * crea una cuenta con el mismo email, la suscripción se fusiona con ella (`mergeAlertSubscription`) y los
 * avisos le llegan como cuenta, con sus preferencias.
 *
 * Nunca dice si una dirección ya está: la respuesta es la misma para una nueva, una suscrita, una cuenta o
 * una suprimida (sin enumeración de cuentas).
 */

/** Plazo para confirmar (§2.12.3). */
export const ALERT_CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export interface AlertsDeps {
  db: Db
  emails: ServiceEmails
  publicUrl: string
  newId: () => string
}

export function createAlertsService(deps: AlertsDeps) {
  const { db } = deps
  return {
    /** Pide la alerta; si toca, manda `alert.confirm`. Siempre responde lo mismo. */
    async subscribe(rawEmail: string, now: number): Promise<void> {
      const address = rawEmail.trim().toLowerCase()
      if (isDisposableEmail(address)) return
      const [account] = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.email}) = ${address}`)
      if (account) return
      const [suppressed] = await db
        .select({ hash: emailSuppression.emailHash })
        .from(emailSuppression)
        .where(eq(emailSuppression.emailHash, emailHash(address)))
      if (suppressed) return
      const [existing] = await db
        .select()
        .from(emailSubscriber)
        .where(sql`lower(${emailSubscriber.email}) = ${address}`)
      if (existing?.status === 'confirmed' && existing.mergedUserId === null) return

      const token = randomBytes(32).toString('base64url')
      const id = existing?.id ?? deps.newId()
      const write = existing
        ? db
            .update(emailSubscriber)
            .set({ status: 'pending', confirmTokenHash: tokenHash(token), createdAt: now, confirmedAt: null })
            .where(eq(emailSubscriber.id, id))
        : db.insert(emailSubscriber).values({
            id,
            email: address,
            status: 'pending',
            confirmTokenHash: tokenHash(token),
            createdAt: now,
          })
      const mail = deps.emails.prepare({
        kind: 'alert.confirm',
        target: { address },
        payload: { confirmUrl: `${deps.publicUrl}/alerta?token=${token}` },
      })
      await runBatch(db, [write, mail.statement])
      await deps.emails.flush([mail.id])
    },

    /** Confirma con el token del email. Repetirlo no cambia nada; caducado o inválido, 404. */
    async confirm(token: string, now: number): Promise<void> {
      const [row] = await db
        .select()
        .from(emailSubscriber)
        .where(eq(emailSubscriber.confirmTokenHash, tokenHash(token)))
      if (!row || row.status === 'unsubscribed')
        throw appError('NOT_FOUND', 'El enlace de confirmación no es válido o ha caducado.')
      if (row.status === 'confirmed') return
      if (row.createdAt + ALERT_CONFIRM_TTL_MS <= now)
        throw appError('NOT_FOUND', 'El enlace de confirmación no es válido o ha caducado.')
      await db
        .update(emailSubscriber)
        .set({ status: 'confirmed', confirmedAt: now })
        .where(eq(emailSubscriber.id, row.id))
    },

    /** Borra las suscripciones sin confirmar de más de 7 días (`cleanup`). */
    async purgeUnconfirmed(now: number): Promise<number> {
      const removed = await db
        .delete(emailSubscriber)
        .where(
          and(
            eq(emailSubscriber.status, 'pending'),
            lte(emailSubscriber.createdAt, now - ALERT_CONFIRM_TTL_MS),
          ),
        )
        .returning({ id: emailSubscriber.id })
      return removed.length
    },
  }
}

export type AlertsService = ReturnType<typeof createAlertsService>

/**
 * Fusión al registrarse (§2.12.3): con el email ya verificado de una cuenta, la suscripción con esa
 * dirección pasa a ser suya. Desde entonces el aviso le llega como cuenta (con sus preferencias de
 * Ajustes → Emails) y nunca dos veces. Idempotente.
 */
export async function mergeAlertSubscription(db: Db, userId: string, email: string): Promise<void> {
  await db
    .update(emailSubscriber)
    .set({ mergedUserId: userId })
    .where(
      and(
        sql`lower(${emailSubscriber.email}) = ${email.trim().toLowerCase()}`,
        isNull(emailSubscriber.mergedUserId),
      ),
    )
}
