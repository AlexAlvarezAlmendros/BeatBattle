import type { SfxId } from '@beatbattle/audio'
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { audio } from '../../audio/engine'
import { activatesNatively, clampIndex, isCharacterKey, isEditableTarget, typeaheadMatch } from './roving'

/**
 * Núcleo compartido del foco itinerante (guía §3.3 «El foco es el cursor», RD-MOT-05): una sola parada
 * de tabulación por grupo (`tabIndex` 0 en la opción elegida y −1 en las demás), el foco real se mueve
 * con las teclas y la opción enfocada es la elegida. Lo usan `useRovingMenu`, `useRovingGrid` y
 * `useRovingTabs`, que ponen los roles ARIA y la forma de navegar.
 *
 * La activación pasa siempre por `click`: Intro en un botón o un enlace la genera el navegador, y en
 * cualquier otro elemento (una casilla `role="option"`) la genera el hook con `element.click()`. Así
 * `onActivate` se llama una vez, venga del teclado, del ratón o de un toque.
 */

/** Manejadores que se pueden encadenar en las props de una opción. */
export interface ItemHandlers<E extends HTMLElement> {
  onFocus?: (event: FocusEvent<E>) => void
  onPointerEnter?: (event: PointerEvent<E>) => void
  onClick?: (event: MouseEvent<E>) => void
}

/**
 * Nombre accesible del grupo (menú, rejilla, lista de pestañas): se pasa al pedir sus props para que
 * vaya junto a su rol.
 */
export interface GroupLabel {
  'aria-label'?: string
  'aria-labelledby'?: string
}

/** Props comunes de una opción (cada hook añade su rol y su estado ARIA). */
export interface RovingItemBaseProps<E extends HTMLElement> extends Required<ItemHandlers<E>> {
  ref: (element: E | null) => void
  tabIndex: 0 | -1
  'aria-disabled'?: true
  'data-cursor': ''
  'data-cursor-active'?: 'true'
}

export interface RovingCoreOptions {
  /** Número de opciones. */
  count: number
  /** Opción elegida al montar. */
  initialIndex: number
  /** Índice nuevo para una tecla (o `null` si no navega). */
  navigate: (key: string, index: number) => number | null
  /** Enfoca la opción elegida al montar (sin desplazar la página). */
  autoFocus?: boolean
  /** El ratón mueve el cursor al pasar por encima (por defecto, sí). */
  hoverMoves?: boolean
  /** Opciones deshabilitadas: se pueden recorrer (enseñan su motivo), pero no se activan. */
  isDisabled?: (index: number) => boolean
  /** Letra inicial: etiqueta de cada opción (si falta, su texto). Sin `typeahead`, no se usa. */
  typeahead?: boolean
  getLabel?: (index: number) => string
  /** El cursor ha cambiado de opción (panel de ayuda, ficha del luchador, sonido `ui.move`). */
  onMove?: (index: number) => void
  /** Intro, espacio, clic o toque sobre una opción habilitada. */
  onActivate?: (index: number) => void
  /**
   * Efecto al activar una opción (Anexo E): `ui.press` en los menús (por defecto) y `ui.toggle` en las
   * pestañas; `null`, sin sonido (cuando lo pone otra pieza).
   */
  activateSfx?: SfxId | null
  /** Efecto al mover el cursor (Anexo E): `ui.move` por defecto; `null` donde mover ya elige (pestañas). */
  moveSfx?: SfxId | null
}

export interface MoveOptions {
  /** Mueve también el foco real (por defecto, sí). */
  focus?: boolean
  /** No desplaza la página al enfocar (por defecto, no: la opción se pone a la vista). */
  preventScroll?: boolean
}

