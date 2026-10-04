/**
 * Estados forzados de los componentes base (§3.3, `RD-VIS-03`): la galería pinta cada estado
 * estático, sin tener que pasar el ratón ni pulsar. El componente pone `data-force-state="<estado>"`
 * en su raíz y su CSS lo trata con la **misma regla** que el estado real:
 *
 * ```css
 * .button:hover, .button[data-force-state="hover"] { … }
 * ```
 *
 * Así lo que se ve en la galería es exactamente lo que se ve al interactuar.
 */

/** Estados de interacción que se pueden forzar en cualquier componente interactivo. */
export type InteractionState = 'rest' | 'hover' | 'focus' | 'pressed'

export const INTERACTION_STATES: readonly InteractionState[] = ['rest', 'hover', 'focus', 'pressed']

/** Atributo `data-force-state` para la raíz del componente (nada en reposo o sin forzar). */
export function forceStateAttr<S extends string>(state: S | undefined): { 'data-force-state'?: S } {
  return state && state !== 'rest' ? { 'data-force-state': state } : {}
}

/** Une clases y descarta las vacías: `cx(styles.a, on && styles.b)`. */
export function cx(...classes: readonly (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
