import { logo } from '@beatbattle/shared/tokens'
import { useId } from 'react'
import { t } from '../../i18n'
import { cx } from '../forceState'
import styles from './GameLogo.module.css'

interface LogoLine {
  key: 'beat' | 'battle'
  x: number
  y: number
  size: number
  /** Ancho al que se ajusta la palabra (`textLength`): el logo mide lo mismo con cualquier fuente. */
  length: number
  red: boolean
}

/** Composición en dos líneas (la de la pantalla de título y del menú) y en una (móvil bajo). */
const LAYOUTS = {
  full: {
    viewBox: `-20 -10 ${logo.canvas} 440`,
    lines: [
      { key: 'beat', x: 392, y: 168, size: 168, length: 560, red: true },
      { key: 'battle', x: 24, y: 384, size: 214, length: 940, red: false },
    ],
  },
  compact: {
    viewBox: '-20 -10 1300 190',
    lines: [
      { key: 'beat', x: 0, y: 150, size: 168, length: 470, red: true },
      { key: 'battle', x: 500, y: 150, size: 168, length: 760, red: false },
    ],
  },
} satisfies Record<string, { viewBox: string; lines: readonly LogoLine[] }>

/** Líneas de velocidad detrás de «BEAT» (unidades del lienzo): alto, inicio y color. */
const SPEED_LINES = [
  { y: 46, h: 18, x0: 150, white: true },
  { y: 76, h: 34, x0: 40, white: false },
  { y: 122, h: 12, x0: 214, white: true },
  { y: 142, h: 22, x0: 96, white: false },
] as const
const SPEED_END = 470

export interface GameLogoProps {
  /** Una sola línea (móvil bajo, §3.8.3). */
  compact?: boolean
  className?: string
}

/**
 * Logo del juego «BEAT BATTLE» (guía §3.2 «Trazos», §3.8.1): Anybody cursiva 900 al 150 %, «BEAT» en
 * rojo y «BATTLE» en blanco, con contorno negro de 8 unidades y filete blanco exterior de 3 sobre un
 * lienzo de 1040 de ancho, extrusión de 12 capas desplazadas (0,9; 1,1) rellena de trama y líneas de
 * velocidad. Es el generador `logo()` de las maquetas aprobadas (`final.js`) en JSX, con los colores por
 * token (`GameLogo.module.css`) y las medidas del espejo `logo`. Decorativo: el nombre del juego lo
 * lleva el `<h1>` de la pantalla.
 */
export function GameLogo({ compact = false, className }: GameLogoProps) {
  const id = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const layout = compact ? LAYOUTS.compact : LAYOUTS.full
  const ref = (name: string) => `${id}-${name}`
  const url = (name: string) => `url(#${ref(name)})`
  const word = (line: LogoLine, fill: string, extra?: { className?: string }) => (
    <text
      key={line.key}
      x={line.x}
      y={line.y}
      fontSize={line.size}
      textLength={line.length}
      lengthAdjust="spacingAndGlyphs"
      fill={fill}
      className={extra?.className}
    >
      {t(`ui.gameLogo.${line.key}`)}
    </text>
  )
  const layers = Array.from({ length: logo.depth }, (_, index) => logo.depth - index)
  return (
    <svg
      viewBox={layout.viewBox}
      className={cx(styles.logo, compact && styles.compact, className)}
      aria-hidden="true"
      focusable="false"
      data-game-logo={compact ? 'compact' : 'full'}
    >
      <defs>
        <pattern id={ref('dots')} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" className={styles.dotsGround} />
          <circle cx="4" cy="4" r="2.3" className={styles.dotsInk} />
        </pattern>
        <linearGradient id={ref('face')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={styles.white} />
          <stop offset=".52" className={styles.white} />
          <stop offset=".52" className={styles.greyDark} />
          <stop offset="1" className={styles.greyLight} />
        </linearGradient>
        <linearGradient id={ref('face-red')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={styles.redLight} />
          <stop offset=".52" className={styles.red} />
          <stop offset=".52" className={styles.redDark} />
          <stop offset="1" className={styles.redMid} />
        </linearGradient>
        <linearGradient id={ref('fade-white')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className={cx(styles.white, styles.clear)} />
          <stop offset=".55" className={cx(styles.white, styles.solidStop)} />
        </linearGradient>
        <linearGradient id={ref('fade-red')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className={cx(styles.red, styles.clear)} />
          <stop offset=".45" className={styles.red} />
        </linearGradient>
        <filter id={ref('outline')} x="-8%" y="-12%" width="116%" height="130%">
          <feMorphology in="SourceAlpha" operator="dilate" radius={logo.outline} result="inner" />
          <feFlood className={styles.floodBlack} />
          <feComposite in2="inner" operator="in" result="black" />
          <feMorphology in="SourceAlpha" operator="dilate" radius={logo.outline + logo.rim} result="outer" />
          <feFlood className={styles.floodWhite} />
          <feComposite in2="outer" operator="in" result="rim" />
          <feMerge>
            <feMergeNode in="rim" />
            <feMergeNode in="black" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {!compact && (
        <g>
          {SPEED_LINES.map((bar) => {
            const shift = bar.h * 0.42
            return (
              <polygon
                key={bar.y}
                points={`${bar.x0 + shift},${bar.y} ${SPEED_END + shift},${bar.y} ${SPEED_END},${bar.y + bar.h} ${bar.x0},${bar.y + bar.h}`}
                fill={url(bar.white ? 'fade-white' : 'fade-red')}
              />
            )
          })}
        </g>
      )}
      <g className={styles.word} filter={url('outline')}>
        {layers.map((layer) => (
          <g key={layer} transform={`translate(${layer * logo.stepX},${layer * logo.stepY})`}>
            {layout.lines.map((line) => word(line, url('dots')))}
          </g>
        ))}
        {layout.lines.map((line) =>
          word(line, url(line.red ? 'face-red' : 'face'), { className: styles.face }),
        )}
      </g>
    </svg>
  )
}
