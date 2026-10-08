import { type DataEnvelope, type EmailPrefs, EmailPrefsUpdateSchema } from '@beatbattle/shared'
import type { FastifyInstance } from 'fastify'
import { requireSession } from '../../auth/guards'
import type { Db } from '../../db/client'
import { ipHash } from '../../lib/ipHash'
import { getEmailPrefs, updateEmailPrefs } from './service'

export interface EmailPrefsDeps {
  db: Db
  secret: string
  newId: () => string
}

/** Ajustes → Emails (§2.12.4, tarea 2.12): leer y cambiar las preferencias propias. */
export function emailPrefsRoutes(app: FastifyInstance, deps: EmailPrefsDeps): void {
  app.get(
    '/api/me/email-prefs',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<EmailPrefs>> => {
      return { data: await getEmailPrefs(deps.db, req.user?.id as string) }
    },
  )

  app.put(
    '/api/me/email-prefs',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<EmailPrefs>> => {
      const patch = EmailPrefsUpdateSchema.parse(req.body)
      const data = await updateEmailPrefs(deps.db, req.user?.id as string, patch, {
        now: req.now,
        ipHash: ipHash(req.ip, deps.secret, req.now),
        newId: deps.newId,
        source: 'ajustes',
      })
      return { data }
    },
  )
}
