import type { HTMLAttributes, ReactNode, Ref } from 'react'
import './key.css'

/** Tonos de la tecla (§3.3): oscura, clara (en botones blancos) y marcada (`--bb-red-press`). */
export type KeyTone = 'dark' | 'light' | 'marked'

export const KEY_TONES: readonly KeyTone[] = ['dark', 'light', 'marked']

export interface KeyProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** Lo que se ve en la tecla: «INTRO», «Q», «↑». */
  children: ReactNode
  tone?: KeyTone
  /**
   * Nombre de la tecla para los lectores de pantalla cuando el dibujo no se lee bien («flecha
   * arriba» para «↑»). Con él, el dibujo queda oculto y se lee este texto.
   */
  label?: string
  ref?: Ref<HTMLElement>
}

/**
 * Tecla (`Key`, guía §3.3): pieza de chaflán `--bb-cut-xs`, 26 px de alto, Oxanium 12 px. Es la ayuda
 * visible del teclado (barra de controles, botones con `[INTRO]`, pestañas con `[Q]`/`[E]`). Dentro de
 * un control que ya dice su acción («Entrar»), se oculta a los lectores con `aria-hidden`.
 */
export function Key({ children, tone = 'dark', label, ...rest }: KeyProps) {
  return (
    <kbd {...rest} data-key={tone}>
      {label ? (
        <>
          <span aria-hidden="true">{children}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        children
      )}
    </kbd>
  )
}
