import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { useHeroReveal } from './reveal'

interface HeroTitleProps {
  id?: string
  /** Primera línea, blanca maciza («Beat»). */
  solid: string
  /** Segunda línea, en contorno rojo con relleno negro y halo («Battle»). */
  outline: string
}

/**
 * Titular gigante del sello en dos líneas (guía §3.1 y §3.2; Hero.css `.hero-title`): la primera
 * blanca maciza y la segunda en contorno rojo (`-webkit-text-stroke` de 2 / 1,5 / 1 px) con relleno
 * negro y halo de 30 px; `clamp(2.8rem, 8vw, 6rem)`, interletraje −0,03 em (0 en móvil).
 *
 * Las mayúsculas las pone el CSS: el texto se escribe normal para que el lector de pantalla diga «Beat
 * Battle» y no lo deletree. Un espacio entre líneas mantiene el nombre accesible en dos palabras.
 */
export function HeroTitle({ id, solid, outline }: HeroTitleProps) {
  // `title` y no `item`: el titular es el LCP de la home y se pinta opaco desde el primer fotograma.
  const { title } = useHeroReveal()
  return (
    <h1 id={id} className="hero-title">
      <m.span className="hero-title__line" variants={title}>
        {solid}
      </m.span>{' '}
      <m.span className="hero-title__line hero-title__line--outline" variants={title}>
        {outline}
      </m.span>
    </h1>
  )
}

/** Filete rojo bajo el titular (80 × 3 px, degradado a transparente; `.hero-divider`). */
export function HeroDivider() {
  const { grow } = useHeroReveal()
  return <m.div className="hero-divider" aria-hidden="true" variants={grow} />
}

/** Subtítulo en mayúsculas espaciadas a 0,15 em (`.hero-subtitle`). */
export function HeroSubtitle({ children }: { children: ReactNode }) {
  const { item } = useHeroReveal()
  return (
    <m.p className="hero-subtitle" variants={item}>
      {children}
    </m.p>
  )
}

/** Fila de botones del hero (`.hero-buttons`): en columna y a todo el ancho en móvil. */
export function HeroActions({ children }: { children: ReactNode }) {
  const { item } = useHeroReveal()
  return (
    <m.div className="hero-actions" variants={item}>
      {children}
    </m.div>
  )
}

/** Línea de estado bajo los botones (p. ej. «El próximo drop está en el horno.», §2.19). */
export function HeroNote({ children }: { children: ReactNode }) {
  const { item } = useHeroReveal()
  return (
    <m.p className="hero-note" variants={item}>
      {children}
    </m.p>
  )
}
