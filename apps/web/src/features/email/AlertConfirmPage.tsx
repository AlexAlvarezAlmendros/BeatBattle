import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { paths } from '../../app/paths'
import { ScreenPage } from '../../app/ScreenPage'
import { t } from '../../i18n'
import { confirmDropAlert } from '../../net/weeks'
import { Button } from '../../ui/Button'
import { TitlePiece } from '../auth/TitlePiece'
import styles from './UnsubscribePage.module.css'

type State = 'ready' | 'saving' | 'done' | 'invalid' | 'error'

/**
 * `/alerta?token=` (§2.12.3, `RF-NOTIF-09`; tarea 3.15): la página del enlace de `alert.confirm`. Confirma
 * con un botón (un `POST`), no al abrirse: los escáneres de enlaces del correo abren las páginas y
 * confirmarían solos. Sin sesión. El botón recibe el foco: Intro confirma.
 */
export function AlertConfirmPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<State>(token.length >= 16 ? 'ready' : 'invalid')
  const doneRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (state === 'done' || state === 'invalid') doneRef.current?.focus()
  }, [state])

  const confirm = async () => {
    setState('saving')
    try {
      await confirmDropAlert(token)
      setState('done')
    } catch (error) {
      setState((error as { status?: number }).status === 404 ? 'invalid' : 'error')
    }
  }

  return (
    <ScreenPage
      title={t('pages.alert.title')}
      kicker={t('frame.plates.emails')}
      summary={
        state === 'ready' || state === 'saving' || state === 'error' ? t('pages.alert.summary') : undefined
      }
      backIsStart
      piece={<TitlePiece />}
      layout="title"
    >
      <div className={styles.body} aria-busy={state === 'saving'}>
        {(state === 'ready' || state === 'saving' || state === 'error') && (
          <>
            <Button
              autoFocus
              size="lg"
              variant="cta"
              loading={state === 'saving'}
              onClick={() => void confirm()}
              keyHint={t('frame.keys.glyph.enter')}
            >
              {t('pages.alert.confirm')}
            </Button>
            {state === 'error' && (
              <p className={styles.note} role="alert">
                {t('pages.alert.error')}
              </p>
            )}
          </>
        )}
        {state === 'done' && (
          <p ref={doneRef} className={styles.done} tabIndex={-1} data-focus-target="done">
            {t('pages.alert.done')}
          </p>
        )}
        {state === 'invalid' && (
          <p ref={doneRef} className={styles.note} tabIndex={-1} role="alert">
            {t('pages.alert.invalid')}
          </p>
        )}
        {(state === 'done' || state === 'invalid') && (
          <a className={styles.settings} href={state === 'done' ? paths.signUp() : paths.dropAlert()}>
            {state === 'done' ? t('pages.alert.signUp') : t('pages.alert.again')}
          </a>
        )}
      </div>
    </ScreenPage>
  )
}
