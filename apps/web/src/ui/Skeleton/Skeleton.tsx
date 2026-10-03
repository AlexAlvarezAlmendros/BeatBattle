import type { CSSProperties, HTMLAttributes } from 'react'
import { t } from '../../i18n'
import { cx } from '../forceState'
import styles from './Skeleton.module.css'

export type SkeletonShape = 'block' | 'text' | 'circle'

export interface SkeletonProps {
  shape?: SkeletonShape
  /** Ancho CSS (`'100%'`, `'4.5em'`, `48`). Por defecto, todo el ancho. */
  width?: CSSProperties['width']
  /** Alto CSS. Por defecto, una línea de texto (`text`) o lo mismo que el ancho (`circle`). */
  height?: CSSProperties['height']
  className?: string
}

/**
 * Esqueleto de carga (§3.3): placa con la forma final y la trama de relleno al 20 % que barre en
 * diagonal; con «reducir movimiento», la trama fija (Anexo E). Nunca *spinners*. Es decorativo
 * (`aria-hidden`): quien lo usa marca su región con `aria-busy` y un texto de «Cargando…» (ver
 * `SkeletonGroup`).
 */
export function Skeleton({ shape = 'block', width, height, className }: SkeletonProps) {
  return (
    <span
      className={cx(styles.skeleton, styles[shape], className)}
      style={{ width, height: height ?? (shape === 'circle' ? width : undefined) }}
      aria-hidden="true"
      data-skeleton={shape}
    />
  )
}

/**
 * Región que está cargando: `aria-busy` y un «Cargando…» para lectores de pantalla, con los
 * esqueletos dentro.
 */
export function SkeletonGroup({
  label,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { label?: string }) {
  return (
    <div {...rest} className={cx(styles.group, className)} aria-busy="true">
      <span className="sr-only">{label ?? t('ui.skeleton.loading')}</span>
      {children}
    </div>
  )
}
