import type { ComponentKey } from './anchors'

/**
 * Matriz de estados de §3.3 por componente (`RD-VIS-03`). La guía pide que cada componente tenga
 * definidos reposo, hover, foco, pulsado, cargando, deshabilitado, éxito y error; no todos tienen
 * sentido en todos (un rótulo no se pulsa, un esqueleto solo existe cargando). Aquí queda escrito,
 * para cada componente de la galería, qué estados enseña y cuáles no aplican o se aplazan, con su
 * motivo (`dev.gallery.matrix.reasons.*`). La galería pinta una celda por cada estado que no enseña
 * y el test recorre cada bloque contra esta matriz.
 *
 * Falta «Estrellas» (§3.8.4): llega con la tarea 1.5 de la Fase 1, con sus estados.
 */

export const SEAL_STATES = [
  'rest',
  'hover',
  'focus',
  'pressed',
  'loading',
  'disabled',
  'success',
  'error',
] as const
export type SealState = (typeof SEAL_STATES)[number]

/** Motivos de «no aplica» o «aplazado», claves de `dev.gallery.matrix.reasons`. */
export type StateReason =
  | 'chipInstant'
  | 'cardNotControl'
  | 'cardContent'
  | 'tileData'
  | 'tileNoResult'
  | 'staticText'
  | 'wavePlayer'
  | 'waveData'
  | 'rowPlaying'
  | 'modalButtons'
  | 'modalClose'
  | 'modalToast'
  | 'toastPast'
  | 'toastDismiss'
  | 'notInteractive'
  | 'xpData'
  | 'skeletonOnly'
  | 'countdownCalendar'

export type StateCoverage =
  /** El bloque enseña el estado (una celda con `data-state`). */
  | { kind: 'shown' }
  /** No tiene sentido en este componente. */
  | { kind: 'notApplicable'; reason: StateReason }
  /** Tiene sentido, pero llega con otra fase. */
  | { kind: 'deferred'; reason: StateReason }

const shown: StateCoverage = { kind: 'shown' }
const na = (reason: StateReason): StateCoverage => ({ kind: 'notApplicable', reason })
const later = (reason: StateReason): StateCoverage => ({ kind: 'deferred', reason })

export const STATE_MATRIX: Record<ComponentKey, Record<SealState, StateCoverage>> = {
  button: {
    rest: shown,
    hover: shown,
    focus: shown,
    pressed: shown,
    loading: shown,
    disabled: shown,
    success: shown,
    error: shown,
  },
  chip: {
    rest: shown,
    hover: shown,
    focus: shown,
    pressed: shown,
    loading: na('chipInstant'),
    disabled: shown,
    success: na('chipInstant'),
    error: na('chipInstant'),
  },
  card: {
    rest: shown,
    hover: shown,
    focus: shown,
    pressed: na('cardNotControl'),
    loading: shown,
    disabled: shown,
    success: na('cardContent'),
    error: na('cardContent'),
  },
  dataTile: {
    rest: shown,
    hover: shown,
    focus: na('tileData'),
    pressed: na('tileData'),
    loading: shown,
    disabled: na('tileData'),
    success: na('tileNoResult'),
    error: na('tileNoResult'),
  },
  sectionLabel: {
    rest: shown,
    hover: na('staticText'),
    focus: na('staticText'),
    pressed: na('staticText'),
    loading: na('staticText'),
    disabled: na('staticText'),
    success: na('staticText'),
    error: na('staticText'),
  },
  waveform: {
    rest: shown,
    hover: later('wavePlayer'),
    focus: later('wavePlayer'),
    pressed: later('wavePlayer'),
    loading: na('waveData'),
    disabled: later('wavePlayer'),
    success: na('waveData'),
    error: na('waveData'),
  },
  entryRow: {
    rest: shown,
    hover: shown,
    focus: shown,
    pressed: shown,
    loading: shown,
    disabled: shown,
    success: na('rowPlaying'),
    error: shown,
  },
  modal: {
    rest: shown,
    hover: na('modalButtons'),
    focus: shown,
    pressed: na('modalButtons'),
    loading: shown,
    disabled: na('modalClose'),
    success: na('modalToast'),
    error: shown,
  },
  toast: {
    rest: shown,
    hover: shown,
    focus: shown,
    pressed: shown,
    loading: na('toastPast'),
    disabled: na('toastDismiss'),
    success: shown,
    error: shown,
  },
  xpBar: {
    rest: shown,
    hover: na('notInteractive'),
    focus: na('notInteractive'),
    pressed: na('notInteractive'),
    loading: na('xpData'),
    disabled: na('notInteractive'),
    success: shown,
    error: na('xpData'),
  },
  skeleton: {
    rest: na('skeletonOnly'),
    hover: na('notInteractive'),
    focus: na('notInteractive'),
    pressed: na('notInteractive'),
    loading: shown,
    disabled: na('notInteractive'),
    success: na('skeletonOnly'),
    error: na('skeletonOnly'),
  },
  countdown: {
    rest: shown,
    hover: na('notInteractive'),
    focus: na('notInteractive'),
    pressed: na('notInteractive'),
    loading: na('countdownCalendar'),
    disabled: na('notInteractive'),
    success: na('countdownCalendar'),
    error: na('countdownCalendar'),
  },
}

/** Estados de un componente que la galería no enseña (no aplican o se aplazan), en el orden de §3.3. */
export function uncoveredStates(component: ComponentKey) {
  return SEAL_STATES.flatMap((state) => {
    const coverage = STATE_MATRIX[component][state]
    return coverage.kind === 'shown' ? [] : [{ state, coverage }]
  })
}
