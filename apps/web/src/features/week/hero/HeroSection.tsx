import { domAnimation, LazyMotion, m } from 'motion/react'
import type { ReactNode } from 'react'
import { HeroGrid, Vignette } from './HeroBackdrop'
import { useHeroReveal } from './reveal'
import './hero.css'

interface HeroSectionProps {
  /** Id del titular (`HeroTitle`), que da nombre a la sección. */
  labelledBy?: string
  className?: string
  /** Contenido centrado (titular, subtítulo, botones…). */
  children: ReactNode
  /** Piezas posicionadas sobre el hero: rótulos laterales, banda de marquee. */
  overlay?: ReactNode
}

/**
 * Hero a sangre del sello (Hero.css `.hero-section`): ocupa la ventana (100 dvh, entre 640 y 1000 px),
 * sube hasta el borde superior por debajo de la isla (`.bleed-top`, con `--nav-flow`) y lleva detrás la
 * rejilla roja y la viñeta, que se funden con el fondo en el borde inferior. Orquesta la entrada de las
 * piezas (`useHeroReveal`).
 */
export function HeroSection({ labelledBy, className, children, overlay }: HeroSectionProps) {
  const { container } = useHeroReveal()
  return (
    // `m` + `LazyMotion` con `domAnimation`: solo lo que usa el marco (variantes, fundidos y salidas),
    // sin el paquete completo de Motion en el trozo inicial (§4.17: JS inicial < 200 kB gz).
    <LazyMotion features={domAnimation}>
      <m.section
        className={className ? `hero bleed-top ${className}` : 'hero bleed-top'}
        aria-labelledby={labelledBy}
        initial="hidden"
        animate="shown"
        variants={container}
      >
        <div className="hero__backdrop" aria-hidden="true">
          <Vignette />
          <HeroGrid />
        </div>
        <div className="hero__content">{children}</div>
        {overlay}
      </m.section>
    </LazyMotion>
  )
}
