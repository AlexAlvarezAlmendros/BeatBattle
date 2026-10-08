import { type ActiveSession, ActiveSessionListSchema } from '@beatbattle/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import { DATE_FORMATS, formatDate, t } from '../../i18n'
import { apiFetch } from '../../net/api'
import { Button } from '../../ui/Button'
import { Tag } from '../../ui/Tag'
import { authClient } from '../account/authClient'
import { Done, PaperNotice } from '../account/FormBits'
import { RequireSession } from '../account/RequireSession'
import { SettingsGroup, SettingsSection, SettingsStatus } from './SettingsSection'
import styles from './SettingsSection.module.css'

const SESSIONS_KEY = ['me', 'sessions'] as const
const ClosedSchema = z.object({ closed: z.literal(true) })

/**
 * `/ajustes/sesiones` (guía §2.3, `RF-AUTH-10`, tarea 2.20): dónde está abierta la cuenta (navegador
 * resumido y última actividad, la actual primero), cerrar una y «Cerrar las demás», que avisa por email.
 */
export function SessionsSettingsPage() {
  return (
    <SettingsSection section="sessions" summary={t('settings.sessions.summary')}>
      <RequireSession reason={t('settings.sessions.require')}>
        <SessionList />
      </RequireSession>
    </SettingsSection>
  )
}

const deviceOf = (session: ActiveSession) => session.device ?? t('settings.sessions.unknownDevice')

function SessionList() {
  const client = useQueryClient()
  const [done, setDone] = useState<string | null>(null)
  const sessions = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: ({ signal }) => apiFetch('/api/me/sessions', { schema: ActiveSessionListSchema, signal }),
  })
  const refresh = () => client.invalidateQueries({ queryKey: SESSIONS_KEY })
  const closeOne = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', schema: ClosedSchema }),
    onSuccess: () => setDone(t('settings.sessions.closed')),
    onSettled: refresh,
  })
  const closeOthers = useMutation({
    mutationFn: async () => {
      const result = await authClient.revokeOtherSessions()
      if (result.error) throw new Error(result.error.message ?? 'revoke-other-sessions')
    },
    onSuccess: () => setDone(t('settings.sessions.closedOthers')),
    onSettled: refresh,
  })

  if (sessions.isPending) return <SettingsStatus busy>{t('account.require.loading')}</SettingsStatus>
  if (sessions.isError)
    return (
      <PaperNotice
        action={
          <Button variant="outline" size="sm" onClick={() => void sessions.refetch()}>
            {t('settings.sessions.retry')}
          </Button>
        }
      >
        {t('settings.sessions.loadError')}
      </PaperNotice>
    )
  const others = sessions.data.filter((session) => !session.current)
  return (
    <>
      <SettingsGroup
        title={t('settings.sessions.listTitle')}
        help={t('settings.sessions.activityNote')}
        layout="stack"
      >
        <ul className={styles.sessions} aria-label={t('settings.sessions.listTitle')}>
          {sessions.data.map((session) => (
            <li key={session.id} className={styles.session} data-current={session.current || undefined}>
              <div className={styles.sessionBody}>
                <p className={styles.sessionDevice}>
                  {deviceOf(session)}
                  {session.current && <Tag tone="red">{t('settings.sessions.current')}</Tag>}
                </p>
                <p className={styles.sessionMeta}>
                  {t('settings.sessions.lastActive', {
                    date: formatDate(session.lastActiveAt, DATE_FORMATS.weekdayTime),
                  })}
                  {' · '}
                  {t('settings.sessions.opened', { date: formatDate(session.createdAt) })}
                </p>
              </div>
              {!session.current && (
                <Button
                  variant="outline"
                  size="sm"
                  loading={closeOne.isPending && closeOne.variables === session.id}
                  aria-label={t('settings.sessions.closeLabel', { device: deviceOf(session) })}
                  onClick={() => closeOne.mutate(session.id)}
                >
                  {t('settings.sessions.close')}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {others.length > 0 ? (
          <div className="settings-option">
            <Button variant="outline" loading={closeOthers.isPending} onClick={() => closeOthers.mutate()}>
              {t('settings.sessions.closeOthers')}
            </Button>
            <p className="settings-option-help">{t('settings.sessions.closeOthersHelp')}</p>
          </div>
        ) : (
          <p className="settings-option-help">{t('settings.sessions.alone')}</p>
        )}
      </SettingsGroup>
      {closeOne.isError || closeOthers.isError ? (
        <PaperNotice>{t('settings.sessions.actionError')}</PaperNotice>
      ) : (
        done && <Done>{done}</Done>
      )}
    </>
  )
}
