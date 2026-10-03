import type { HTMLAttributes, ReactNode, Ref } from 'react'
import './tag.css'

/** Tonos de la etiqueta (§3.3): blanca y roja con texto negro, `cta` con texto blanco. */
export type TagTone = 'white' | 'red' | 'cta'

/** 12, 14 o 16 px (§3.3: «display cursiva a 12–16 px»). */
export type TagSize = 'sm' | 'md' | 'lg'

export const TAG_TONES: readonly TagTone[] = ['white', 'red', 'cta']
export const TAG_SIZES: readonly TagSize[] = ['sm', 'md', 'lg']

export interface TagProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children: ReactNode
  tone?: TagTone
  size?: TagSize
  ref?: Ref<HTMLSpanElement>
}

/**
 * Etiqueta en paralelogramo (`Tag`, guía §3.3): 1P, NUEVO, RETO, EN JUEGO, TU RESULTADO. Es texto
 * (no un control); el contraste de cada tono cumple AA para texto de cualquier tamaño (§3.2).
 */
export function Tag({ children, tone = 'white', size = 'sm', ...rest }: TagProps) {
  return (
    <span {...rest} data-tag={tone} data-tag-size={size}>
      {children}
    </span>
  )
}
