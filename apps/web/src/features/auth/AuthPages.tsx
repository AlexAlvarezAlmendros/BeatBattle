import { CONSENT_TEXT_VERSIONS, NOTICE_KEYS, type NoticeKey, usernameProblem } from '@beatbattle/shared'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { paths } from '../../app/paths'
import { ScreenPage } from '../../app/ScreenPage'
import { t } from '../../i18n'
import { Button } from '../../ui/Button'
import { FilterChip } from '../../ui/Chip'
import { TextField } from '../../ui/Field'
import { useIdleFormKeys } from '../../ui/hooks/useIdleFormKeys'
import { authClient } from '../account/authClient'
import { authErrorCode, authErrorText, type Errors, placeError, textOf } from '../account/authErrors'
import { Done, focusFirstInvalid, PaperNotice, StrengthMeter } from '../account/FormBits'
import { useSession } from '../account/session'
import styles from './AuthPages.module.css'
import { TitlePiece } from './TitlePiece'

/*
 * Pantallas de cuenta (guía §2.3, §3.8.14; tarea 2.15): «CONTINUAR PARTIDA» (`/entrar`), «NUEVO JUGADOR»
 * (`/registro`), `/verificar` y `/recuperar`, en el marco simple con la composición de la pantalla de título:
 * el logo grande con su lockup a la izquierda y el panel opaco con el formulario a la derecha. El primer
 * elemento de cada pantalla es el primer campo. Los errores dicen lo que pasa con las palabras de §2.3, en
 * el campo al que se refieren o, si no son de un campo, en un aviso de papel encima del botón.
 */

function AuthScreen({
  title,
  kicker,
  summary,
  children,
}: {
  title: string
  kicker: string
  summary?: ReactNode
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // El primer elemento de juego es el primer campo (§3.8.14): ↑↓ e Intro en reposo van a él.
  useIdleFormKeys(panelRef)
  return (
    <ScreenPage title={title} kicker={kicker} summary={summary} piece={<TitlePiece />} layout="title">
      <div ref={panelRef} className={styles.panel}>
        {children}
      </div>
    </ScreenPage>
  )
}

/** Google y Discord como botones neutros (§3.8.14). */
function SocialButtons({ verb }: { verb: 'signIn' | 'signUp' }) {
  const [busy, setBusy] = useState<string | null>(null)
  const go = async (provider: 'google' | 'discord') => {
    setBusy(provider)
    // Si el proveedor no deja entrar o la cuenta no se puede unir, Better Auth vuelve a `/entrar?error=…`.
    await authClient.signIn.social({
      provider,
      callbackURL: '/',
      newUserCallbackURL: paths.welcome(),
      errorCallbackURL: paths.signIn(),
    })
    setBusy(null)
  }
  return (
    <fieldset className={styles.social}>
      <legend className="sr-only">{t('account.social.label')}</legend>
      {(['google', 'discord'] as const).map((provider) => (
        <Button
          key={provider}
          variant="outline"
          fullWidth
          loading={busy === provider}
          onClick={() => void go(provider)}
        >
          {t(`account.social.${verb}.${provider}`)}
        </Button>
      ))}
    </fieldset>
  )
}

/** `/entrar`: email o nombre de productor y contraseña. */
export function SignInPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [identity, setIdentity] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)
  // Vuelta de Google o Discord con un error (`RF-AUTH-05`): la cuenta del mismo email no se ha unido.
  const socialError = params.get('error')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    setBusy(true)
    setErrors({})
    const byEmail = identity.includes('@')
    const result = byEmail
      ? await authClient.signIn.email({ email: identity.trim(), password })
      : await authClient.signIn.username({ username: identity.trim(), password })
    setBusy(false)
    if (result.error) {
      setErrors({ form: authErrorCode(result.error) })
      focusFirstInvalid(form)
      return
    }
    await useSession.getState().refresh()
    navigate(params.get('next') ?? '/')
  }

  const resend = async () => {
    await authClient.sendVerificationEmail({ email: identity.trim(), callbackURL: paths.verify() })
    setResent(true)
  }

  return (
    <AuthScreen
      title={t('pages.signIn.title')}
      kicker={t('frame.plates.signIn')}
      summary={t('account.signIn.summary')}
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        {socialError && (
          <PaperNotice>
            {socialError === 'account_not_linked'
              ? t('account.social.notLinked')
              : t('account.social.failed')}
          </PaperNotice>
        )}
        <TextField
          label={t('account.fields.identity')}
          autoComplete="username"
          value={identity}
          onChange={(event) => setIdentity(event.target.value)}
          required
        />
        <TextField
          label={t('account.fields.password')}
          type="password"
          revealable
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {errors.form && (
          <PaperNotice
            action={
              errors.form === 'EMAIL_NOT_VERIFIED' && identity.includes('@') ? (
                resent ? (
                  <Done>{t('account.verify.resent')}</Done>
                ) : (
                  <button type="button" className={styles.inlineAction} onClick={() => void resend()}>
                    {t('account.verify.resend')}
                  </button>
                )
              ) : undefined
            }
          >
            {textOf(errors.form)}
          </PaperNotice>
        )}
        <Button type="submit" fullWidth loading={busy} keyHint={t('frame.keys.glyph.enter')}>
          {t('account.signIn.submit')}
        </Button>
        <p className={styles.links}>
          <Link to={paths.recover()}>{t('account.signIn.forgot')}</Link>
          <Link to={paths.signUp()}>{t('account.signIn.create')}</Link>
        </p>
      </form>
      <SocialButtons verb="signIn" />
    </AuthScreen>
  )
}

