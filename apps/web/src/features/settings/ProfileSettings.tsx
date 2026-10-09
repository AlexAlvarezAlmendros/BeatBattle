import { levelProgress, rankTitle } from '@beatbattle/rules'
import {
  ACCENTS,
  type Accent,
  BIO_MAX,
  CITY_MAX,
  LINK_MAX,
  type OwnProfile,
  OwnProfileSchema,
  PROFILE_LINK_KINDS,
  type ProfileLinkKind,
  type ProfileUpdate,
  USERNAME_MAX,
} from '@beatbattle/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, type FormEvent, useRef, useState } from 'react'
import { paths } from '../../app/paths'
import { DATE_FORMATS, formatDate, t } from '../../i18n'
import { ApiClientError, apiFetch } from '../../net/api'
import { Button } from '../../ui/Button'
import { TextAreaField, TextField } from '../../ui/Field'
import { ProducerCard } from '../../ui/ProducerCard'
import { Done, PaperNotice } from '../account/FormBits'
import { RequireSession } from '../account/RequireSession'
import { initialsOf, useSession } from '../account/session'
import { avatarProblem, deleteAvatar, uploadAvatar } from './avatarUpload'
import { SettingsGroup, SettingsSection, SettingsStatus } from './SettingsSection'
import styles from './SettingsSection.module.css'

const PROFILE_KEY = ['me', 'profile'] as const

/**
 * `/ajustes/perfil` (guía §2.3, tarea 2.18): el nombre de productor (una vez cada 30 días, `RF-PRF-03`) y
 * la carta: bio, ciudad, enlaces y acento, sobre `GET`/`PUT /api/me/profile` y `PUT /api/me/username`. El
 * avatar llega con la 2.19.
 */
export function ProfileSettingsPage() {
  const signedIn = useSession((state) => state.status === 'signedIn')
  return (
    <SettingsSection
      section="profile"
      summary={t('settings.profile.summary')}
      piece={signedIn ? <CardPiece /> : undefined}
    >
      <RequireSession reason={t('settings.profile.require')}>
        <ProfileEditor />
      </RequireSession>
    </SettingsSection>
  )
}

const dateOf = (ms: number) => formatDate(ms, DATE_FORMATS.date)

/** El texto de un error de la API del perfil, en las palabras del editor. */
function errorText(error: unknown): string {
  if (!(error instanceof ApiClientError)) return t('settings.profile.errors.unknown')
  const details = error.details as { availableAt?: number; kind?: ProfileLinkKind } | undefined
  switch (error.code) {
    case 'USERNAME_TAKEN':
      return t('settings.profile.errors.usernameTaken')
    case 'USERNAME_RESERVED':
      return t('settings.profile.errors.usernameReserved')
    case 'USERNAME_INVALID':
    case 'VALIDATION_FAILED':
      return t('settings.profile.errors.usernameInvalid')
    case 'USERNAME_CHANGE_TOO_SOON':
      return t('settings.profile.errors.usernameChangeTooSoon', {
        date: details?.availableAt ? dateOf(details.availableAt) : '',
      })
    case 'INVALID_LINK':
      return t('settings.profile.errors.invalidLink', {
        site: details?.kind ? t(`pages.profile.links.${details.kind}`) : '',
      })
    case 'RATE_LIMITED':
      return t('settings.profile.errors.rateLimited')
    default:
      return t('settings.profile.errors.unknown')
  }
}

function ProfileEditor() {
  const profile = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: ({ signal }) => apiFetch('/api/me/profile', { schema: OwnProfileSchema, signal }),
  })
  if (profile.isPending) return <SettingsStatus busy>{t('account.require.loading')}</SettingsStatus>
  if (profile.isError)
    return (
      <PaperNotice
        action={
          <Button variant="outline" size="sm" onClick={() => void profile.refetch()}>
            {t('settings.profile.retry')}
          </Button>
        }
      >
        {t('settings.profile.loadError')}
      </PaperNotice>
    )
  return (
    <>
      <AvatarForm profile={profile.data} />
      <UsernameForm profile={profile.data} />
      <CardForm profile={profile.data} />
    </>
  )
}

