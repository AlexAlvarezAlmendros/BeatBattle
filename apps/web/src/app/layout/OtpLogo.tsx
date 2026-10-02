import { t } from '../../i18n'
import { ExternalLink } from './ExternalLink'
import { OTHER_PEOPLE_HOME } from './navigation'

/** Logo *OTP.* del sello (blanco con contorno negro), copiado de `ReactOtpWeb` a 360 px en WebP. */
export const OTP_LOGO_SRC = '/img/otp-logo.webp'

/** Proporción del logo: 1443 × 933 en el original (120 × 77,6 px en la isla). */
const LOGO_WIDTH = 120
const LOGO_HEIGHT = 78

/**
 * Logo de Other People enlazado a `otherpeople.es` (guía §2.16, `RF-OTP-01`). La pieza no se
 * posiciona: lo hace quien la usa (la isla lo fija arriba a la izquierda, girado −10°).
 */
export function OtpLogo({ className }: { className?: string }) {
  return (
    <ExternalLink href={OTHER_PEOPLE_HOME} className={className}>
      <img
        src={OTP_LOGO_SRC}
        alt={t('layout.logo.alt')}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        decoding="async"
      />
    </ExternalLink>
  )
}
