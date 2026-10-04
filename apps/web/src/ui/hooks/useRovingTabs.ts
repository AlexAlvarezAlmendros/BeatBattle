import { type FocusEvent, type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { singleKeyAllowed } from '../shortcuts'
import { isCharacterKey, isEditableTarget, listNavigation, wrapIndex } from './roving'
import { type GroupLabel, type ItemHandlers, type RovingItemBaseProps, useRovingCore } from './useRoving'

export interface RovingTabsOptions {
  /** Número de pestañas. */
  count: number
  /** Pestaña elegida, si la controla quien usa el hook. */
  selectedIndex?: number
  /** Pestaña elegida al montar, si no está controlada (por defecto, la primera). */
  defaultIndex?: number
  onChange?: (index: number) => void
  /** ←/→ dan la vuelta (por defecto, sí). */
  loop?: boolean
  /**
   * Q y E cambian de pestaña desde cualquier parte de la pantalla (por defecto, sí: §3.3, §3.8.13).
   * Solo una lista de pestañas por pantalla debe tenerlas. No actúan mientras se escribe en un campo
   * ni con modificadores, ni si otro manejador ya ha usado la tecla (`defaultPrevented`), y con los
   * atajos de una tecla apagados solo actúan con el foco en las pestañas (`ui/shortcuts.ts`).
   */
  globalKeys?: boolean
  /**
   * Pestañas deshabilitadas (§3.3: «Pestañas … deshabilitado»): el cursor puede pasar por ellas (llevan
   * `aria-disabled` y enseñan su motivo), pero no se eligen; Q/E las saltan.
   */
  isDisabled?: (index: number) => boolean
}

export interface RovingTabListProps extends GroupLabel {
  role: 'tablist'
  'aria-orientation': 'horizontal'
  'data-cursor-group': ''
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onBlur: (event: FocusEvent<HTMLElement>) => void
}

export interface RovingTabProps<E extends HTMLElement> extends RovingItemBaseProps<E> {
  role: 'tab'
  id: string
  'aria-selected': boolean
  'aria-controls': string
}

export interface RovingTabPanelProps {
  role: 'tabpanel'
  id: string
  'aria-labelledby': string
  tabIndex: 0
  hidden: boolean
}

export interface RovingTabs {
  selectedIndex: number
  /** Elige una pestaña (y le lleva el foco con `{ focus: true }`). */
  select: (index: number, options?: { focus?: boolean }) => void
  /** Props de la lista (`role="tablist"`), con su nombre accesible. */
  getTabListProps: (label?: GroupLabel) => RovingTabListProps
  getTabProps: <E extends HTMLElement = HTMLElement>(
    index: number,
    handlers?: ItemHandlers<E>,
  ) => RovingTabProps<E>
  getPanelProps: (index: number) => RovingTabPanelProps
}

/**
 * Pestañas de juego (guía §3.3 «Pestañas», §3.8.13, RD-MOT-05): `tablist` con foco itinerante y
 * selección que sigue al foco. ←/→ (en bucle), Inicio/Fin y clic eligen; **Q** y **E** eligen la
 * anterior y la siguiente desde cualquier parte de la pantalla sin mover el foco (en la selección de
 * entradas, Q/E solo cambian el orden mientras el cursor sigue en la rejilla). Si el foco ya está en las
 * pestañas, Q/E también se lo llevan.
 */
export function useRovingTabs(options: RovingTabsOptions): RovingTabs {
  const { count, loop = true, globalKeys = true } = options
  const controlled = options.selectedIndex !== undefined
  const [ownIndex, setOwnIndex] = useState(options.defaultIndex ?? 0)
  const selectedIndex = controlled ? (options.selectedIndex as number) : ownIndex
  const selectedRef = useRef(selectedIndex)
  selectedRef.current = selectedIndex
  const latest = useRef(options)
  latest.current = options
  const baseId = useId()

  const commit = useCallback(
    (index: number) => {
      if (index === selectedRef.current || latest.current.isDisabled?.(index)) return
      selectedRef.current = index
      if (!controlled) setOwnIndex(index)
      latest.current.onChange?.(index)
    },
    [controlled],
  )

  const core = useRovingCore<HTMLElement>({
    count,
    initialIndex: selectedIndex,
    typeahead: false,
    hoverMoves: false,
    isDisabled: options.isDisabled,
    navigate: (key, index) => listNavigation(key, index, count, { loop, orientation: 'horizontal' }),
    onMove: commit,
  })
  const { moveTo, elements } = core

  /*
   * Si la selección cambia desde fuera (controlada, o Q/E), el cursor la sigue sin robar el foco. Solo
   * cuando **cambia**: el cursor y la selección pueden separarse a propósito, porque el cursor pasa por
   * las deshabilitadas sin elegirlas; devolverlo a la elegida en cada render dejaba el foco real en la
   * deshabilitada y la siguiente flecha se calculaba desde la elegida (se atascaba o se saltaba una).
   */
  const syncedSelection = useRef(selectedIndex)
  useEffect(() => {
    if (syncedSelection.current === selectedIndex) return
    syncedSelection.current = selectedIndex
    moveTo(selectedIndex, { focus: false })
  }, [selectedIndex, moveTo])

  /*
   * Al salir del grupo con el cursor en una deshabilitada, la parada de tabulación (y el cursor que se ve
   * fuera del grupo, §3.3) vuelven a la pestaña elegida.
   */
  const onBlur = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const next = event.relatedTarget
      if (next instanceof Node && event.currentTarget.contains(next)) return
      moveTo(selectedRef.current, { focus: false })
    },
    [moveTo],
  )

  const select = useCallback(
    (index: number, { focus = false }: { focus?: boolean } = {}) => {
      const next = wrapIndex(index, latest.current.count)
      commit(next)
      moveTo(next, { focus })
    },
    [commit, moveTo],
  )

  useEffect(() => {
    if (!globalKeys) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !isCharacterKey(event) || isEditableTarget(event.target))
        return
      const key = event.key.toLowerCase()
      if (key !== 'q' && key !== 'e') return
      const focused = document.activeElement
      const inside = elements.current.some((element) => element === focused)
      // Atajo de una tecla: con los atajos apagados, solo con el foco en las pestañas (WCAG 2.1.4).
      if (!singleKeyAllowed(inside)) return
      event.preventDefault()
      const step = key === 'e' ? 1 : -1
      const total = latest.current.count
      let next = selectedRef.current
      for (let tries = 0; tries < total; tries += 1) {
        next = wrapIndex(next + step, total)
        if (!latest.current.isDisabled?.(next)) break
      }
      select(next, { focus: inside })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [globalKeys, select, elements])

  const tabId = (index: number) => `${baseId}-tab-${index}`
  const panelId = (index: number) => `${baseId}-panel-${index}`

  return {
    selectedIndex,
    select,
    getTabListProps: (label = {}) => ({
      ...label,
      role: 'tablist',
      'aria-orientation': 'horizontal',
      'data-cursor-group': '',
      onKeyDown: core.onKeyDown,
      onBlur,
    }),
    getTabProps: <E extends HTMLElement = HTMLElement>(index: number, handlers?: ItemHandlers<E>) => ({
      ...(core.getItemBaseProps(index, {
        ...(handlers as ItemHandlers<HTMLElement>),
        onClick: (event) => {
          ;(handlers as ItemHandlers<HTMLElement> | undefined)?.onClick?.(event)
          commit(index)
        },
      }) as unknown as RovingItemBaseProps<E>),
      role: 'tab' as const,
      id: tabId(index),
      'aria-selected': index === selectedIndex,
      'aria-controls': panelId(index),
    }),
    getPanelProps: (index: number) => ({
      role: 'tabpanel',
      id: panelId(index),
      'aria-labelledby': tabId(index),
      tabIndex: 0,
      hidden: index !== selectedIndex,
    }),
  }
}
