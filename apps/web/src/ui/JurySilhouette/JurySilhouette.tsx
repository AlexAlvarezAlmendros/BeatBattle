import { useId } from 'react'
import { cx } from '../forceState'
import styles from './JurySilhouette.module.css'

const BODY =
  'M14 470 C22 396 66 356 130 338 L160 330 C171 322 177 310 178 296 L222 296 C223 310 229 322 240 330 L270 338 C334 356 378 396 386 470 Z'
const COLLAR =
  'M128 342 C146 368 172 380 200 380 C228 380 254 368 272 342 C258 334 246 328 238 320 C228 334 215 342 200 342 C185 342 172 334 162 320 C154 328 142 334 128 342 Z'
const HEAD =
  'M200 80 C254 80 288 122 288 184 C288 248 254 302 200 302 C146 302 112 248 112 184 C112 122 146 80 200 80 Z'
const BAND = 'M104 198 C100 112 146 62 200 62 C254 62 300 112 296 198'

/**
 * Silueta del jurado (guía §3.4.6; maqueta `03-jurado`): el lado **TÚ** del Modo Jurado, siempre la misma
 * para todos (cabeza sin rasgos, auriculares rojos, sudadera, contraluz blanca hacia fuera y roja con trama
 * hacia la entrada, extrusión roja). No representa a nadie ni cambia con el usuario; las entradas nunca
 * tienen silueta humana. Decorativa: su nombre va en una placa aparte.
 */
export function JurySilhouette({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  const url = (name: string) => `url(#${id}-${name})`
  return (
    <svg viewBox="0 0 400 470" className={cx(styles.juror, className)} aria-hidden="true" focusable="false">
      <defs>
        <pattern
          id={`${id}-dots`}
          width="9"
          height="9"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(30)"
        >
          <rect width="9" height="9" className={styles.dotsBase} />
          <circle cx="4.5" cy="4.5" r="2.5" className={styles.dotsDot} />
        </pattern>
        <pattern
          id={`${id}-ht`}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <circle cx="3.5" cy="3.5" r="1.9" className={styles.red} />
        </pattern>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className={styles.rimOff} />
          <stop offset=".5" className={styles.rimOff} />
          <stop offset=".95" className={styles.rimOn} />
        </linearGradient>
        <mask id={`${id}-m`}>
          <rect width="400" height="470" fill={url('rim')} />
        </mask>
        <clipPath id={`${id}-c`}>
          <path d={BODY} />
          <path d={HEAD} />
        </clipPath>
        <clipPath id={`${id}-L`}>
          <rect x="0" y="0" width="200" height="470" />
        </clipPath>
        <clipPath id={`${id}-R`}>
          <rect x="200" y="0" width="200" height="470" />
        </clipPath>
      </defs>
      {/* Extrusión roja con trama. */}
      <g transform="translate(13,11)" fill={url('dots')}>
        <path d={BODY} />
        <path d={HEAD} />
        <path d={BAND} fill="none" stroke={url('dots')} strokeWidth="22" />
        <rect x="74" y="152" width="50" height="96" rx="14" />
        <rect x="276" y="152" width="50" height="96" rx="14" />
      </g>
      <g className={styles.shape} strokeWidth="10" strokeLinejoin="round">
        <path d={BODY} />
        <path d={HEAD} />
      </g>
      <g clipPath={url('c')}>
        <rect x="0" y="0" width="400" height="470" fill={url('ht')} mask={url('m')} />
      </g>
      <path d={COLLAR} className={styles.collar} strokeWidth="6" strokeLinejoin="round" />
      <path
        d="M187 362 L184 424 M213 362 L216 424"
        className={styles.strings}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <g
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
        clipPath={url('L')}
        className={styles.rimWhite}
      >
        <path d={BODY} strokeWidth="4" />
        <path d={HEAD} strokeWidth="4" />
      </g>
      <g
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
        clipPath={url('R')}
        className={styles.rimRed}
      >
        <path d={BODY} strokeWidth="5" />
        <path d={HEAD} strokeWidth="5" />
      </g>
      <path d={BAND} fill="none" className={styles.bandBack} strokeWidth="30" strokeLinecap="round" />
      <path d={BAND} fill="none" className={styles.bandFront} strokeWidth="18" strokeLinecap="round" />
      <path
        d="M114 168 C114 112 150 78 200 78"
        fill="none"
        className={styles.shine}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g className={styles.cups} strokeWidth="8">
        <rect x="74" y="150" width="50" height="96" rx="14" />
        <rect x="276" y="150" width="50" height="96" rx="14" />
      </g>
      <rect x="86" y="166" width="9" height="62" rx="4" className={styles.glint} />
      <rect x="288" y="166" width="9" height="62" rx="4" className={styles.glintDim} />
    </svg>
  )
}