function UsernameForm({ profile }: { profile: OwnProfile }) {
  const client = useQueryClient()
  const [username, setUsername] = useState(profile.displayUsername)
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const waitUntil = profile.usernameChangeAvailableAt

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setState('busy')
    try {
      const data = await apiFetch('/api/me/username', {
        method: 'PUT',
        body: { username: username.trim() },
        schema: OwnProfileSchema,
      })
      client.setQueryData(PROFILE_KEY, data)
      // El HUD y la carta toman el nombre nuevo.
      await useSession.getState().refresh()
      setState('done')
    } catch (caught) {
      setError(errorText(caught))
      setState('idle')
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <SettingsGroup title={t('settings.profile.username.title')} layout="stack">
        {state === 'done' && (
          <Done>{t('settings.profile.username.changed', { name: profile.displayUsername })}</Done>
        )}
        <TextField
          label={t('settings.profile.username.label')}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={USERNAME_MAX}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          hint={
            waitUntil
              ? t('settings.profile.username.availableAt', { date: dateOf(waitUntil) })
              : t('settings.profile.username.hint')
          }
          error={error}
        />
        <Button
          type="submit"
          variant="outline"
          loading={state === 'busy'}
          disabled={username.trim() === profile.displayUsername}
          disabledReason={t('settings.profile.username.unchanged')}
        >
          {t('settings.profile.username.submit')}
        </Button>
      </SettingsGroup>
    </form>
  )
}

type LinkDraft = Record<ProfileLinkKind, string>

function CardForm({ profile }: { profile: OwnProfile }) {
  const client = useQueryClient()
  const [bio, setBio] = useState(profile.bio ?? '')
  const [city, setCity] = useState(profile.city ?? '')
  const [accent, setAccent] = useState<Accent>(profile.accent)
  const [links, setLinks] = useState<LinkDraft>(
    () =>
      Object.fromEntries(PROFILE_LINK_KINDS.map((kind) => [kind, profile.links[kind] ?? ''])) as LinkDraft,
  )
  const [state, setState] = useState<'idle' | 'busy' | 'saved'>('idle')
  const [error, setError] = useState<{ text: string; kind?: ProfileLinkKind } | null>(null)
  // Al editar algo, el «Guardado.» de antes deja de valer.
  const edited = () => setState((value) => (value === 'saved' ? 'idle' : value))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const patch: ProfileUpdate = {}
    if (bio.trim() !== (profile.bio ?? '')) patch.bio = bio
    if (city.trim() !== (profile.city ?? '')) patch.city = city
    if (accent !== profile.accent) patch.accent = accent
    const changed = PROFILE_LINK_KINDS.filter((kind) => links[kind].trim() !== (profile.links[kind] ?? ''))
    if (changed.length > 0)
      patch.links = Object.fromEntries(changed.map((kind) => [kind, links[kind].trim() || null]))
    if (Object.keys(patch).length === 0) return setState('saved')
    setState('busy')
    try {
      const data = await apiFetch('/api/me/profile', { method: 'PUT', body: patch, schema: OwnProfileSchema })
      client.setQueryData(PROFILE_KEY, data)
      setLinks(
        Object.fromEntries(PROFILE_LINK_KINDS.map((kind) => [kind, data.links[kind] ?? ''])) as LinkDraft,
      )
      setBio(data.bio ?? '')
      setCity(data.city ?? '')
      setState('saved')
    } catch (caught) {
      const kind =
        caught instanceof ApiClientError && caught.code === 'INVALID_LINK'
          ? (caught.details as { kind?: ProfileLinkKind } | undefined)?.kind
          : undefined
      setError({ text: errorText(caught), kind })
      setState('idle')
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <SettingsGroup title={t('settings.profile.card.title')} layout="stack">
        <TextAreaField
          label={t('settings.profile.card.bio')}
          hint={t('settings.profile.card.bioHint')}
          maxLength={BIO_MAX}
          rows={2}
          value={bio}
          onChange={(event) => {
            setBio(event.target.value)
            edited()
          }}
        />
        <TextField
          label={t('settings.profile.card.city')}
          autoComplete="address-level2"
          maxLength={CITY_MAX}
          value={city}
          onChange={(event) => {
            setCity(event.target.value)
            edited()
          }}
        />
        <fieldset className={styles.group}>
          <legend className={styles.legend}>{t('settings.profile.card.accent')}</legend>
          <div className={styles.controls}>
            {ACCENTS.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={accent === value ? 'white' : 'outline'}
                aria-pressed={accent === value}
                onClick={() => {
                  setAccent(value)
                  edited()
                }}
              >
                {t(`settings.profile.card.accents.${value}`)}
              </Button>
            ))}
          </div>
        </fieldset>
      </SettingsGroup>
      <SettingsGroup
        title={t('settings.profile.links.title')}
        help={t('settings.profile.links.hint')}
        layout="stack"
      >
        <div className={styles.fieldGrid}>
          {PROFILE_LINK_KINDS.map((kind) => (
            <TextField
              key={kind}
              label={t(`pages.profile.links.${kind}`)}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={LINK_MAX}
              value={links[kind]}
              onChange={(event) => {
                setLinks((current) => ({ ...current, [kind]: event.target.value }))
                edited()
              }}
              error={error?.kind === kind ? error.text : null}
            />
          ))}
        </div>
        {error && !error.kind && <PaperNotice>{error.text}</PaperNotice>}
        <div className={styles.actionsRow}>
          <Button type="submit" loading={state === 'busy'} keyHint={t('frame.keys.glyph.enter')}>
            {t('settings.profile.save')}
          </Button>
          <Button to={paths.profile(profile.username)} variant="outline">
            {t('settings.profile.see')}
          </Button>
        </div>
        <SettingsStatus>{state === 'saved' ? t('settings.profile.saved') : ''}</SettingsStatus>
      </SettingsGroup>
    </form>
  )
}

