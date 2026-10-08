import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { z } from 'zod'
import { paths } from '../../app/paths'
import { ScreenPage } from '../../app/ScreenPage'
import { t } from '../../i18n'
import { apiFetch } from '../../net/api'
import { Frame } from '../../ui/Frame'
import { useIdleMenuKeys } from '../../ui/hooks/useIdleMenuKeys'
import { useRovingMenu } from '../../ui/hooks/useRovingMenu'
import { MenuPlate } from '../../ui/MenuPlate'
import styles from './UnsubscribePage.module.css'

const InfoSchema = z.object({ kind: z.string(), family: z.enum(['battle', 'marketing']), email: z.string() })
const DoneSchema = z.object({ scope: z.enum(['kind', 'all']) })

type State =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'ready'; kind: string; email: string }
  | { status: 'saving'; kind: string; email: string }
  | { status: 'done'; kind: string; scope: 'kind' | 'all' }
  | { status: 'error'; kind: string; email: string }

/** Nombre de un tipo de email para la página («Recordatorio para subir»): `battle.jury_call` → `battleJuryCall`. */
function kindLabel(kind: string): string {
  const key = kind.replace(/[._](\w)/g, (_, letter: string) => letter.toUpperCase())
  // biome-ignore lint/suspicious/noExplicitAny: los tipos que llegan los firma el servidor (catálogo de §2.12)
  return t(`email.kinds.${key}` as any)
}

const OPTIONS = ['kind', 'all'] as const

/**
 * `/baja?token=` (guía §2.12.4, §4.19.6, tarea 2.10): la página de baja del pie de cada aviso, sin pedir
 * sesión. Dice a quién (enmascarado) y de qué tipo, y deja elegir entre «Solo estos» y «Todo lo no
 * esencial», como un menú de juego (↑↓ e Intro). El efecto es inmediato (`RF-NOTIF-05`).
 */
export function UnsubscribePage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<State>(token ? { status: 'loading' } : { status: 'invalid' })
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!token) return
    let active = true
    apiFetch(`/api/unsubscribe?token=${encodeURIComponent(token)}`, { schema: InfoSchema })
      .then((info) => active && setState({ status: 'ready', kind: info.kind, email: info.email }))
      .catch(() => active && setState({ status: 'invalid' }))
    return () => {
      active = false
    }
  }, [token])

  const apply = async (scope: 'kind' | 'all') => {
    if (state.status !== 'ready' && state.status !== 'error') return
    const { kind, email } = state
    setState({ status: 'saving', kind, email })
    try {
      const done = await apiFetch('/api/unsubscribe', {
        method: 'POST',
        body: { token, scope },
        schema: DoneSchema,
      })
      setState({ status: 'done', kind, scope: done.scope })
    } catch {
      setState({ status: 'error', kind, email })
    }
  }

  const menu = useRovingMenu({
    count: OPTIONS.length,
    getLabel: (index) =>
      OPTIONS[index] === 'kind' ? t('pages.unsubscribe.onlyThis') : t('pages.unsubscribe.all'),
    isDisabled: () => state.status === 'saving',
    onActivate: (index) => void apply(OPTIONS[index] ?? 'kind'),
  })
  // Con el foco en ningún control (la página recién abierta desde el email), ↑↓ e Intro van al menú (§3.8.3).
  useIdleMenuKeys(menu, OPTIONS.length, listRef)
  const activeOption = OPTIONS[menu.activeIndex] ?? 'kind'

  const kind = 'kind' in state ? kindLabel(state.kind) : ''
  const choosing = state.status === 'ready' || state.status === 'saving' || state.status === 'error'
  return (
    <ScreenPage
      title={t('pages.unsubscribe.title')}
      kicker={t('frame.plates.emails')}
      summary={choosing ? t('pages.unsubscribe.summary') : undefined}
      backIsStart={state.status !== 'ready' && state.status !== 'error'}
    >
      <div className={styles.body} aria-busy={state.status === 'loading' || state.status === 'saving'}>
        {state.status === 'loading' && <p className={styles.note}>{t('pages.unsubscribe.loading')}</p>}
        {state.status === 'invalid' && (
          <p className={styles.note} role="alert">
            {t('pages.unsubscribe.invalid')}
          </p>
        )}
        {(state.status === 'ready' || state.status === 'saving' || state.status === 'error') && (
          <>
            <p className={styles.for}>{t('pages.unsubscribe.for', { email: state.email })}</p>
            <ul
              ref={listRef}
              {...menu.getContainerProps({ 'aria-label': t('pages.unsubscribe.menuTitle') })}
              className={styles.plates}
            >
              {OPTIONS.map((option, index) => (
                <li key={option} role="none">
                  <MenuPlate
                    index={index + 1}
                    label={option === 'kind' ? t('pages.unsubscribe.onlyThis') : t('pages.unsubscribe.all')}
                    extra={option === 'kind' ? kind : undefined}
                    itemProps={menu.getItemProps(index)}
                  />
                </li>
              ))}
            </ul>
            <Frame cut="base" className={styles.help}>
              <p aria-live="polite">
                {activeOption === 'kind'
                  ? t('pages.unsubscribe.onlyThisHelp', { kind })
                  : t('pages.unsubscribe.allHelp')}
              </p>
            </Frame>
            {state.status === 'error' && (
              <p className={styles.note} role="alert">
                {t('pages.unsubscribe.error')}
              </p>
            )}
          </>
        )}
        {state.status === 'done' && (
          <p className={styles.done} role="status">
            {state.scope === 'kind'
              ? t('pages.unsubscribe.doneThis', { kind })
              : t('pages.unsubscribe.doneAll')}
          </p>
        )}
        {state.status !== 'loading' && (
          <a className={styles.settings} href={paths.settings('emails')}>
            {t('pages.unsubscribe.settings')}
          </a>
        )}
      </div>
    </ScreenPage>
  )
}
