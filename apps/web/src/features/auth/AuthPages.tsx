import { PlaceholderPage } from '../../app/PlaceholderPage'
import { t } from '../../i18n'

/*
 * Pantallas de autenticación (§2.3, Fase 2). Van juntas en un mismo trozo: quien abre una suele pasar
 * a otra (entrar → recuperar, registro → verificar). Provisionales (0.10).
 */

/** `/entrar` */
export function SignInPage() {
  return <PlaceholderPage title={t('pages.signIn.title')} summary={t('pages.signIn.summary')} />
}

/** `/registro` */
export function SignUpPage() {
  return <PlaceholderPage title={t('pages.signUp.title')} summary={t('pages.signUp.summary')} />
}

/** `/verificar` */
export function VerifyPage() {
  return <PlaceholderPage title={t('pages.verify.title')} summary={t('pages.verify.summary')} />
}

/** `/recuperar` */
export function RecoverPage() {
  return <PlaceholderPage title={t('pages.recover.title')} summary={t('pages.recover.summary')} />
}
