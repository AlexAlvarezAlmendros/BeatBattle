import { SEASON_POINTS_BY_POSITION, SEASON_POINTS_QUALIFIED_OUTSIDE_TOP } from '@beatbattle/rules'
import type { SeasonStandingRow, SeasonStandings } from '@beatbattle/shared'
import type { KeyboardEvent } from 'react'
import { Link, type LoaderFunctionArgs, redirect, useLoaderData } from 'react-router'
import { FrameSlot } from '../../app/layout/slots'
import { paths } from '../../app/paths'
import { notFound } from '../../app/routes'
import { BackToMenu, ScreenPage } from '../../app/ScreenPage'
import { formatNumber, t } from '../../i18n'
import { ApiClientError } from '../../net/api'
import { seasonQuery } from '../../net/game'
import { Button } from '../../ui/Button'
import { frameAttributes } from '../../ui/Frame'
import { cx } from '../../ui/forceState'
import { TitlePlate } from '../../ui/TitlePlate'
import { scoreOf } from '../results/score'
import styles from './SeasonPage.module.css'
import { currentSeason, parseSeason, producerName, seasonId, seasonLabel, shiftSeason } from './season'

export interface SeasonData {
  id: string
  /** `null`: ninguna semana suya ha empezado (la API responde 404, `RF-ARC-03`). */
  standings: SeasonStandings | null
}

/**
 * `/temporada/:id`: el id es el de la temporada («2026-T4»; «2026-t4» lleva a él). Un id que no es una temporada pinta
 * la 404; una temporada sin semanas empezadas, la pantalla con su estado vacío.
 */
export async function seasonLoader({ params, request }: LoaderFunctionArgs): Promise<SeasonData> {
  const raw = params.id ?? ''
  const parts = parseSeason(raw)
  if (!parts) notFound()
  const id = seasonId(parts)
  if (raw !== id) throw redirect(paths.season(id))
  try {
    return { id, standings: await seasonQuery(id).queryFn({ signal: request.signal }) }
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return { id, standings: null }
    throw error
  }
}

