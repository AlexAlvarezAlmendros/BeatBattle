import { PlaceholderPage } from '../../app/PlaceholderPage'
import { t } from '../../i18n'
import { GameLogo } from '../../ui/GameLogo'
import { OtpSlap } from '../../ui/OtpSlap'
import styles from './AuthPages.module.css'

/*
 * Pantallas de autenticación (§2.3, §3.8.14, Fase 2): en el marco simple, como pantallas de título
 * —«CONTINUAR PARTIDA» (entrar) y «NUEVO JUGADOR» (registro)— con el logo y su firma «by [OTP.]». Van
 * juntas en un mismo trozo: quien abre una suele pasar a otra (entrar → recuperar, registro →
 * verificar). Provisionales.
 */

/** El logo del juego con la firma del sello (§3.1 «La firma»: autenticación). */
function TitleLockup() {
  return (
    <div className={styles.lockup}>
      <GameLogo compact className={styles.logo} />
      <OtpSlap size="menu" />
    </div>
  )
}

/** `/entrar` */
export function SignInPage() {
  return (
    <PlaceholderPage
      title={t('pages.signIn.title')}
      kicker={t('frame.plates.signIn')}
      summary={t('pages.signIn.summary')}
    >
      <TitleLockup />
    </PlaceholderPage>
  )
}

/** `/registro` */
export function SignUpPage() {
  return (
    <PlaceholderPage
      title={t('pages.signUp.title')}
      kicker={t('frame.plates.signUp')}
      summary={t('pages.signUp.summary')}
    >
      <TitleLockup />
    </PlaceholderPage>
  )
}

/** `/verificar` */
export function VerifyPage() {
  return <PlaceholderPage title={t('pages.verify.title')} summary={t('pages.verify.summary')} />
}

/** `/recuperar` */
export function RecoverPage() {
  return <PlaceholderPage title={t('pages.recover.title')} summary={t('pages.recover.summary')} />
}
