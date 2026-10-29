import { accountDeleted } from './accountDeleted'
import { adminCalendarGap } from './adminCalendarGap'
import { alertConfirm } from './alertConfirm'
import { authChangeEmail } from './authChangeEmail'
import { authReset } from './authReset'
import { authSecurity } from './authSecurity'
import { authVerify } from './authVerify'
import { authWelcome } from './authWelcome'
import { battleDrop } from './battleDrop'
import { battleFirstVotes } from './battleFirstVotes'
import { battleJuryCall } from './battleJuryCall'
import { battleMonday } from './battleMonday'
import { battleReminder } from './battleReminder'
import { battleResults } from './battleResults'
import { entryChanged } from './entryChanged'
import { entryFailed } from './entryFailed'
import { entryReceipt } from './entryReceipt'
import { gameProgress } from './gameProgress'

export type { AccountDeletedPayload } from './accountDeleted'
export type { AdminCalendarGapPayload } from './adminCalendarGap'
export type { AlertConfirmPayload } from './alertConfirm'
export type { AuthChangeEmailPayload } from './authChangeEmail'
export type { AuthResetPayload } from './authReset'
export type { AuthSecurityPayload, SecurityChange } from './authSecurity'
export type { AuthVerifyPayload } from './authVerify'
export type { AuthWelcomePayload } from './authWelcome'
export type { BattleDropPayload } from './battleDrop'
export type { BattleFirstVotesPayload } from './battleFirstVotes'
export type { BattleJuryCallPayload } from './battleJuryCall'
export type { BattleMondayPayload } from './battleMonday'
export type { BattleReminderPayload } from './battleReminder'
export type { BattleResultsPayload } from './battleResults'
export type { EntryChangedPayload, EntryReplacedPayload, EntryWithdrawnPayload } from './entryChanged'
export type { EntryFailedPayload } from './entryFailed'
export type { EntryReceiptPayload } from './entryReceipt'
export type { GameProgressPayload } from './gameProgress'
export type { ResultsBlock, ResultsGame } from './results'

/** Plantillas por id del catálogo (§2.12). Cada fase añade las suyas. */
export const TEMPLATES = {
  'auth.verify': authVerify,
  'auth.reset': authReset,
  'auth.welcome': authWelcome,
  'auth.security': authSecurity,
  'auth.change_email': authChangeEmail,
  'account.deleted': accountDeleted,
  'admin.calendar_gap': adminCalendarGap,
  'alert.confirm': alertConfirm,
  'battle.monday': battleMonday,
  'battle.drop': battleDrop,
  'battle.results': battleResults,
  'battle.reminder': battleReminder,
  'battle.jury_call': battleJuryCall,
  'battle.first_votes': battleFirstVotes,
  'entry.receipt': entryReceipt,
  'entry.failed': entryFailed,
  'entry.changed': entryChanged,
  'game.progress': gameProgress,
} as const

export type TemplateKind = keyof typeof TEMPLATES
