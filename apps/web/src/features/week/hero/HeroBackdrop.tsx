/**
 * Capas de fondo del hero del sello (Hero.css), decorativas: llenan su contenedor posicionado.
 */

/** Rejilla roja de 60 px al 8 % con máscara radial (`.hero-grid`). En la Fase 1, «pulsa» con el beat. */
export function HeroGrid({ className }: { className?: string }) {
  return <div className={className ? `hero-grid ${className}` : 'hero-grid'} aria-hidden="true" />
}

/** Viñeta cinematográfica (`.hero-vignette`): oscurece los bordes. */
export function Vignette({ className }: { className?: string }) {
  return <div className={className ? `hero-vignette ${className}` : 'hero-vignette'} aria-hidden="true" />
}
