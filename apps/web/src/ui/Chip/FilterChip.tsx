import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { audio } from '../../audio/engine'
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
  /**
   * `plate`: placa de opción a todo el ancho de su celda, con el nombre a la izquierda y «SÍ | NO» a la
   * derecha, como una opción de menú de juego. Encendida, solo la casilla «SÍ» va en rojo (no la placa
   * entera): en listas largas de conmutadores, nueve placas rojas se leían como nueve cursores (§3.3).
   */
  variant?: 'chip' | 'plate'
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
  variant = 'chip',
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
      className={cx(styles.filterChip, variant === 'plate' && styles.plate, className)}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        // Conmutador (Anexo E): `ui.toggle`.
        audio.play('ui.toggle')
        onChange?.(!pressed)
      }}
      onPointerEnter={(event) => {
        rest.onPointerEnter?.(event)
        if (event.pointerType === 'mouse') audio.play('ui.hover')
      }}
      {...forceStateAttr(state)}
    >
      <Cursor cut="sm" />
      <span className={styles.label}>{label}</span>
      <span className={styles.yesNo} aria-hidden="true">
        <span data-on={pressed || undefined}>{t('ui.filterChip.yes')}</span>
        <span data-on={!pressed || undefined}>{t('ui.filterChip.no')}</span>
      </span>
    </button>
  )
}