/**
 * El avatar (tarea 2.19, `RF-PRF-02`): la vista previa en duotono, como en la carta, «Subir foto» (abre el
 * selector de archivos), «Quitar foto» y el estado. La imagen va directa a Cloudinary con la firma del
 * servidor; aquí solo se comprueba el tipo y el tamaño antes de pedirla.
 */
function AvatarForm({ profile }: { profile: OwnProfile }) {
  const client = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'removed'>('idle')
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<OwnProfile>, next: 'done' | 'removed') => {
    setError(null)
    setState('busy')
    try {
      client.setQueryData(PROFILE_KEY, await action())
      setState(next)
    } catch (caught) {
      const code = caught instanceof ApiClientError ? caught.code : null
      setError(
        code === 'SERVICE_UNAVAILABLE'
          ? t('settings.profile.avatar.errors.unavailable')
          : code === 'RATE_LIMITED'
            ? t('settings.profile.errors.rateLimited')
            : t('settings.profile.avatar.errors.failed'),
      )
      setState('idle')
    }
  }

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const problem = avatarProblem(file)
    if (problem) return setError(t(`settings.profile.avatar.errors.${problem}`))
    void run(() => uploadAvatar(file), 'done')
  }

  return (
    <SettingsGroup
      title={t('settings.profile.avatar.title')}
      help={t('settings.profile.avatar.help')}
      layout="stack"
    >
      <div className={styles.avatarRow}>
        <div className={styles.avatar} data-duotone={profile.avatarUrl ? '' : undefined}>
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={t('settings.profile.avatar.preview')} width={96} height={96} />
          ) : (
            <span aria-hidden="true">{initialsOf(profile.displayUsername)}</span>
          )}
        </div>
        <div className={styles.controls}>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={choose}
          />
          <Button
            variant="outline"
            size="sm"
            loading={state === 'busy'}
            onClick={() => input.current?.click()}
          >
            {profile.avatarUrl ? t('settings.profile.avatar.change') : t('settings.profile.avatar.upload')}
          </Button>
          {profile.avatarUrl && (
            <Button variant="outline" size="sm" onClick={() => void run(deleteAvatar, 'removed')}>
              {t('settings.profile.avatar.remove')}
            </Button>
          )}
        </div>
      </div>
      {error ? (
        <PaperNotice>{error}</PaperNotice>
      ) : (
        <SettingsStatus busy={state === 'busy'}>
          {state === 'busy'
            ? t('settings.profile.avatar.uploading')
            : state === 'done'
              ? t('settings.profile.avatar.done')
              : state === 'removed'
                ? t('settings.profile.avatar.removed')
                : ''}
        </SettingsStatus>
      )}
    </SettingsGroup>
  )
}

/**
 * La pieza de Perfil (§3.8.14, jurado de la 2.25): la carta de productor como la ven los demás, con lo
 * guardado (nombre, nivel, número y foto). Sin sesión, el emblema de la sección.
 */
function CardPiece() {
  const me = useSession((state) => state.me)
  const profile = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: ({ signal }) => apiFetch('/api/me/profile', { schema: OwnProfileSchema, signal }),
    enabled: me !== null,
  })
  if (!me || !profile.data) return null
  const data = profile.data
  const progress = levelProgress(data.xp)
  const joined = new Date(data.joinedAt)
  return (
    <div className={styles.cardPiece} aria-hidden="true">
      <ProducerCard
        name={data.displayUsername}
        initials={initialsOf(data.displayUsername)}
        cardNumber={data.cardNumber}
        level={progress.level}
        levelFraction={progress.fraction}
        rank={t(`rank.${rankTitle(progress.level)}`)}
        stats={{ wins: 0, podiums: 0, weeks: 0 }}
        since={`${String(joined.getMonth() + 1).padStart(2, '0')}/${joined.getFullYear()}`}
        avatarUrl={data.avatarUrl}
      />
    </div>
  )
}
