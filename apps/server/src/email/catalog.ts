import type { EmailFamily, emailPref } from '../db/schema'

/**
 * Catálogo de emails (guía §2.12): la familia de cada tipo, su prioridad y el interruptor de Ajustes →
 * Emails que lo apaga. La familia decide las reglas al enviar (§4.19.3):
 *
 * - **service**: sale siempre, aunque esté todo desactivado (`RF-NOTIF-04`) o la dirección esté
 *   suprimida (es lo estrictamente necesario: verificar, recuperar, seguridad, recibos…).
 * - **battle**: activos por defecto, con baja por tipo (`RF-NOTIF-01`, `-05`).
 * - **marketing**: solo con consentimiento registrado (`RF-NOTIF-01`).
 *
 * Prioridad: menor número, antes. El orden de los avisos es el de §2.12.4 (lunes > recordatorio > jurado >
 * primeros votos > progreso > temporada > marketing); el servicio va siempre delante.
 */

type PrefKey = keyof Omit<
  typeof emailPref.$inferSelect,
  'userId' | 'mondayFormat' | 'marketingOn' | 'updatedAt'
>

export interface KindInfo {
  family: EmailFamily
  priority: number
  /**
   * Interruptores de `email_pref` que lo dejan salir (basta uno: el lunes combinado sale si está activo el
   * drop **o** los resultados). Vacío en servicio y marketing (este va por consentimiento).
   */
  prefs: readonly PrefKey[]
}

const service = (priority = 0): KindInfo => ({ family: 'service', priority, prefs: [] })
const battle = (priority: number, ...prefs: PrefKey[]): KindInfo => ({ family: 'battle', priority, prefs })
const marketing: KindInfo = { family: 'marketing', priority: 90, prefs: [] }

export const EMAIL_CATALOG = {
  'auth.verify': service(),
  'auth.reset': service(),
  'auth.welcome': service(1),
  'auth.security': service(),
  'auth.change_email': service(),
  'alert.confirm': service(),
  'entry.receipt': service(),
  'entry.failed': service(),
  'entry.changed': service(),
  'mod.action': service(),
  'rules.changed': service(2),
  'account.deleted': service(),
  'battle.monday': battle(10, 'dropOn', 'resultsOn'),
  'battle.drop': battle(10, 'dropOn'),
  'battle.results': battle(10, 'resultsOn'),
  'battle.reminder': battle(20, 'reminderOn'),
  'battle.jury_call': battle(30, 'juryCallOn'),
  'battle.first_votes': battle(40, 'firstVotesOn'),
  'battle.label_pick': battle(45, 'labelPickOn'),
  'game.progress': battle(50, 'progressOn'),
  'season.wrap': battle(60, 'seasonOn'),
  'mkt.campaign': marketing,
  'mkt.reactivation': marketing,
} as const satisfies Record<string, KindInfo>

export type EmailKind = keyof typeof EMAIL_CATALOG
export const EMAIL_KINDS = Object.keys(EMAIL_CATALOG) as EmailKind[]

export const kindInfo = (kind: EmailKind): KindInfo => EMAIL_CATALOG[kind]
