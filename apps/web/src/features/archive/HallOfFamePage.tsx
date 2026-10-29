import type { EntryProducer, HallOfFame } from '@beatbattle/shared'
import type { ReactNode } from 'react'
import { Link, type LoaderFunctionArgs, useLoaderData } from 'react-router'
import { paths } from '../../app/paths'
import { BackToMenu, ScreenPage } from '../../app/ScreenPage'
import { t } from '../../i18n'
import { hallOfFameQuery } from '../../net/game'
import { Button } from '../../ui/Button'
import { GenerativeCover } from '../../ui/CoverArt'
import { Cursor } from '../../ui/Cursor'
import { frameAttributes } from '../../ui/Frame'
import { useMediaQuery } from '../../ui/hooks/useMediaQuery'
import { useRovingMenu } from '../../ui/hooks/useRovingMenu'
import { Medal } from '../../ui/Medal'
import { currentSeason, producerName, seasonLabel } from '../game/season'
import { scoreOf } from '../results/score'
import styles from './HallOfFamePage.module.css'

/** `GET /api/hall-of-fame` antes de pintar (un error de red lo recoge la pantalla de error del marco). */
export async function hallOfFameLoader({ request }: LoaderFunctionArgs): Promise<HallOfFame> {
  return hallOfFameQuery().queryFn({ signal: request.signal })
}

/** El nombre de un productor, enlazado a su perfil (salvo «Productor eliminado», que ya no lo tiene). */
function Producer({ producer, className }: { producer: EntryProducer | null; className?: string }) {
  return producer ? (
    <Link to={paths.profile(producer.username)} className={className}>
      {producer.displayName}
    </Link>
  ) : (
    <span className={className}>{producerName(null)}</span>
  )
}

interface RecordRow {
  key: 'mostWins' | 'longestStreak' | 'bestScore' | 'mostVotesCast'
  producer: EntryProducer | null
  value: ReactNode
  extra?: ReactNode
}

/** Las cuatro filas de la tabla de récords (§2.9), con su cifra y su unidad; `null` si nadie tiene ese récord. */
export function recordRows(
  records: HallOfFame['records'],
): (RecordRow | { key: RecordRow['key']; empty: true })[] {
  const { mostWins, longestStreak, bestScore, mostVotesCast } = records
  return [
    mostWins
      ? {
          key: 'mostWins',
          producer: mostWins.producer,
          value: t('pages.hallOfFame.records.wins', { count: mostWins.value }),
        }
      : { key: 'mostWins', empty: true },
    longestStreak
      ? {
          key: 'longestStreak',
          producer: longestStreak.producer,
          value: t('pages.hallOfFame.records.weeks', { count: longestStreak.value }),
        }
      : { key: 'longestStreak', empty: true },
    bestScore
      ? {
          key: 'bestScore',
          producer: bestScore.producer,
          value: scoreOf(bestScore.scoreMilli),
          extra: (
            <Link to={paths.entry(bestScore.entryId)} className={styles.recordLink}>
              {t('pages.hallOfFame.records.seeEntry')}
            </Link>
          ),
        }
      : { key: 'bestScore', empty: true },
    mostVotesCast
      ? {
          key: 'mostVotesCast',
          producer: mostVotesCast.producer,
          value: t('pages.hallOfFame.records.votes', { count: mostVotesCast.value }),
        }
      : { key: 'mostVotesCast', empty: true },
  ]
}

/**
 * `/salon-de-la-fama` (guía §2.9, §3.8.14; tarea 7.25, `RF-ARC-02`): la tabla de récords de una recreativa. En la cuña,
 * los **campeones de temporada** en placas grandes (cada una lleva a su clasificación); en el panel, los **récords**
 * (más victorias, racha más larga, mejor puntuación, más votos emitidos) con la cifra en Oxanium y el puesto en display,
 * y los **campeones semana a semana** (portada y disco de oro), que se recorren con ← → (en móvil, en lista, ↑ ↓) y
 * llevan a los resultados de su semana. Todo sale de los snapshots vigentes de las semanas selladas (lo filtra el
 * servidor): nada de una semana sin sellar. Al pie, el archivo y la temporada en curso.
 */
