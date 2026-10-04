import type { KeyboardEvent } from 'react'
import { listNavigation, type Orientation } from './roving'
import {
  type GroupLabel,
  type ItemHandlers,
  type MoveOptions,
  type RovingItemBaseProps,
  useRovingCore,
} from './useRoving'

export interface RovingMenuOptions {
  /** Número de opciones. */
  count: number
  /** Opción elegida al entrar (por defecto, la primera habilitada: §3.8.3). */
  initialIndex?: number
  /** ↑/↓ dan la vuelta (por defecto, sí). */
  loop?: boolean
  /** Vertical (por defecto: la lista de modos) u horizontal (una fila de botones). */
  orientation?: Orientation
  /** Enfoca la opción elegida al montar. */
  autoFocus?: boolean
  /** El ratón mueve el cursor (por defecto, sí). */
  hoverMoves?: boolean
  isDisabled?: (index: number) => boolean
  /** Etiqueta para la letra inicial (si falta, el texto de la opción). */
  getLabel?: (index: number) => string
  onMove?: (index: number) => void
  onActivate?: (index: number) => void
}

export interface RovingMenuContainerProps extends GroupLabel {
  role: 'menu'
  'aria-orientation': Orientation
  'data-cursor-group': ''
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

export interface RovingMenuItemProps<E extends HTMLElement> extends RovingItemBaseProps<E> {
  role: 'menuitem'
}

export interface RovingMenu {
  /** Opción elegida (la que tiene el cursor). */
  activeIndex: number
  /** Lleva el cursor a una opción (y el foco, salvo `{ focus: false }`). */
  moveTo: (index: number, options?: MoveOptions) => void
  /** Props del contenedor (`role="menu"`), con su nombre accesible. */
  getContainerProps: (label?: GroupLabel) => RovingMenuContainerProps
  /** Props de cada opción (`role="menuitem"`), con sus manejadores encadenados. */
  getItemProps: <E extends HTMLElement = HTMLElement>(
    index: number,
    handlers?: ItemHandlers<E>,
  ) => RovingMenuItemProps<E>
}

/**
 * Menú de juego en lista (guía §3.3, §3.8.3; RD-MOT-05): la lista de modos de la home. Una sola parada
 * de tabulación; ↑/↓ mueven el cursor en bucle, Inicio/Fin van a la primera y la última, la letra
 * inicial salta a la siguiente opción que empieza por ella, Intro (o espacio, clic o toque) entra y el
 * ratón mueve el cursor al pasar por encima. Esc (volver) es cosa de la pantalla.
 *
 * ```tsx
 * const menu = useRovingMenu({ count: modes.length, autoFocus: true, onActivate: (i) => go(modes[i]) })
 * <ul {...menu.getContainerProps({ 'aria-label': t('home.modes.title') })}>
 *   {modes.map((mode, i) => (
 *     <li key={mode.id} role="none">
 *       <a href={mode.href} {...menu.getItemProps(i)}><Cursor shape="slant" player />…</a>
 *     </li>
 *   ))}
 * </ul>
 * ```
 *
 * Las teclas que el menú usa (flechas, Inicio, Fin, Intro, espacio y la letra que encuentra opción)
 * llegan a los manejadores globales con `defaultPrevented`: estos deben ignorarlas.
 */
export function useRovingMenu(options: RovingMenuOptions): RovingMenu {
  const { count, loop = true, orientation = 'vertical', isDisabled } = options
  const firstEnabled = (() => {
    for (let index = 0; index < count; index += 1) if (!isDisabled?.(index)) return index
    return 0
  })()
  const core = useRovingCore<HTMLElement>({
    ...options,
    initialIndex: options.initialIndex ?? firstEnabled,
    typeahead: true,
    navigate: (key, index) => listNavigation(key, index, count, { loop, orientation }),
  })
  return {
    activeIndex: core.activeIndex,
    moveTo: core.moveTo,
    getContainerProps: (label = {}) => ({
      ...label,
      role: 'menu',
      'aria-orientation': orientation,
      'data-cursor-group': '',
      onKeyDown: core.onKeyDown,
    }),
    getItemProps: <E extends HTMLElement = HTMLElement>(index: number, handlers?: ItemHandlers<E>) => ({
      ...(core.getItemBaseProps(
        index,
        handlers as ItemHandlers<HTMLElement>,
      ) as unknown as RovingItemBaseProps<E>),
      role: 'menuitem' as const,
    }),
  }
}
