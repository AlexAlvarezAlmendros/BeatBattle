import type { MailConfig } from '../config/env'
import {
  createMemoryMailer,
  createSmtpMailer,
  createWorkspaceMailer,
  type Mailer,
  withAllowlist,
} from './mailer'

export * from './mailer'

/**
 * El transporte que toca según la configuración (§4.19.1). `null` sin transporte: la cola guarda los
 * emails (`queued`) y nadie los envía hasta que haya uno (en local, `pnpm mail:dev` con `SMTP_URL`).
 */
export function createMailer(config: MailConfig): Mailer | null {
  let mailer: Mailer | null
  switch (config.transport) {
    case 'memory':
      mailer = createMemoryMailer(config.sender)
      break
    case 'workspace':
      mailer = config.workspace ? createWorkspaceMailer({ ...config.workspace, sender: config.sender }) : null
      break
    case 'smtp':
      mailer = config.smtpUrl ? createSmtpMailer(config.smtpUrl, config.sender) : null
      break
    default:
      mailer = null
  }
  // En la preview, solo la lista blanca: nunca direcciones reales (§4.19.1).
  return mailer && config.previewAllowlist ? withAllowlist(mailer, config.previewAllowlist) : mailer
}