export function useRovingCore<E extends HTMLElement>(options: RovingCoreOptions) {
  const { count, initialIndex, autoFocus = false } = options
  const [activeIndex, setActiveIndex] = useState(() => clampIndex(initialIndex, count))
  const activeRef = useRef(activeIndex)
  const elements = useRef<(E | null)[]>([])
  const refCallbacks = useRef(new Map<number, (element: E | null) => void>())
  // Las opciones cambian en cada render (funciones en línea): los manejadores leen siempre las últimas.
  const latest = useRef(options)
  latest.current = options
  // Estable: lee las opciones del momento por `latest`.
  const playMove = useCallback(() => {
    const sfx = latest.current.moveSfx === undefined ? 'ui.move' : latest.current.moveSfx
    if (sfx) audio.play(sfx)
  }, [])

  const moveTo = useCallback((index: number, { focus = true, preventScroll = false }: MoveOptions = {}) => {
    const { count: total, onMove } = latest.current
    if (total <= 0) return
    const next = clampIndex(index, total)
    const changed = next !== activeRef.current
    activeRef.current = next
    setActiveIndex(next)
    if (focus) elements.current[next]?.focus({ preventScroll })
    if (changed) onMove?.(next)
  }, [])

  // Si cambia el número de opciones, la elegida sigue dentro.
  useEffect(() => {
    if (count > 0 && activeRef.current >= count) moveTo(count - 1, { focus: false })
  }, [count, moveTo])

  // Foco inicial: el cursor está en la opción elegida al entrar en la pantalla (§3.8.3).
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al montar
  useEffect(() => {
    if (autoFocus) elements.current[activeRef.current]?.focus({ preventScroll: true })
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return
      const { navigate, typeahead, count: total } = latest.current
      const current = activeRef.current
      const next = navigate(event.key, current)
      if (next !== null) {
        event.preventDefault()
        // El tic del cursor (`ui.move`, Anexo E), solo si de verdad cambia de opción.
        if (next !== current) playMove()
        moveTo(next)
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        const element = elements.current[current]
        if (!element || activatesNatively(element, event.key)) return
        event.preventDefault()
        element.click()
        return
      }
      if (typeahead && isCharacterKey(event)) {
        const { getLabel } = latest.current
        const labels = Array.from(
          { length: total },
          (_, index) => getLabel?.(index) ?? elements.current[index]?.textContent ?? '',
        )
        const match = typeaheadMatch(labels, current, event.key)
        // Sin coincidencia, la tecla sigue su camino (las teclas globales de la pantalla, como M).
        if (match === null) return
        event.preventDefault()
        if (match !== current) playMove()
        moveTo(match)
      }
    },
    [moveTo, playMove],
  )

  const getItemBaseProps = (index: number, handlers: ItemHandlers<E> = {}): RovingItemBaseProps<E> => {
    let ref = refCallbacks.current.get(index)
    if (!ref) {
      ref = (element: E | null) => {
        elements.current[index] = element
      }
      refCallbacks.current.set(index, ref)
    }
    const active = index === activeIndex
    const disabled = options.isDisabled?.(index) ?? false
    return {
      ref,
      tabIndex: active ? 0 : -1,
      ...(disabled ? { 'aria-disabled': true as const } : {}),
      'data-cursor': '',
      ...(active ? { 'data-cursor-active': 'true' as const } : {}),
      onFocus: (event) => {
        handlers.onFocus?.(event)
        if (activeRef.current !== index) moveTo(index, { focus: false })
      },
      onPointerEnter: (event) => {
        handlers.onPointerEnter?.(event)
        if (latest.current.hoverMoves === false || event.pointerType === 'touch') return
        if (activeRef.current === index) return
        // Solo se lleva el foco si ya estaba en el grupo (o en ningún sitio): pasar el ratón por el
        // menú no le roba el foco a un campo de texto.
        const focused = document.activeElement
        const owns =
          !focused || focused === document.body || elements.current.some((element) => element === focused)
        playMove()
        moveTo(index, { focus: owns, preventScroll: true })
      },
      onClick: (event) => {
        handlers.onClick?.(event)
        if (activeRef.current !== index) moveTo(index, { focus: false })
        if (latest.current.isDisabled?.(index)) {
          event.preventDefault()
          return
        }
        const sfx = latest.current.activateSfx === undefined ? 'ui.press' : latest.current.activateSfx
        if (sfx) audio.play(sfx)
        latest.current.onActivate?.(index)
      },
    }
  }

  return { activeIndex, moveTo, onKeyDown, getItemBaseProps, elements }
}
