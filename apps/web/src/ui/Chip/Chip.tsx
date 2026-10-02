import type { ButtonHTMLAttributes, PointerEvent, ReactNode, Ref } from 'react'
import { cx, forceStateAttr, type InteractionState } from '../forceState'
import { Icon, type IconName } from '../Icon'
import styles from './Chip.module.css'

/** Variables CSS con el punto del clic, desde donde crece el relleno al activar (Anexo E). */
export const CHIP_ORIGIN_X_VAR = '--chip-x'
export const CHIP_ORIGIN_Y_VAR = '--chip-y'

export interface ChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-pressed'> {
  /** Activo: rojo de botón macizo con sombra roja, como los chips de género del sello. */
  selected?: boolean
  /** Se llama con el nuevo valor al pulsar (además de `onClick`). */
  onSelectedChange?: (selected: boolean) => void
  /** Estado de interacción forzado para la galería. */
  state?: InteractionState
  icon?: IconName
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
}

/**
 * Chip conmutable (§3.3): `<button aria-pressed>`. Al activarse, el relleno rojo crece desde el punto
 * del clic (o desde el centro con teclado); con «reducir movimiento», cambio de color sin más
 * (Anexo E). El área táctil llega a 44 px de alto sin cambiar el dibujo (RNF-A11Y-09).
 */
export function Chip({
  selected = false,
  onSelectedChange,
  state,
  icon,
  children,
  className,
  onClick,
  onPointerDown,
  type = 'button',
  ...rest
}: ChipProps) {
  const setOrigin = (event: PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(event)
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    event.currentTarget.style.setProperty(CHIP_ORIGIN_X_VAR, `${event.clientX - rect.left}px`)
    event.currentTarget.style.setProperty(CHIP_ORIGIN_Y_VAR, `${event.clientY - rect.top}px`)
  }

  return (
    <button
      {...rest}
      type={type}
      className={cx(styles.chip, className)}
      aria-pressed={selected}
      data-selected={selected || undefined}
      {...forceStateAttr(state)}
      onPointerDown={setOrigin}
      onKeyDown={(event) => {
        rest.onKeyDown?.(event)
        // Con teclado, el relleno crece desde el centro.
        event.currentTarget.style.removeProperty(CHIP_ORIGIN_X_VAR)
        event.currentTarget.style.removeProperty(CHIP_ORIGIN_Y_VAR)
      }}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) onSelectedChange?.(!selected)
      }}
    >
      {icon && <Icon name={icon} className={styles.icon} />}
      <span className={styles.label}>{children}</span>
    </button>
  )
}
