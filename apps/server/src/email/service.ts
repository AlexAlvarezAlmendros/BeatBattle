import { runBatch } from '../db/batch'
import type { EmailKind } from './catalog'
import { type DrainDeps, type EmailTarget, emailDrain, enqueueEmail } from './outbox'

export interface ServiceEmailInput {
  kind: EmailKind
  target: EmailTarget
  payload: Record<string, unknown>
  /** Por defecto, una por envío (verificaciones y recuperaciones se pueden pedir otra vez). */
  idempotencyKey?: string
}

export interface ServiceEmails {
  /**
   * Encola un email de servicio y lo intenta enviar en la misma petición (§4.19.3). Si el envío falla,
   * queda en la cola y lo reintenta el `tick`: la operación que lo provocó no se pierde.
   */
  sendNow(input: ServiceEmailInput): Promise<void>
}

/**
 * Emails de servicio que no van en el `batch` de otro hecho de la app: los que dispara Better Auth
 * (verificación, recuperación) después de escribir sus propias tablas.
 */
export function createServiceEmails(deps: DrainDeps & { newId: () => string }): ServiceEmails {
  return {
    async sendNow(input) {
      const id = deps.newId()
      await runBatch(deps.db, [
        enqueueEmail(deps.db, {
          id,
          kind: input.kind,
          target: input.target,
          idempotencyKey: input.idempotencyKey ?? `${input.kind}:${id}`,
          payload: input.payload,
          now: deps.now(),
        }),
      ])
      await emailDrain(deps, { only: [id] })
    },
  }
}
