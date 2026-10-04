import type { SocialNetwork } from './navigation'

/**
 * Iconos del marco, dibujados a trazo con `currentColor` (sin librería de iconos): las redes del sello,
 * la flecha de los enlaces del menú, el aspa de cerrar y la pausa y el play del marquee. Son decorativos: el nombre lo pone el texto
 * (visible u oculto) del enlace o del botón.
 */

const SVG_PROPS = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  focusable: false,
} as const

export function SocialIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  switch (network) {
    case 'instagram':
      return (
        <svg {...SVG_PROPS} className={className} aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
        </svg>
      )
    case 'youtube':
      return (
        <svg {...SVG_PROPS} className={className} aria-hidden="true">
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
          <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" />
        </svg>
      )
    case 'threads':
      return (
        <svg {...SVG_PROPS} className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8" />
        </svg>
      )
  }
}

export function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg {...SVG_PROPS} className={className} aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg {...SVG_PROPS} className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function PauseIcon({ className }: { className?: string }) {
  return (
    <svg {...SVG_PROPS} className={className} aria-hidden="true">
      <path d="M8 5v14M16 5v14" strokeWidth={3} />
    </svg>
  )
}

export function PlayIcon({ className }: { className?: string }) {
  return (
    <svg {...SVG_PROPS} className={className} aria-hidden="true">
      <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
    </svg>
  )
}
