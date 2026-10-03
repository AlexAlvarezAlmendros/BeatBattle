/**
 * Componentes base de BeatBattle (guía §3.3). Cada uno en su carpeta (`Componente.tsx`, su CSS,
 * `index.ts`, `Componente.test.tsx`), con sus estados forzables para la galería (`state`, ver
 * `forceState.ts`) y su variante sin movimiento.
 *
 * Primitivas de la arena (tarea 0.22): `Frame`, `Key`, `Tag`, `Cursor` y `OtpSlap`, con su CSS global por
 * atributos en `ui/primitives.css` (`[data-frame]`, `[data-cursor]`, `[data-key]`, `[data-tag]`), el
 * limitador de destellos (`flash`) y los hooks de foco itinerante y de modo serio en `ui/hooks`. Los
 * componentes de la Fase 0 anterior (Button, Card, Chip…) se rehacen sobre ellas en la 0.25.
 */
export * from './Button'
export * from './Card'
export * from './Chip'
export * from './Countdown'
export * from './Cursor'
export * from './DataTile'
export * from './EntryRow'
export * from './Frame'
export * from './flash'
export { cx, forceStateAttr, INTERACTION_STATES, type InteractionState } from './forceState'
export * from './Icon'
export * from './Key'
export * from './Modal'
export * from './OtpSlap'
export * from './SectionLabel'
export * from './Skeleton'
export * from './Tag'
export * from './Toast'
export * from './Waveform'
export * from './XpBar'
