import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { GlassSurface } from '../../../ui/GlassSurface'

interface HeroCtaProps {
  to: string
  /** `primary`: píldora en `--bb-red-cta`. `ghost`: contorno blanco al 30 % sobre cristal. */
  variant: 'primary' | 'ghost'
  children: ReactNode
}

/**
 * Botones píldora del hero del sello (Hero.css `.hero-cta`): mayúsculas, peso 700, interletraje
 * 0,1 em (0,08 em en móvil). El rojo usa `--bb-red-cta` (blanco sobre `#ff003c` no llega a AA, §3.1);
 * el de contorno va sobre cristal (`GlassSurface`, como en el sello).
 *
 * Hover: sube 1 px y el halo crece; pulsado: escala 0,97 (§3.3, Anexo E). Con «reducir movimiento»,
 * solo cambia el color (`--bb-motion` a 0).
 *
 * Es la pieza propia del hero hasta que llegue el botón base de la tarea 0.8, que la sustituirá.
 */
export function HeroCta({ to, variant, children }: HeroCtaProps) {
  const className = `hero-cta hero-cta--${variant}`
  if (variant === 'ghost') {
    return (
      <GlassSurface as={Link} to={to} className={className}>
        {children}
      </GlassSurface>
    )
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  )
}
