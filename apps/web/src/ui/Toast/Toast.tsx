import { t } from '../../i18n'
import { Button } from '../Button'
import { frameAttributes } from '../Frame'
import { cx, forceStateAttr } from '../forceState'
import { Icon, type IconName } from '../Icon'
import styles from './Toast.module.css'
import type { ToastData, ToastTone } from './useToasts'

const TONE_ICON: Record<ToastTone, IconName> = { info: 'info', success: 'check', error: 'alert' }

/** Estados forzables para la galería; `pressed` es el del botón de cerrar. */
export type ToastState = 'rest' | 'hover' | 'focus' | 'pressed'

export interface ToastProps {
  toast: Pick<ToastData, 'tone' | 'title' | 'message'>
  /** Botón de cerrar (con su `aria-label`). */
  onDismiss?: () => void
  /** Estado forzado para la galería. */
  state?: ToastState
  className?: string
}

/**
 * La pieza visible de un aviso (guía §3.3): panel opaco con marco de chaflán, icono del tono (con
 * nombre: el error nunca es solo color), título, mensaje y botón de cerrar. El de error es **de papel**
 * (blanco con texto negro, 21:1; §3.2 «Estados»). `ToastList` la anima y le pone el temporizador; la
 * galería la enseña quieta.
 */
export function Toast({ toast, onDismiss, state, className }: ToastProps) {
  return (
    <div
      {...frameAttributes({ cut: 'base' })}
      className={cx(styles.toast, className)}
      data-tone={toast.tone}
      {...forceStateAttr(state === 'pressed' ? undefined : state)}
    >
      <Icon name={TONE_ICON[toast.tone]} label={t(`ui.toast.tone.${toast.tone}`)} className={styles.icon} />
      <div className={styles.text}>
        <p className={styles.title}>{toast.title}</p>
        {toast.message && <p className={styles.message}>{toast.message}</p>}
      </div>
      {onDismiss && (
        <Button
          variant={toast.tone === 'error' ? 'white' : 'outline'}
          size="sm"
          iconOnly
          icon="close"
          aria-label={t('ui.toast.close')}
          onClick={onDismiss}
          state={state === 'focus' || state === 'pressed' ? state : undefined}
          className={styles.close}
        />
      )}
    </div>
  )
}
