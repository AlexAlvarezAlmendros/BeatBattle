import {
  CONSENT_TEXT_VERSIONS,
  type EmailPrefs,
  EmailPrefsSchema,
  type EmailPrefsUpdate,
  NOTICE_KEYS,
} from '@beatbattle/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { t } from '../../i18n'
import { apiFetch } from '../../net/api'
import { Button } from '../../ui/Button'
import { FilterChip } from '../../ui/Chip'
import { PaperNotice } from '../account/FormBits'
import { RequireSession } from '../account/RequireSession'
import { SettingsGroup, SettingsSection, SettingsStatus } from './SettingsSection'

const PREFS_KEY = ['me', 'email-prefs'] as const

/**
 * `/ajustes/emails` (guía §2.12.4, tarea 2.16): un interruptor por aviso, el formato del lunes y los dos
 * permisos (marketing y la newsletter del sello), sobre `GET`/`PUT /api/me/email-prefs`. Cada cambio se
 * guarda al momento y se ve antes de que responda el servidor; si falla, vuelve atrás y lo dice.
 */
export function EmailSettingsPage() {
  return (
    <SettingsSection section="emails" summary={t('settings.emails.summary')}>
      <RequireSession reason={t('settings.emails.require')}>
        <EmailPrefsForm />
      </RequireSession>
    </SettingsSection>
  )
}

function EmailPrefsForm() {
  const client = useQueryClient()
  const prefs = useQuery({
    queryKey: PREFS_KEY,
    queryFn: ({ signal }) => apiFetch('/api/me/email-prefs', { schema: EmailPrefsSchema, signal }),
  })
  const save = useMutation({
    mutationFn: (patch: EmailPrefsUpdate) =>
      apiFetch('/api/me/email-prefs', { method: 'PUT', body: patch, schema: EmailPrefsSchema }),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: PREFS_KEY })
      const before = client.getQueryData<EmailPrefs>(PREFS_KEY)
      if (before) client.setQueryData<EmailPrefs>(PREFS_KEY, { ...before, ...patch })
      return { before }
    },
    onError: (_error, _patch, context) => {
      if (context?.before) client.setQueryData(PREFS_KEY, context.before)
    },
    onSuccess: (data) => client.setQueryData(PREFS_KEY, data),
  })

  if (prefs.isPending) return <SettingsStatus busy>{t('account.require.loading')}</SettingsStatus>
  if (prefs.isError)
    return (
      <PaperNotice
        action={
          <Button variant="outline" size="sm" onClick={() => void prefs.refetch()}>
            {t('settings.emails.retry')}
          </Button>
        }
      >
        {t('settings.emails.loadError')}
      </PaperNotice>
    )
  const value = prefs.data
  const set = (patch: EmailPrefsUpdate) => save.mutate(patch)
  return (
    <>
      <SettingsGroup
        title={t('settings.emails.notices.title')}
        help={t('settings.emails.notices.help')}
        layout="plates"
      >
        {NOTICE_KEYS.map((key) => (
          <FilterChip
            variant="plate"
            key={key}
            label={t(`account.notices.${key}`)}
            pressed={value[key]}
            onChange={(pressed) => set({ [key]: pressed })}
          />
        ))}
      </SettingsGroup>
      <SettingsGroup
        title={t('settings.emails.monday.title')}
        help={t('settings.emails.monday.help')}
        layout="plates"
      >
        <FilterChip
          variant="plate"
          label={t('settings.emails.monday.label')}
          pressed={value.mondayFormat === 'combined'}
          onChange={(pressed) => set({ mondayFormat: pressed ? 'combined' : 'separate' })}
        />
      </SettingsGroup>
      <SettingsGroup
        title={t('settings.emails.consents.title')}
        help={t('settings.emails.consents.help')}
        layout="plates"
      >
        <FilterChip
          variant="plate"
          label={t('account.consents.marketing')}
          pressed={value.marketing}
          onChange={(pressed) => set({ marketing: pressed })}
          data-consent-version={CONSENT_TEXT_VERSIONS.marketing}
        />
        <FilterChip
          variant="plate"
          label={t('account.consents.otpNewsletter')}
          pressed={value.otpNewsletter}
          onChange={(pressed) => set({ otpNewsletter: pressed })}
          data-consent-version={CONSENT_TEXT_VERSIONS.otp_newsletter}
        />
      </SettingsGroup>
      <p className="settings-option-help">{t('settings.emails.rules')}</p>
      {save.isError ? (
        <PaperNotice>{t('settings.emails.saveError')}</PaperNotice>
      ) : (
        <SettingsStatus>
          {save.isPending ? t('settings.emails.saving') : save.isSuccess ? t('settings.emails.saved') : ''}
        </SettingsStatus>
      )}
    </>
  )
}
