import { t } from '../../i18n'
import { Button } from '../Button'
import { cx, forceStateAttr } from '../forceState'
import { Icon, type IconName } from '../Icon'
import styles from './Toast.module.css'
import type { ToastData, ToastTone } from './useToasts'

const TONE_ICON: Record<ToastTone, IconName> = { info: 'info', success: 'check', error: 'alert' }

export type ToastState = 'rest' | 'hover' | 'focus'

export interface ToastProps {
  toast: Pick<ToastData, 'tone' | 'title' | 'message'>
  /** Botón de cerrar (con su `aria-label`). */
  onDismiss?: () => void
  /** Estado forzado para la galería. */
  state?: ToastState
  className?: string
}

/**
 * La pieza visible de un aviso: icono del tono (con nombre para lectores de pantalla: el error nunca
 * es solo color), título, mensaje y botón de cerrar. `ToastViewport` la anima y le pone el
 * temporizador; la galería la enseña quieta.
 */
export function Toast({ toast, onDismiss, state, className }: ToastProps) {
  return (
    <div className={cx(styles.toast, className)} data-tone={toast.tone} {...forceStateAttr(state)}>
      <Icon name={TONE_ICON[toast.tone]} label={t(`ui.toast.tone.${toast.tone}`)} className={styles.icon} />
      <div className={styles.text}>
        <p className={styles.title}>{toast.title}</p>
        {toast.message && <p className={styles.message}>{toast.message}</p>}
      </div>
      {onDismiss && (
        <Button
          variant="icon"
          size="sm"
          icon="close"
          aria-label={t('ui.toast.close')}
          onClick={onDismiss}
          state={state === 'focus' ? 'focus' : undefined}
          className={styles.close}
        />
      )}
    </div>
  )
}
