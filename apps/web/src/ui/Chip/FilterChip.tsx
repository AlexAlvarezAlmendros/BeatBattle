import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { t } from '../../i18n'
import { Cursor } from '../Cursor'
import { frameAttributes } from '../Frame'
import { cx, forceStateAttr, type InteractionState } from '../forceState'
import styles from './Chip.module.css'

export interface FilterChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onChange'> {
  label: ReactNode
  pressed: boolean
  onChange?: (pressed: boolean) => void
  /** Estado forzado para la galería. */
  state?: InteractionState
}

/**
 * Chip de filtro (guía §3.3): conmutador de 44 px con su estado en texto, «Solo sin votar [SÍ/NO]».
 * Activo: relleno `--bb-red` con texto negro (5,32:1). `aria-pressed`; el foco es el cursor de juego.
 * Deshabilitado, con `disabled` (no se puede cambiar ni enfocar).
 */
export function FilterChip({
  label,
  pressed,
  onChange,
  state,
  className,
  onClick,
  ...rest
}: FilterChipProps) {
  return (
    <button
      type="button"
      {...rest}
      {...frameAttributes({ cut: 'sm' })}
      data-cursor=""
      aria-pressed={pressed}
      className={cx(styles.filterChip, className)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) onChange?.(!pressed)
      }}
      {...forceStateAttr(state)}
    >
      <Cursor cut="sm" />
      <span>{label}</span>
      <span className={styles.yesNo} aria-hidden="true">
        <span data-on={pressed || undefined}>{t('ui.filterChip.yes')}</span>
        <span data-on={!pressed || undefined}>{t('ui.filterChip.no')}</span>
      </span>
    </button>
  )
}