export function HallOfFamePage() {
  const data = useLoaderData() as HallOfFame
  const narrow = useMediaQuery('(max-width: 720px)')
  const winners = data.weeklyWinners
  const menu = useRovingMenu({ count: winners.length, orientation: narrow ? 'vertical' : 'horizontal' })
  const season = currentSeason()
  return (
    <ScreenPage
      title={t('pages.hallOfFame.title')}
      kicker={t('frame.plates.hallOfFame')}
      summary={t('pages.hallOfFame.summary')}
      fill
      piece={<ChampionPlates champions={data.seasonChampions} season={season} />}
      actions={
        <>
          <BackToMenu />
          <Button variant="outline" to={paths.weeks()}>
            {t('pages.hallOfFame.archive')}
          </Button>
          <Button variant="outline" to={paths.season(season)}>
            {t('pages.hallOfFame.currentSeason', { season: seasonLabel(season) })}
          </Button>
        </>
      }
    >
      <section className={styles.section} aria-labelledby="hof-records">
        <h2 id="hof-records" className={styles.sectionTitle}>
          {t('pages.hallOfFame.records.title')}
        </h2>
        <ol className={styles.records}>
          {recordRows(data.records).map((row, index) => (
            <li key={row.key} {...frameAttributes({ cut: 'md' })} className={styles.record}>
              <span className={styles.recordRank} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className={styles.recordLabel}>{t(`pages.hallOfFame.records.${row.key}`)}</span>
              {'empty' in row ? (
                <span className={styles.recordEmpty}>{t('pages.hallOfFame.records.none')}</span>
              ) : (
                <>
                  <Producer producer={row.producer} className={styles.recordHolder} />
                  <span className={styles.recordValue}>{row.value}</span>
                  {row.extra}
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="hof-winners">
        <div className={styles.sectionHead}>
          <h2 id="hof-winners" className={styles.sectionTitle}>
            {t('pages.hallOfFame.winners.title')}
          </h2>
          {winners.length > 0 && (
            <span className="bb-label">{t('pages.hallOfFame.winners.count', { count: winners.length })}</span>
          )}
        </div>
        {winners.length === 0 ? (
          <p className={styles.empty}>{t('pages.hallOfFame.winners.none')}</p>
        ) : (
          <div className={styles.strip}>
            <ul
              {...menu.getContainerProps({ 'aria-labelledby': 'hof-winners' })}
              className={styles.winners}
              data-orientation={narrow ? 'vertical' : 'horizontal'}
            >
              {winners.map((winner, index) => (
                <li key={`${winner.weekSlug}-${winner.entryId}`} role="none">
                  <Link
                    to={paths.weekResults(winner.weekSlug)}
                    {...menu.getItemProps<HTMLAnchorElement>(index)}
                    {...frameAttributes({ cut: 'md' })}
                    className={styles.winner}
                  >
                    <Cursor cut="md" />
                    <span className={styles.winnerCover} aria-hidden="true">
                      {winner.cover.kind === 'own' ? (
                        <img src={winner.cover.url} alt="" />
                      ) : (
                        <GenerativeCover seed={winner.cover.seed} />
                      )}
                    </span>
                    <Medal place={1} className={styles.winnerMedal} />
                    <span className={styles.winnerWeek}>
                      {t('pages.hallOfFame.winners.week', { number: winner.weekNumber })}
                    </span>
                    <span className={styles.winnerTitle}>{winner.title}</span>
                    <span className={styles.winnerProducer}>{producerName(winner.producer)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </ScreenPage>
  )
}

/**
 * La pieza del salón (§3.8.14): los campeones de temporada en placas grandes, de la más reciente a la más antigua, cada
 * una a su clasificación; los ex aequo, juntos. Sin ninguna temporada cerrada, una placa que lo dice y lleva a la que
 * está en juego.
 */
function ChampionPlates({ champions, season }: { champions: HallOfFame['seasonChampions']; season: string }) {
  return (
    <section className={styles.piece} aria-labelledby="hof-champions">
      <h2 id="hof-champions" className={styles.pieceTitle}>
        {t('pages.hallOfFame.champions.title')}
      </h2>
      {champions.length === 0 ? (
        <Link to={paths.season(season)} {...frameAttributes({ cut: 'lg' })} className={styles.plate}>
          <span className="bb-label">{t('pages.hallOfFame.champions.noneKicker')}</span>
          <span className={styles.plateEmpty}>{t('pages.hallOfFame.champions.none')}</span>
          <span className={styles.plateSeason}>{seasonLabel(season)}</span>
        </Link>
      ) : (
        <ol className={styles.plates}>
          {champions.map((champion) => (
            <li key={champion.seasonId}>
              <Link
                to={paths.season(champion.seasonId)}
                {...frameAttributes({ cut: 'lg' })}
                className={styles.plate}
              >
                <svg viewBox="0 0 24 24" className={styles.crown} focusable="false" aria-hidden="true">
                  <path d="M3 18L2 7l6 5 4-8 4 8 6-5-1 11z" />
                </svg>
                <span className="bb-label">
                  {t('pages.hallOfFame.champions.kicker', { count: champion.producers.length })}
                </span>
                <span className={styles.plateSeason}>{seasonLabel(champion.seasonId)}</span>
                <span className={styles.plateNames}>
                  {champion.producers.map((producer) => producerName(producer)).join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
