import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { useHeroReveal } from './reveal'

interface SideLabelProps {
  /** Izquierda (se lee de abajo arriba) o derecha (de arriba abajo), como en el sello. */
  side: 'left' | 'right'
  children: ReactNode
}

/**
 * Rótulo vertical lateral del hero (guía §3.1; Hero.css `.hero-side`): 0,7 rem, peso 600,
 * `letter-spacing: .4em`, entre filetes rojos. Se oculta por debajo de 1024 px. Va posicionado sobre el
 * contenedor del hero (`HeroSection`, prop `overlay`).
 *
 * El gris del sello (blanco al 45 %, 4,4:1) no llega a AA para texto de 11 px: aquí va en
 * `--bb-text-3`.
 */
export function SideLabel({ side, children }: SideLabelProps) {
  const { fade } = useHeroReveal()
  return (
    <m.div className={`side-label side-label--${side}`} variants={fade}>
      <span className="side-label__text">{children}</span>
    </m.div>
  )
}
