import type { AnchorHTMLAttributes, Ref } from 'react'
import { OTHER_PEOPLE_URL } from '../../app/paths'
import { t } from '../../i18n'
import { cx } from '../forceState'
import styles from './OtpSlap.module.css'
import manifest from './otp-slap.json'

/** Tamaños de la pegatina (§3.1 «La firma»). */
export type OtpSlapSize = 'title' | 'menu' | 'bar'

export const OTP_SLAP_SIZES: readonly OtpSlapSize[] = ['title', 'menu', 'bar']

/** Imágenes generadas por `tools/brand/otp-slap.mjs` (en `public/img`), a 1× y 2×. */
export const OTP_SLAP = {
  png: '/img/otp-slap.png',
  png2x: '/img/otp-slap@2x.png',
  webp: '/img/otp-slap.webp',
  webp2x: '/img/otp-slap@2x.webp',
  width: manifest.width,
  height: manifest.height,
} as const

/** A dónde lleva la firma: la home de Other People Records. */
export const OTP_SIGNATURE_HREF = `${OTHER_PEOPLE_URL}/`

export interface OtpSlapProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> {
  size?: OtpSlapSize
  /**
   * Enlace al sello (por defecto, sí). Sin enlace, la pegatina es decorativa y va dentro de un enlace
   * que ya lleva la firma (la barra de controles: «Un juego de [OTP.] Other People Records»).
   */
  linked?: boolean
  ref?: Ref<HTMLAnchorElement>
}

/** La imagen, en WebP con PNG de reserva y a 1× y 2×. `alt` vacío: el nombre lo da el enlace. */
export function OtpSlapImage({ size = 'menu', className }: { size?: OtpSlapSize; className?: string }) {
  return (
    <span className={cx(styles.slap, styles[size], className)}>
      <picture>
        <source type="image/webp" srcSet={`${OTP_SLAP.webp} 1x, ${OTP_SLAP.webp2x} 2x`} />
        <img
          src={OTP_SLAP.png}
          srcSet={`${OTP_SLAP.png} 1x, ${OTP_SLAP.png2x} 2x`}
          alt=""
          width={OTP_SLAP.width}
          height={OTP_SLAP.height}
          decoding="async"
        />
      </picture>
    </span>
  )
}

/**
 * Pegatina OTP (`OtpSlap`, guía §3.1 «La firma», §3.3, `RF-OTP-01`): la firma del sello en todas las
 * pantallas. Enlaza a `otherpeople.es` en otra pestaña con el nombre accesible «by Other People (abre
 * la web del sello en una pestaña nueva)» y lleva `data-otp-signature` (lo busca el E2E de la firma en
 * cada ruta). Girada −7°; no se recolorea ni se deforma.
 *
 * Sin enlace (`linked={false}`), solo la imagen, decorativa: quien la envuelve pone el enlace, su
 * nombre y `data-otp-signature`.
 */
export function OtpSlap({ size = 'menu', linked = true, className, ...rest }: OtpSlapProps) {
  if (!linked) return <OtpSlapImage size={size} className={className} />
  return (
    <a
      {...rest}
      href={OTP_SIGNATURE_HREF}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('ui.otpSlap.label')}
      data-otp-signature=""
      className={cx(styles.link, className)}
    >
      <OtpSlapImage size={size} />
    </a>
  )
}
