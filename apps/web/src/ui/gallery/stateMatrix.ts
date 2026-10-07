import type { MatrixComponentKey } from './anchors'

/**
 * Matriz de estados de §3.3 por componente (`RD-VIS-03`): reposo, hover, foco, pulsado, cargando,
 * deshabilitado, éxito y error. «S» se enseña (una celda con `data-state`); «NA» no aplica, con su
 * motivo (`dev.gallery.matrix.reasons.*`). Es la tabla de la guía, componente a componente; el test de
 * la galería recorre cada bloque contra ella.
 */

export const STATES = [
  'rest',
  'hover',
  'focus',
  'pressed',
  'loading',
  'disabled',
  'success',
  'error',
] as const
export type ComponentState = (typeof STATES)[number]

/** Motivos de «no aplica», claves de `dev.gallery.matrix.reasons`. */
export type StateReason =
  | 'menuInstant'
  | 'menuNoResult'
  | 'tabsInstant'
  | 'chipInstant'
  | 'fighterNotControl'
  | 'fighterOwnState'
  | 'cellNoResult'
  | 'rowPlaying'
  | 'tileData'
  | 'waveNoResult'
  | 'modalButtons'
  | 'modalClose'
  | 'modalToast'
  | 'announcerOnce'
  | 'toastPast'
  | 'toastDismiss'
  | 'meterData'
  | 'skeletonOnly'
  | 'clockData'

export type StateCoverage = { kind: 'shown' } | { kind: 'notApplicable'; reason: StateReason }

const S: StateCoverage = { kind: 'shown' }
const NA = (reason: StateReason): StateCoverage => ({ kind: 'notApplicable', reason })

export const STATE_MATRIX: Record<MatrixComponentKey, Record<ComponentState, StateCoverage>> = {
  button: { rest: S, hover: S, focus: S, pressed: S, loading: S, disabled: S, success: S, error: S },
  // §3.8.4: cargando es «guardando»; deshabilitado, «dormidas» (umbral sin cumplir).
  stars: { rest: S, hover: S, focus: S, pressed: S, loading: S, disabled: S, success: S, error: S },
  menuPlate: {
    rest: S,
    hover: S,
    focus: S,
    pressed: S,
    loading: NA('menuInstant'),
    disabled: S,
    success: NA('menuNoResult'),
    error: NA('menuNoResult'),
  },
  tabs: {
    rest: S,
    hover: S,
    focus: S,
    pressed: S,
    loading: NA('tabsInstant'),
    disabled: S,
    success: NA('tabsInstant'),
    error: NA('tabsInstant'),
  },
  filterChip: {
    rest: S,
    hover: S,
    focus: S,
    pressed: S,
    loading: NA('chipInstant'),
    disabled: S,
    success: NA('chipInstant'),
    error: NA('chipInstant'),
  },
  fighterCard: {
    rest: S,
    hover: NA('fighterNotControl'),
    focus: NA('fighterNotControl'),
    pressed: NA('fighterNotControl'),
    loading: S,
    disabled: NA('fighterNotControl'),
    success: NA('fighterOwnState'),
    error: S,
  },
  entryCell: {
    rest: S,
    hover: S,
    focus: S,
    pressed: S,
    loading: S,
    disabled: S,
    success: NA('cellNoResult'),
    error: S,
  },
  entryRow: {
    rest: S,
    hover: S,
    focus: S,
    pressed: S,
    loading: S,
    disabled: S,
    success: NA('rowPlaying'),
    error: S,
  },
  tile: {
    rest: S,
    hover: NA('tileData'),
    focus: NA('tileData'),
    pressed: NA('tileData'),
    loading: S,
    disabled: NA('tileData'),
    success: NA('tileData'),
    error: NA('tileData'),
  },
  waveform: {
    rest: S,
    hover: S,
    focus: S,
    pressed: S,
    loading: S,
    disabled: S,
    success: NA('waveNoResult'),
    error: S,
  },
  modal: {
    rest: S,
    hover: NA('modalButtons'),
    focus: S,
    pressed: NA('modalButtons'),
    loading: S,
    disabled: NA('modalClose'),
    success: NA('modalToast'),
    error: S,
  },
  announcer: {
    rest: S,
    hover: NA('announcerOnce'),
    focus: NA('announcerOnce'),
    pressed: NA('announcerOnce'),
    loading: NA('announcerOnce'),
    disabled: NA('announcerOnce'),
    success: NA('announcerOnce'),
    error: NA('announcerOnce'),
  },
  toast: {
    rest: S,
    hover: S,
    focus: S,
    pressed: S,
    loading: NA('toastPast'),
    disabled: NA('toastDismiss'),
    success: S,
    error: S,
  },
  meter: {
    rest: S,
    hover: NA('meterData'),
    focus: NA('meterData'),
    pressed: NA('meterData'),
    loading: NA('meterData'),
    disabled: NA('meterData'),
    success: S,
    error: NA('meterData'),
  },
  skeleton: {
    rest: NA('skeletonOnly'),
    hover: NA('skeletonOnly'),
    focus: NA('skeletonOnly'),
    pressed: NA('skeletonOnly'),
    loading: S,
    disabled: NA('skeletonOnly'),
    success: NA('skeletonOnly'),
    error: NA('skeletonOnly'),
  },
  roundClock: {
    rest: S,
    hover: NA('clockData'),
    focus: NA('clockData'),
    pressed: NA('clockData'),
    loading: NA('clockData'),
    disabled: NA('clockData'),
    success: NA('clockData'),
    error: S,
  },
}

/** Estados de un componente que la galería no enseña, en el orden de §3.3. */
export function uncoveredStates(component: MatrixComponentKey) {
  return STATES.flatMap((state) => {
    const coverage = STATE_MATRIX[component][state]
    return coverage.kind === 'shown' ? [] : [{ state, coverage }]
  })
}
