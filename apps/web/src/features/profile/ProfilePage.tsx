import { levelProgress, rankTitle } from '@beatbattle/rules'
import { PROFILE_LINK_KINDS, type PublicProfile, PublicProfileSchema } from '@beatbattle/shared'
import { type LoaderFunctionArgs, redirect, useLoaderData } from 'react-router'
import { paths } from '../../app/paths'
import { notFound } from '../../app/routes'
import { ScreenPage } from '../../app/ScreenPage'
import { formatDate, t } from '../../i18n'
import { ApiClientError, apiFetch } from '../../net/api'
import { Button } from '../../ui/Button'
import { DataTile, DataTileList } from '../../ui/DataTile'
import { ProducerCard } from '../../ui/ProducerCard'
import { initialsOf, useSession } from '../account/session'
import styles from './ProfilePage.module.css'

/**
 * `/p/:username` (guía §2.3, §3.8.10, tarea 2.18; `RF-PRF-01`, `-03`): la carta de productor plana en la
 * cuña y, en el panel, número y antigüedad, nombre, rango, nivel y ciudad, bio, enlaces, las seis teselas,
 * el historial, las posiciones y los logros. Lo que aún no existe (Fases 5–7) enseña su estado vacío, y
 * la semana en curso nunca aparece antes del sellado (§1.3). Un nombre que no existe pinta la 404 del
 * juego; el anterior de alguien lleva a su nombre nuevo (la API responde 301 y aquí se cambia la URL).
 */

export async function profileLoader({ params, request }: LoaderFunctionArgs): Promise<PublicProfile> {
  const name = params.username ?? ''
  let profile: PublicProfile
  try {
    profile = await apiFetch(`/api/profiles/${encodeURIComponent(name)}`, {
      schema: PublicProfileSchema,
      signal: request.signal,
    })
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound()
    throw error
  }
  if (profile.username !== name.toLowerCase()) throw redirect(paths.profile(profile.username))
  return profile
}

const TILES = ['bestPlace', 'streak', 'finalAverage', 'goldenEar', 'votesGiven', 'season'] as const

export function ProfilePage() {
  const profile = useLoaderData() as PublicProfile
  const me = useSession((state) => state.me)
  const progress = levelProgress(profile.xp)
  const rank = t(`rank.${rankTitle(progress.level)}`)
  const name = profile.displayUsername
  const joined = new Date(profile.joinedAt)
  const own = me?.username === profile.username
  return (
    <ScreenPage
      title={name}
      kicker={t('frame.plates.profile')}
      documentTitle={t('pages.profile.documentTitle', { name })}
      piece={
        <div className={styles.piece}>
          <ProducerCard
            name={name}
            initials={initialsOf(name)}
            cardNumber={profile.cardNumber}
            level={progress.level}
            levelFraction={progress.fraction}
            rank={rank}
            stats={{ wins: 0, podiums: 0, weeks: 0 }}
            since={`${String(joined.getMonth() + 1).padStart(2, '0')}/${joined.getFullYear()}`}
          />
        </div>
      }
    >
      <div className={styles.body} data-accent={profile.accent}>
        <header className={styles.head}>
          <p className="bb-label">
            {t('pages.profile.header', {
              number: String(profile.cardNumber).padStart(4, '0'),
              since: formatDate(profile.joinedAt, { month: 'long', year: 'numeric' }),
            })}
          </p>
          <p className={`bb-display ${styles.name}`} aria-hidden="true">
            {name}
          </p>
          <p className={styles.meta}>
            <strong>{rank}</strong>
            {' · '}
            {t('pages.profile.level', { level: progress.level })}
            {profile.city && ` · ${profile.city}`}
          </p>
          {profile.bio && <p className={styles.bio}>{profile.bio}</p>}
        </header>

        {(Object.keys(profile.links).length > 0 || own) && (
          <nav className={styles.links} aria-label={t('pages.profile.linksLabel', { name })}>
            {PROFILE_LINK_KINDS.filter((kind) => profile.links[kind]).map((kind) => (
              <Button
                key={kind}
                href={profile.links[kind] as string}
                target="_blank"
                rel="noopener noreferrer me"
                variant="outline"
                size="sm"
              >
                {t(`pages.profile.links.${kind}`)}
              </Button>
            ))}
            {own && (
              <Button to={paths.settings('perfil')} variant="white" size="sm">
                {t('pages.profile.edit')}
              </Button>
            )}
          </nav>
        )}

        <section aria-labelledby="profile-tiles">
          <h2 id="profile-tiles" className="sr-only">
            {t('pages.profile.tilesLabel')}
          </h2>
          <DataTileList className={styles.tiles}>
            {TILES.map((tile) => (
              <DataTile
                key={tile}
                label={t(`pages.profile.tiles.${tile}`)}
                value={
                  <>
                    <span aria-hidden="true">{t('pages.profile.noValue')}</span>
                    <span className="sr-only">{t('pages.profile.noValueLabel')}</span>
                  </>
                }
              />
            ))}
          </DataTileList>
        </section>

        <div className={styles.columns}>
          <section className={styles.section} aria-labelledby="profile-history">
            <div className={styles.sectionHead}>
              <h2 id="profile-history" className={styles.sectionTitle}>
                {t('pages.profile.history.title')}
              </h2>
              <span className="bb-label">{t('pages.profile.history.note')}</span>
            </div>
            <p className={styles.empty}>{t('pages.profile.history.empty')}</p>
            <p className={styles.note}>{t('pages.profile.history.pending')}</p>
          </section>
          <div className={styles.side}>
            <section className={styles.section} aria-labelledby="profile-chart">
              <h2 id="profile-chart" className={styles.sectionTitle}>
                {t('pages.profile.chart.title')}
              </h2>
              <p className={styles.empty}>{t('pages.profile.chart.empty')}</p>
            </section>
            <section className={styles.section} aria-labelledby="profile-achievements">
              <h2 id="profile-achievements" className={styles.sectionTitle}>
                {t('pages.profile.achievements.title')}
              </h2>
              <p className={styles.empty}>{t('pages.profile.achievements.empty')}</p>
            </section>
          </div>
        </div>
      </div>
    </ScreenPage>
  )
}
