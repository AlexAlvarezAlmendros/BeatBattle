import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { paths } from '../../app/paths'
import { t } from '../../i18n'
import { Button } from '../../ui/Button'
import styles from './RequireSession.module.css'
import { useSession } from './session'

/**
 * Lo que necesita sesión (guía §2.18 «Acceso», tarea 2.15) se pide **dentro del panel** de la pantalla: sin
 * sesión, «Entra para…» con el botón de entrar (que vuelve aquí con `?next=`), y la pantalla conserva su
 * título y su marco. La protección de verdad es la del servidor (`requireSession`, `requireVerified`): esto
 * solo evita enseñar un formulario que no se puede usar.
 */
export function RequireSession({ reason, children }: { reason: string; children: ReactNode }) {
  const status = useSession((state) => state.status)
  const location = useLocation()
  if (status === 'signedIn') return <>{children}</>
  if (status === 'loading')
    return (
      <p className={styles.note} aria-busy="true">
        {t('account.require.loading')}
      </p>
    )
  const next = encodeURIComponent(location.pathname + location.search)
  return (
    <div className={styles.box}>
      <p className={styles.lead}>{reason}</p>
      <Button to={`${paths.signIn()}?next=${next}`} fullWidth keyHint={t('frame.keys.glyph.enter')}>
        {t('account.signIn.submit')}
      </Button>
      <Button to={paths.signUp()} variant="outline" fullWidth>
        {t('account.signIn.create')}
      </Button>
    </div>
  )
}
