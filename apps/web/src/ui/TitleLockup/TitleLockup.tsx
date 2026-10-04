import { t } from '../../i18n'
import { cx } from '../forceState'
import { OTP_SIGNATURE_HREF, OtpSlapImage } from '../OtpSlap'
import styles from './TitleLockup.module.css'

/**
 * Lockup del título (guía §3.1 «La firma», §3.8.1, §3.8.3, §3.8.14): la cinta blanca «TORNEO SEMANAL DE
 * PRODUCTORES» y la firma «by [OTP.]» con la pegatina (104 px; 62 en móvil), enlazada al sello en otra
 * pestaña. Va debajo del logo del juego en la pantalla de título, el menú principal y la autenticación;
 * siempre en una fila (la cinta cede, la firma no). Cuánto cede lo decide el ancho del propio lockup,
 * que es un contenedor (`title-lockup`; los pasos, en el CSS): la fila va dentro.
 */
export function TitleLockup({ className }: { className?: string }) {
  return (
    <div className={cx(styles.lockup, className)}>
      <div className={styles.row}>
        <p className={styles.ribbon}>
          {t('home.title.ribbonStart')}
          <span className={styles.ribbonEnd}> {t('home.title.ribbonEnd')}</span>
        </p>
        <a
          className={styles.signature}
          href={OTP_SIGNATURE_HREF}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('ui.otpSlap.label')}
          data-otp-signature=""
        >
          <span className={styles.by} aria-hidden="true">
            {t('home.title.by')}
          </span>
          <OtpSlapImage size="menu" />
        </a>
      </div>
    </div>
  )
}
