import type { KeyboardEvent } from 'react'
import { gridNavigation } from './roving'
import {
  type GroupLabel,
  type ItemHandlers,
  type MoveOptions,
  type RovingItemBaseProps,
  useRovingCore,
} from './useRoving'

export interface RovingGridOptions {
  /** Número de casillas. */
  count: number
  /** Columnas de la rejilla tal como se pinta (6 en escritorio, 3 en móvil: §3.8.13). */
  columns: number
  /** Casilla elegida al entrar (por defecto, la primera). */
  initialIndex?: number
  /** Las flechas dan la vuelta (por defecto, sí). */
  loop?: boolean
  /** Filas que saltan RePág/AvPág (por defecto, 4). */
  pageRows?: number
  autoFocus?: boolean
  /** El ratón mueve el cursor (por defecto, sí). */
  hoverMoves?: boolean
  isDisabled?: (index: number) => boolean
  onMove?: (index: number) => void
  onActivate?: (index: number) => void
}

export interface RovingGridContainerProps extends GroupLabel {
  role: 'listbox'
  'data-cursor-group': ''
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

export interface RovingGridItemProps<E extends HTMLElement> extends RovingItemBaseProps<E> {
  role: 'option'
  'aria-selected': boolean
}

export interface RovingGrid {
  activeIndex: number
  moveTo: (index: number, options?: MoveOptions) => void
  /** Props del contenedor (`role="listbox"`), con su nombre accesible. */
  getContainerProps: (label?: GroupLabel) => RovingGridContainerProps
  /** Props de cada casilla (`role="option"`, `aria-selected` en la elegida). */
  getItemProps: <E extends HTMLElement = HTMLElement>(
    index: number,
    handlers?: ItemHandlers<E>,
  ) => RovingGridItemProps<E>
}

/**
 * Rejilla de selección (guía §3.8.13, RD-MOT-05): `listbox` en dos dimensiones con foco itinerante.
 * ←/→ recorren en orden de lectura dando la vuelta, ↑/↓ cambian de fila conservando la columna (también
 * en bucle), Inicio/Fin, RePág/AvPág saltan cuatro filas, Intro (o clic) activa. El foco es la
 * selección: la casilla enfocada lleva `aria-selected="true"` y el cursor. Las casillas no llevan
 * números de orden ni nada que las distinga salvo su contenido (§1.3).
 */
export function useRovingGrid(options: RovingGridOptions): RovingGrid {
  const { count, columns, loop = true, pageRows = 4 } = options
  const core = useRovingCore<HTMLElement>({
    ...options,
    initialIndex: options.initialIndex ?? 0,
    typeahead: false,
    navigate: (key, index) => gridNavigation(key, index, count, columns, { loop, pageRows }),
  })
  return {
    activeIndex: core.activeIndex,
    moveTo: core.moveTo,
    getContainerProps: (label = {}) => ({
      ...label,
      role: 'listbox',
      'data-cursor-group': '',
      onKeyDown: core.onKeyDown,
    }),
    getItemProps: <E extends HTMLElement = HTMLElement>(index: number, handlers?: ItemHandlers<E>) => ({
      ...(core.getItemBaseProps(
        index,
        handlers as ItemHandlers<HTMLElement>,
      ) as unknown as RovingItemBaseProps<E>),
      role: 'option' as const,
      'aria-selected': index === core.activeIndex,
    }),
  }
}
