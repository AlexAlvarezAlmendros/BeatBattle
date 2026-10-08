import { type FormEvent, useState } from 'react'
import { paths } from '../../app/paths'
import { t } from '../../i18n'
import { Button } from '../../ui/Button'
import { FilterChip } from '../../ui/Chip'
import { TextField } from '../../ui/Field'
import { authClient } from '../account/authClient'
import { type Errors, placeError, textOf } from '../account/authErrors'
import { Done, PaperNotice, StrengthMeter } from '../account/FormBits'
import { RequireSession } from '../account/RequireSession'
import { useSession } from '../account/session'
import { SettingsGroup, SettingsSection } from './SettingsSection'
import styles from './SettingsSection.module.css'

/**
 * `/ajustes/cuenta` (guía §2.3, tarea 2.16): cambiar el email (se aprueba desde la dirección actual y
 * después se confirma la nueva) y la contraseña (con la actual y, por defecto, cerrando las demás
 * sesiones). Los dos avisan con `auth.security`. Google y Discord llegan con la 2.22.
 */
export function AccountSettingsPage() {
  return (
    <SettingsSection section="account" summary={t('settings.account.summary')}>
      <RequireSession reason={t('settings.account.require')}>
        <ChangeEmailForm />
        <ChangePasswordForm />
      </RequireSession>
    </SettingsSection>
  )
}

function ChangeEmailForm() {
  const current = useSession((state) => state.me?.email ?? '')
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [errors, setErrors] = useState<Errors>({})
  const [same, setSame] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setErrors({})
    setSame(false)
    const newEmail = email.trim()
    if (!newEmail.includes('@')) return setErrors({ email: 'INVALID_EMAIL' })
    if (newEmail.toLowerCase() === current.toLowerCase()) return setSame(true)
    setState('busy')
    const result = await authClient.changeEmail({ newEmail, callbackURL: paths.settings('cuenta') })
    if (result.error) {
      setErrors(placeError(result.error))
      setState('idle')
      return
    }
    setState('sent')
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <SettingsGroup title={t('settings.account.email.title')} layout="stack">
        <p className="settings-option-help">{t('settings.account.email.current', { email: current })}</p>
        {state === 'sent' ? (
          <Done>{t('settings.account.email.sent')}</Done>
        ) : (
          <>
            <TextField
              label={t('settings.account.email.newLabel')}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={same ? t('settings.account.email.same') : textOf(errors.email)}
            />
            {errors.form && <PaperNotice>{textOf(errors.form)}</PaperNotice>}
            <Button type="submit" variant="outline" loading={state === 'busy'}>
              {t('settings.account.email.submit')}
            </Button>
          </>
        )}
      </SettingsGroup>
    </form>
  )
}

function ChangePasswordForm() {
  const me = useSession((state) => state.me)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true)
  const [state, setState] = useState<'idle' | 'busy' | 'changed'>('idle')
  const [errors, setErrors] = useState<Errors>({})

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const local: Errors = {}
    if (!currentPassword) local.currentPassword = 'INVALID_PASSWORD'
    if (newPassword.length < 12) local.password = 'PASSWORD_TOO_SHORT'
    setErrors(local)
    if (Object.keys(local).length > 0) return
    setState('busy')
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions })
    if (result.error) {
      setErrors(placeError(result.error))
      setState('idle')
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setState('changed')
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <SettingsGroup title={t('settings.account.password.title')} layout="stack">
        {state === 'changed' && <Done>{t('settings.account.password.changed')}</Done>}
        <TextField
          label={t('settings.account.password.current')}
          type="password"
          revealable
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          error={textOf(errors.currentPassword)}
        />
        <TextField
          label={t('account.fields.newPassword')}
          type="password"
          revealable
          autoComplete="new-password"
          hint={t('account.signUp.passwordHint')}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={textOf(errors.password)}
          below={<StrengthMeter password={newPassword} userInputs={me ? [me.email, me.username] : []} />}
        />
        <div className="settings-option">
          <FilterChip
            label={t('settings.account.password.closeOthers')}
            pressed={revokeOtherSessions}
            onChange={setRevokeOtherSessions}
          />
          <p className="settings-option-help">{t('settings.account.password.closeOthersHelp')}</p>
        </div>
        {errors.form && <PaperNotice>{textOf(errors.form)}</PaperNotice>}
        <Button type="submit" variant="outline" loading={state === 'busy'}>
          {t('settings.account.password.submit')}
        </Button>
      </SettingsGroup>
    </form>
  )
}
