import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { z } from 'zod'
import { t } from '../../i18n'
import { apiFetch } from '../../net/api'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { Done, PaperNotice } from '../account/FormBits'
import { RequireSession } from '../account/RequireSession'
import { useSession } from '../account/session'
import { SettingsGroup, SettingsSection } from './SettingsSection'
import styles from './SettingsSection.module.css'

const DeletedSchema = z.object({ deleted: z.literal(true) })

/**
 * `/ajustes/privacidad` (guía §4.14, tarea 2.21): descargar los datos (`RF-PRF-05`) y borrar la cuenta con
 * confirmación escrita (`RF-PRF-04`). El borrado dice antes qué se va y qué se queda anonimizado.
 */
export function PrivacySettingsPage() {
  const [deleted, setDeleted] = useState(false)
  return (
    <SettingsSection section="privacy" summary={t('settings.privacy.summary')}>
      {deleted ? (
        <Done>{t('settings.privacy.delete.done')}</Done>
      ) : (
        <RequireSession reason={t('settings.privacy.require')}>
          <SettingsGroup
            title={t('settings.privacy.export.title')}
            help={t('settings.privacy.export.help')}
            layout="stack"
          >
            <Button href="/api/me/export" download variant="outline" className={styles.start}>
              {t('settings.privacy.export.download')}
            </Button>
          </SettingsGroup>
          <DeleteAccount onDeleted={() => setDeleted(true)} />
        </RequireSession>
      )}
    </SettingsSection>
  )
}

function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const client = useQueryClient()
  const username = useSession((state) => state.me?.username ?? '')
  const [confirm, setConfirm] = useState('')
  const [state, setState] = useState<'idle' | 'busy'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [mismatch, setMismatch] = useState(false)
  const matches = confirm.trim().toLowerCase() === username.toLowerCase() && username !== ''

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!matches) return setMismatch(true)
    setState('busy')
    try {
      await apiFetch('/api/me', {
        method: 'DELETE',
        body: { confirm: confirm.trim() },
        schema: DeletedSchema,
      })
      client.clear()
      useSession.getState().clear()
      onDeleted()
    } catch {
      setError(t('settings.privacy.delete.error'))
      setState('idle')
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <SettingsGroup title={t('settings.privacy.delete.title')} layout="stack">
        <p className="settings-option-help">{t('settings.privacy.delete.gone')}</p>
        <p className="settings-option-help">{t('settings.privacy.delete.kept')}</p>
        <TextField
          label={t('settings.privacy.delete.confirmLabel')}
          hint={t('settings.privacy.delete.confirmHint', { name: username })}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value)
            setMismatch(false)
          }}
          error={mismatch ? t('settings.privacy.delete.mismatch') : null}
        />
        {error && <PaperNotice>{error}</PaperNotice>}
        <Button type="submit" variant="cta" loading={state === 'busy'} disabled={!matches}>
          {t('settings.privacy.delete.submit')}
        </Button>
      </SettingsGroup>
    </form>
  )
}
