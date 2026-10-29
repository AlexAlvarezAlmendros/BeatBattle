import { levelProgress, rankTitle } from '@beatbattle/rules'
import {
  PROFILE_LINK_KINDS,
  type ProfileGame,
  type PublicProfile,
  PublicProfileSchema,
} from '@beatbattle/shared'
import { type ReactNode, useRef } from 'react'
import { Link, type LoaderFunctionArgs, redirect, useLoaderData } from 'react-router'
import { paths } from '../../app/paths'
import { notFound } from '../../app/routes'
import { ScreenPage } from '../../app/ScreenPage'
import { formatDate, formatNumber, t } from '../../i18n'
import { ApiClientError, apiFetch } from '../../net/api'
import { Button } from '../../ui/Button'
import { DataTile, DataTileList } from '../../ui/DataTile'
import { useFitText } from '../../ui/hooks/useFitText'
import { useSession } from '../account/session'
import { scoreOf } from '../results/score'
import { AchievementGrid } from './AchievementGrid'
import { BattleHistory } from './BattleHistory'
import { PositionsChart } from './PositionsChart'
import { ProfileCard } from './ProfileCard'
import styles from './ProfilePage.module.css'

/**
 * `/p/:username` (guía §2.3, §3.8.10; tareas 2.18, 7.22 y 7.24; `RF-PRF-01`, `-03`): la carta de productor en la cuña
 * y, en el panel, número y antigüedad, nombre, rango, nivel y ciudad, bio, enlaces, las seis teselas, el historial de
 * combates, la gráfica de posiciones y los logros. Todo lo de la capa de juego es lo público (solo semanas selladas,
 * hueco G1): la semana en curso nunca aparece antes del sellado (§1.3). Un nombre que no existe pinta la 404 del juego;
 * el anterior de alguien lleva a su nombre nuevo (la API responde 301 y aquí se cambia la URL).
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

/** «—» con su lectura («Sin datos todavía»): una tesela sin semanas selladas que contar. */
function NoValue() {
  return (
    <>
      <span aria-hidden="true">{t('pages.profile.noValue')}</span>
      <span className="sr-only">{t('pages.profile.noValueLabel')}</span>
    </>
  )
}

/** Las seis teselas (§3.8.10): valor y unidad de cada una, con su estado vacío. */
export function profileTiles(game: ProfileGame): { key: string; value: ReactNode; unit?: ReactNode }[] {
  const { stats, history } = game
  const best = stats.bestPosition
  const timesBest = best === null ? 0 : history.filter((row) => row.position === best).length
  const season = stats.season
  return [
    {
      key: 'bestPlace',
      value: best === null ? <NoValue /> : t('pages.profile.history.place', { place: best }),
      unit: timesBest > 1 ? t('pages.profile.tiles.times', { count: timesBest }) : undefined,
    },
    {
      key: 'streak',
      value: formatNumber(stats.streak.current),
      unit:
        stats.streak.best > stats.streak.current
          ? t('pages.profile.tiles.streakBest', { best: stats.streak.best })
          : t('pages.profile.tiles.weeks'),
    },
    {
      key: 'finalAverage',
      value: stats.meanScoreMilli === null ? <NoValue /> : scoreOf(stats.meanScoreMilli),
    },
    {
      key: 'goldenEar',
      value: formatNumber(stats.goldenEars),
      unit: t('pages.profile.tiles.goldenEars', { count: stats.goldenEars }),
    },
    { key: 'votesGiven', value: formatNumber(stats.votesCast) },
    {
      key: 'season',
      value:
        season === null ? (
          <NoValue />
        ) : (
          <Link to={paths.season(season.id)} className={styles.tileLink}>
            {season.position === null ? (
              <NoValue />
            ) : (
              t('pages.profile.history.place', { place: season.position })
            )}
            <span className="sr-only"> {t('pages.profile.tiles.seasonLink', { season: season.id })}</span>
          </Link>
        ),
      unit: season === null ? undefined : t('pages.profile.tiles.points', { count: season.points }),
    },
  ]
}

export function ProfilePage() {
  const profile = useLoaderData() as PublicProfile
  const me = useSession((state) => state.me)
  const progress = levelProgress(profile.xp)
  const rank = t(`rank.${rankTitle(progress.level)}`)
  const name = profile.displayUsername
  const own = me?.username === profile.username
  const nameRef = useRef<HTMLParagraphElement>(null)
  // El nombre en una línea: baja la anchura y el cuerpo antes que partir a mitad (un nombre de 20 caracteres).
  useFitText(nameRef, name, { minFontPx: 24 })
  return (
    <ScreenPage
      title={name}
      kicker={t('frame.plates.profile')}
      documentTitle={t('pages.profile.documentTitle', { name })}
      // El nombre es una palabra: en la cabeza de móvil, más pequeño antes que partido a mitad.
      titleMinFontPx={18}
      fill
      piece={<ProfileCard profile={profile} />}
    >
      <div className={styles.body} data-accent={profile.accent}>
        <header className={styles.head}>
          <p className="bb-label">
            {t('pages.profile.header', {
              number: String(profile.cardNumber).padStart(4, '0'),
              since: formatDate(profile.joinedAt, { month: 'long', year: 'numeric' }),
            })}
          </p>
          <p ref={nameRef} className={`bb-display ${styles.name}`} aria-hidden="true">
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
                <span className="sr-only"> {t('pages.profile.newTab')}</span>
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
            {profileTiles(profile.game).map((tile) => (
              <DataTile
                key={tile.key}
                label={t(`pages.profile.tiles.${tile.key as 'bestPlace'}`)}
                value={tile.value}
                unit={tile.unit}
                hot={tile.key === 'bestPlace' && profile.game.stats.bestPosition === 1}
              />
            ))}
          </DataTileList>
        </section>

        <div className={styles.columns}>
          <div className={styles.side}>
            <BattleHistory history={profile.game.history} />
          </div>
          <div className={styles.side}>
            <PositionsChart history={profile.game.history} />
            <AchievementGrid unlocks={profile.game.achievements} />
          </div>
        </div>
      </div>
    </ScreenPage>
  )
}