/** Los avisos de la batalla que se ofrecen en el registro, marcados (§2.3). */
const SIGNUP_NOTICES: readonly NoticeKey[] = NOTICE_KEYS

/** `/registro`: email, nombre de productor, contraseña con medidor, avisos y consentimientos. */
export function SignUpPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [notices, setNotices] = useState<Record<NoticeKey, boolean>>(
    () => Object.fromEntries(SIGNUP_NOTICES.map((key) => [key, true])) as Record<NoticeKey, boolean>,
  )
  const [marketing, setMarketing] = useState(false)
  const [otpNewsletter, setOtpNewsletter] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  const checkUsername = () => {
    const problem = username ? usernameProblem(username) : null
    setErrors((current) => ({ ...current, username: problem ?? undefined }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const local: Errors = {}
    const problem = usernameProblem(username)
    if (problem) local.username = problem
    if (password.length < 12) local.password = 'PASSWORD_TOO_SHORT'
    if (!email.includes('@')) local.email = 'INVALID_EMAIL'
    if (Object.keys(local).length > 0) {
      setErrors(local)
      focusFirstInvalid(form)
      return
    }
    setBusy(true)
    setErrors({})
    const result = await authClient.signUp.email({
      email: email.trim(),
      password,
      name: username,
      username,
      displayUsername: username,
      callbackURL: paths.verify(),
      // biome-ignore lint/suspicious/noExplicitAny: campo propio del alta (las casillas, `RF-NOTIF-16`)
      ...({ consents: { notices, marketing, otpNewsletter } } as any),
    })
    setBusy(false)
    if (result.error) {
      setErrors(placeError(result.error))
      focusFirstInvalid(form)
      return
    }
    navigate(`${paths.verify()}?email=${encodeURIComponent(email.trim())}`)
  }

  return (
    <AuthScreen
      title={t('pages.signUp.title')}
      kicker={t('frame.plates.signUp')}
      summary={t('account.signUp.summary')}
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label={t('account.fields.email')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={textOf(errors.email)}
          required
        />
        <TextField
          label={t('account.fields.username')}
          autoComplete="username"
          hint={t('account.signUp.usernameHint')}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          onBlur={checkUsername}
          error={textOf(errors.username)}
          required
        />
        <TextField
          label={t('account.fields.password')}
          type="password"
          revealable
          autoComplete="new-password"
          hint={t('account.signUp.passwordHint')}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={textOf(errors.password)}
          below={<StrengthMeter password={password} userInputs={[email, username]} />}
          required
        />
        <fieldset className={styles.choices} aria-describedby="signup-notices-help">
          <legend className={styles.legend}>{t('account.signUp.noticesTitle')}</legend>
          <p id="signup-notices-help" className={styles.legendHelp}>
            {t('account.signUp.noticesHelp')}
          </p>
          <div className={styles.chips}>
            {SIGNUP_NOTICES.map((key) => (
              <FilterChip
                key={key}
                variant="plate"
                label={t(`account.notices.${key}`)}
                pressed={notices[key]}
                onChange={(pressed) => setNotices((current) => ({ ...current, [key]: pressed }))}
              />
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.choices}>
          <legend className={styles.legend}>{t('account.signUp.consentsTitle')}</legend>
          <FilterChip
            variant="plate"
            label={t('account.consents.marketing')}
            pressed={marketing}
            onChange={setMarketing}
            data-consent-version={CONSENT_TEXT_VERSIONS.marketing}
          />
          <FilterChip
            variant="plate"
            label={t('account.consents.otpNewsletter')}
            pressed={otpNewsletter}
            onChange={setOtpNewsletter}
            data-consent-version={CONSENT_TEXT_VERSIONS.otp_newsletter}
          />
        </fieldset>
        {errors.form && <PaperNotice>{textOf(errors.form)}</PaperNotice>}
        <p className={styles.legal}>
          {t('account.signUp.legalBefore')}{' '}
          <Link to={paths.legal('bases')}>{t('account.signUp.legalRules')}</Link>{' '}
          {t('account.signUp.legalAnd')}{' '}
          <Link to={paths.legal('privacidad')}>{t('account.signUp.legalPrivacy')}</Link>.
        </p>
        <Button type="submit" fullWidth loading={busy} keyHint={t('frame.keys.glyph.enter')}>
          {t('account.signUp.submit')}
        </Button>
        <p className={styles.links}>
          <Link to={paths.signIn()}>{t('account.signUp.haveAccount')}</Link>
        </p>
      </form>
      <SocialButtons verb="signUp" />
    </AuthScreen>
  )
}

/** Segundos entre dos reenvíos del email de verificación. */
const RESEND_COOLDOWN_S = 60

/** `/verificar`: «te hemos enviado un enlace», el enlace caducado o usado, y el email ya verificado. */
export function VerifyPage() {
  const [params] = useSearchParams()
  const me = useSession((state) => state.me)
  const status = useSession((state) => state.status)
  const email = params.get('email') ?? me?.email ?? ''
  const error = params.get('error')
  const [cooldown, setCooldown] = useState(0)
  const [typed, setTyped] = useState(email)
  const timer = useRef<number | undefined>(undefined)

  // Al volver del enlace, Better Auth ya ha dejado la sesión: se vuelve a leer.
  useEffect(() => {
    void useSession.getState().refresh()
    return () => window.clearInterval(timer.current)
  }, [])

  const resend = async (address: string) => {
    if (!address.includes('@') || cooldown > 0) return
    await authClient.sendVerificationEmail({ email: address.trim(), callbackURL: paths.verify() })
    setCooldown(RESEND_COOLDOWN_S)
    timer.current = window.setInterval(() => {
      setCooldown((seconds) => {
        if (seconds > 1) return seconds - 1
        window.clearInterval(timer.current)
        return 0
      })
    }, 1000)
  }

  const verified = status === 'signedIn' && me?.emailVerified && !error
  return (
    <AuthScreen title={t('pages.verify.title')} kicker={t('frame.plates.account')}>
      {verified ? (
        <div className={styles.form}>
          <Done>{t('account.verify.done', { name: me.displayUsername })}</Done>
          <Button to={paths.welcome()} fullWidth keyHint={t('frame.keys.glyph.enter')}>
            {t('account.verify.continue')}
          </Button>
        </div>
      ) : (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            void resend(typed)
          }}
          noValidate
        >
          {error ? (
            <PaperNotice>
              {authErrorText(error === 'TOKEN_EXPIRED' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN')}
            </PaperNotice>
          ) : (
            <p className={styles.lead}>
              {email ? t('account.verify.sentTo', { email }) : t('account.verify.sent')}
            </p>
          )}
          <p className={styles.note}>{t('account.verify.expires')}</p>
          {!email && (
            <TextField
              label={t('account.fields.email')}
              type="email"
              autoComplete="email"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          )}
          <Button
            type="submit"
            variant="outline"
            fullWidth
            disabled={cooldown > 0}
            disabledReason={cooldown > 0 ? t('account.verify.wait', { seconds: cooldown }) : undefined}
          >
            {t('account.verify.resend')}
          </Button>
          {cooldown > 0 && <Done>{t('account.verify.resent')}</Done>}
        </form>
      )}
    </AuthScreen>
  )
}

/** `/recuperar`: pedir el enlace y, al volver con él (`?token=`), elegir la contraseña nueva. */
export function RecoverPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const error = params.get('error')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'changed'>('idle')
  const [errors, setErrors] = useState<Errors>({})

  const request = async (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    if (!email.includes('@')) {
      setErrors({ email: 'INVALID_EMAIL' })
      focusFirstInvalid(form)
      return
    }
    setState('busy')
    const result = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: paths.recover() })
    if (result.error) {
      setErrors({ form: authErrorCode(result.error) })
      focusFirstInvalid(form)
      setState('idle')
      return
    }
    setState('sent')
  }

  const change = async (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    if (password.length < 12) {
      setErrors({ password: 'PASSWORD_TOO_SHORT' })
      focusFirstInvalid(form)
      return
    }
    setState('busy')
    const result = await authClient.resetPassword({ newPassword: password, token: token ?? '' })
    if (result.error) {
      setErrors(placeError(result.error))
      focusFirstInvalid(form)
      setState('idle')
      return
    }
    useSession.getState().clear()
    setState('changed')
  }

  return (
    <AuthScreen title={t('pages.recover.title')} kicker={t('frame.plates.account')}>
      {state === 'changed' ? (
        <div className={styles.form}>
          <Done>{t('account.recover.changed')}</Done>
          <Button to={paths.signIn()} fullWidth keyHint={t('frame.keys.glyph.enter')}>
            {t('account.signIn.submit')}
          </Button>
        </div>
      ) : token ? (
        <form className={styles.form} onSubmit={change} noValidate>
          <p className={styles.lead}>{t('account.recover.choose')}</p>
          <TextField
            label={t('account.fields.newPassword')}
            type="password"
            revealable
            autoComplete="new-password"
            hint={t('account.signUp.passwordHint')}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={textOf(errors.password)}
            below={<StrengthMeter password={password} userInputs={[]} />}
          />
          {errors.form && <PaperNotice>{textOf(errors.form)}</PaperNotice>}
          <p className={styles.note}>{t('account.recover.sessions')}</p>
          <Button type="submit" fullWidth loading={state === 'busy'} keyHint={t('frame.keys.glyph.enter')}>
            {t('account.recover.save')}
          </Button>
        </form>
      ) : state === 'sent' ? (
        <div className={styles.form}>
          <Done>{t('account.recover.sent')}</Done>
          <p className={styles.note}>{t('account.recover.expires')}</p>
        </div>
      ) : (
        <form className={styles.form} onSubmit={request} noValidate>
          {error && <PaperNotice>{authErrorText('INVALID_TOKEN')}</PaperNotice>}
          <p className={styles.lead}>{t('account.recover.summary')}</p>
          <TextField
            label={t('account.fields.email')}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={textOf(errors.email)}
          />
          {errors.form && <PaperNotice>{textOf(errors.form)}</PaperNotice>}
          <Button type="submit" fullWidth loading={state === 'busy'} keyHint={t('frame.keys.glyph.enter')}>
            {t('account.recover.request')}
          </Button>
          <p className={styles.links}>
            <Link to={paths.signIn()}>{t('account.signUp.haveAccount')}</Link>
          </p>
        </form>
      )}
    </AuthScreen>
  )
}
