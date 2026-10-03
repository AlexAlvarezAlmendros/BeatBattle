import { PlaceholderPage } from '../../app/PlaceholderPage'
import { t } from '../../i18n'
import { GameLogo } from '../../ui/GameLogo'
import { TitleLockup } from '../../ui/TitleLockup'
import styles from './AuthPages.module.css'

/*
 * Pantallas de autenticación (§2.3, §3.8.14, Fase 2): en el marco simple, como la pantalla de título
 * (maqueta `00-titulo`) —«CONTINUAR PARTIDA» (entrar) y «NUEVO JUGADOR» (registro) en la placa del
 * HUD—, con el logo y su lockup «TORNEO SEMANAL DE PRODUCTORES by [OTP.]» a la izquierda, sobre los
 * rayos, y el panel opaco a la derecha. Van juntas en un mismo trozo: quien abre una suele pasar a otra
 * (entrar → recuperar, registro → verificar). Provisionales.
 */

/** El logo del juego con el mismo lockup que el menú (§3.1 «La firma»: autenticación). */
function TitlePiece() {
  return (
    <div className={styles.title} data-title-piece="">
      <GameLogo className={styles.logo} />
      <TitleLockup className={styles.lockup} />
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
      piece={<TitlePiece />}
      layout="title"
    />
  )
}

/** `/registro` */
export function SignUpPage() {
  return (
    <PlaceholderPage
      title={t('pages.signUp.title')}
      kicker={t('frame.plates.signUp')}
      summary={t('pages.signUp.summary')}
      piece={<TitlePiece />}
      layout="title"
    />
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