/** ↑ ↓ entre los productores de la clasificación: el foco es el cursor (§3.8.14, `RD-VIS-02`). */
function moveInTable(event: KeyboardEvent<HTMLTableElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const links = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-row-link]')]
  const index = links.indexOf(event.target as HTMLElement)
  if (index < 0) return
  event.preventDefault()
  const next = links[Math.max(0, Math.min(links.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
  next?.focus()
}

/**
 * `/temporada/:id` (guía §2.9, §3.8.14; tarea 7.26, `RF-ARC-03`, `RF-ARC-04`): la clasificación de torneo de una
 * temporada con los puntos tipo F1, solo con sus semanas selladas (también la que está en juego, que es pública). En la
 * cuña, el top 3 en peanas pequeñas (con la corona de campeón si la temporada está cerrada); en el panel, el estado de
 * la temporada, la tabla (puesto, productor, puntos, victorias, podios, semanas y media), cómo se puntúa y se desempata,
 * y la temporada anterior y la siguiente.
 */
export function SeasonPage() {
  const { id, standings } = useLoaderData() as SeasonData
  const label = seasonLabel(id)
  const rows = standings?.rows ?? []
  const previous = shiftSeason(id, -1)
  const next = shiftSeason(id, 1)
  const showNext = next !== null && next <= currentSeason()
  return (
    <ScreenPage
      title={t('pages.season.heading', { season: label })}
      kicker={t('frame.plates.season')}
      summary={
        standings === null
          ? t('pages.season.notStarted')
          : standings.season.closed
            ? t('pages.season.closed', { count: standings.season.sealedWeeks })
            : t('pages.season.open', { count: standings.season.sealedWeeks })
      }
      fill
      piece={<Podium rows={rows} label={label} closed={standings?.season.closed ?? false} />}
      actions={
        <>
          <BackToMenu />
          <Button variant="outline" to={paths.hallOfFame()}>
            {t('pages.season.hallOfFame')}
          </Button>
        </>
      }
    >
      {/* La placa del HUD con la temporada («CLASIFICACIÓN · T4 DE 2026»): el `<h1>` la dice entera. */}
      <FrameSlot name="hudCenter">
        <TitlePlate aria-hidden="true" kicker={t('frame.plates.season')} title={label} />
      </FrameSlot>
      <nav className={styles.seasons} aria-label={t('pages.season.others')}>
        {previous && (
          <Link to={paths.season(previous)} className={styles.seasonLink} rel="prev">
            <span aria-hidden="true">◀ </span>
            {seasonLabel(previous)}
          </Link>
        )}
        {showNext && next && (
          <Link to={paths.season(next)} className={cx(styles.seasonLink, styles.seasonNext)} rel="next">
            {seasonLabel(next)}
            <span aria-hidden="true"> ▶</span>
          </Link>
        )}
      </nav>

      <section className={styles.section} aria-labelledby="season-standings">
        <h2 id="season-standings" className={styles.sectionTitle}>
          {t('pages.season.standings')}
        </h2>
        {rows.length === 0 ? (
          <p className={styles.empty}>{t('pages.season.empty')}</p>
        ) : (
          <table className={styles.table} onKeyDown={moveInTable}>
            <caption className="sr-only">{t('pages.season.caption', { season: label })}</caption>
            <thead>
              <tr>
                <th scope="col">{t('pages.season.cols.position')}</th>
                <th scope="col">{t('pages.season.cols.producer')}</th>
                <th scope="col" className={styles.num}>
                  {t('pages.season.cols.points')}
                </th>
                <th scope="col" className={cx(styles.num, styles.extra)}>
                  {t('pages.season.cols.wins')}
                </th>
                <th scope="col" className={cx(styles.num, styles.extra)}>
                  {t('pages.season.cols.podiums')}
                </th>
                <th scope="col" className={cx(styles.num, styles.extra)}>
                  {t('pages.season.cols.weeks')}
                </th>
                <th scope="col" className={cx(styles.num, styles.extra)}>
                  {t('pages.season.cols.mean')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  // biome-ignore lint/suspicious/noArrayIndexKey: un productor eliminado no tiene nombre único
                  key={`${row.producer?.username ?? 'eliminado'}-${index}`}
                  data-podium={row.position <= 3 || undefined}
                >
                  <td className={styles.position}>{t('pages.season.place', { place: row.position })}</td>
                  <th scope="row" className={styles.producer}>
                    {row.producer ? (
                      <Link to={paths.profile(row.producer.username)} data-row-link="">
                        {row.producer.displayName}
                      </Link>
                    ) : (
                      <span data-row-link="" tabIndex={-1}>
                        {producerName(null)}
                      </span>
                    )}
                    <span className={styles.compact}>{compactLine(row)}</span>
                  </th>
                  <td className={cx(styles.num, styles.pointsCell)}>{formatNumber(row.points)}</td>
                  <td className={cx(styles.num, styles.extra)}>{formatNumber(row.wins)}</td>
                  <td className={cx(styles.num, styles.extra)}>{formatNumber(row.podiums)}</td>
                  <td className={cx(styles.num, styles.extra)}>{formatNumber(row.weeks)}</td>
                  <td className={cx(styles.num, styles.extra)}>{scoreOf(row.meanScoreMilli)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.section} aria-labelledby="season-rules">
        <h2 id="season-rules" className={styles.sectionTitle}>
          {t('pages.season.rules.title')}
        </h2>
        <ol className={styles.points} aria-label={t('pages.season.rules.pointsLabel')}>
          {SEASON_POINTS_BY_POSITION.map((points, index) => (
            <li key={points}>
              <span className={styles.pointsPlace}>{t('pages.season.place', { place: index + 1 })}</span>
              <span className={styles.pointsValue}>{t('pages.season.points', { count: points })}</span>
            </li>
          ))}
        </ol>
        <p className={styles.rule}>
          {t('pages.season.rules.outside', { count: SEASON_POINTS_QUALIFIED_OUTSIDE_TOP })}
        </p>
        <p className={styles.rule}>{t('pages.season.rules.tiebreak')}</p>
        <p className={styles.rule}>{t('pages.season.rules.sealed')}</p>
      </section>
    </ScreenPage>
  )
}

/** La línea de la fila en estrecho, donde no caben las columnas: «2 victorias · 5 podios · 8 semanas · media 4,16». */
function compactLine(row: SeasonStandingRow) {
  return t('pages.season.compact', {
    wins: t('pages.season.wins', { count: row.wins }),
    podiums: t('pages.season.podiums', { count: row.podiums }),
    weeks: t('pages.season.weeks', { count: row.weeks }),
    mean: scoreOf(row.meanScoreMilli),
  })
}

/**
 * La pieza de la temporada (§3.8.14): el top 3 en peanas pequeñas (2.º, 1.º, 3.º), con el nombre y los puntos en su
 * placa y, cerrada, «CAMPEÓN» con su corona en la del 1.º (o las del 1.º, si hay ex aequo). Sin nadie clasificado, la
 * placa con el nombre de la temporada.
 */
function Podium({
  rows,
  label,
  closed,
}: {
  rows: readonly SeasonStandingRow[]
  label: string
  closed: boolean
}) {
  const top = rows.slice(0, 3)
  if (top.length === 0)
    return (
      <div {...frameAttributes({ cut: 'lg' })} className={styles.emptyPlate}>
        <span className="bb-label">{t('pages.season.plateKicker')}</span>
        <span className={styles.emptySeason}>{label}</span>
        <span className={styles.emptyNote}>{t('pages.season.noRows')}</span>
      </div>
    )
  // 2.º a la izquierda, 1.º en el centro y 3.º a la derecha.
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : [top[0]]
  return (
    <section className={styles.podium} aria-labelledby="season-podium">
      <h2 id="season-podium" className={styles.podiumTitle}>
        {t('pages.season.podium', { season: label })}
      </h2>
      <ol className={styles.steps}>
        {order.map((row, index) =>
          row ? (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: tres peanas fijas
              key={index}
              className={styles.step}
              data-place={Math.min(row.position, 3)}
            >
              <div className={styles.stepPlate}>
                <span className="sr-only">{t('pages.season.place', { place: row.position })} </span>
                {closed && row.position === 1 && (
                  <span className={styles.champion}>
                    <svg viewBox="0 0 24 24" className={styles.crown} focusable="false" aria-hidden="true">
                      <path d="M3 18L2 7l6 5 4-8 4 8 6-5-1 11z" />
                    </svg>
                    {t('pages.season.champion')}
                  </span>
                )}
                <span className={styles.stepName}>{producerName(row.producer)}</span>
                <span className={styles.stepPoints}>{t('pages.season.points', { count: row.points })}</span>
              </div>
              <div className={styles.block} aria-hidden="true">
                <span className={styles.blockNumber}>{row.position}</span>
              </div>
            </li>
          ) : null,
        )}
      </ol>
    </section>
  )
}
