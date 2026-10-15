import type { ResultRow, WeekResults } from '@beatbattle/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, type LoaderFunctionArgs, useLoaderData, useSearchParams } from 'react-router'
import { DocumentTitle } from '../../app/DocumentTitle'
import { useControlKeys } from '../../app/layout/screen'
import { FrameSlot } from '../../app/layout/slots'
import { paths } from '../../app/paths'
import { notFound } from '../../app/routes'
import { formatDate, formatNumber, t } from '../../i18n'
import { ApiClientError } from '../../net/api'
import { queryKeys } from '../../net/queryKeys'
import { resultsQuery } from '../../net/results'
import { HalftoneCanvas } from '../../ui/arena/HalftoneCanvas'
import { Button } from '../../ui/Button'
import { GenerativeCover } from '../../ui/CoverArt'
import { EntryRow } from '../../ui/EntryRow'
import { Frame } from '../../ui/Frame'
import { cx } from '../../ui/forceState'
import { Medal, type MedalPlace } from '../../ui/Medal'
import { Stamp } from '../../ui/Stamp'
import { useShortcuts } from '../../ui/shortcuts'
import { TitlePlate } from '../../ui/TitlePlate'
import { Done } from '../account/FormBits'
import { useSession } from '../account/session'
import { usePlayer } from '../player/store'
import { entryTrack } from '../player/tracks'
import { rememberCeremonySeen } from './ceremonySeen'
import { ResultsCeremony } from './ResultsCeremony'
import { MiniHistogram, scoreOf } from './score'
import styles from './WeekResultsPage.module.css'

/** `/semana/:slug/resultados`: 404 si la semana no existe o aún no está sellada. */
export async function weekResultsLoader({ params, request }: LoaderFunctionArgs): Promise<WeekResults> {
  try {
    return await resultsQuery(params.slug ?? '').queryFn({ signal: request.signal })
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound()
    throw error
  }
}

const KEYS = ['podium', 'listen', 'standings', 'share', 'replay', 'back', 'sound'] as const

const isMedal = (position: number | null): position is MedalPlace =>
  position === 1 || position === 2 || position === 3

const producerOf = (row: ResultRow) => row.entry.producer?.displayName ?? t('results.deletedProducer')

/**
 * `/semana/:slug/resultados` — la página de resultados (guía §2.8, §3.8.6; tarea 6.15), la de la maqueta
 * `04-resultados`: la placa «RESULTADOS OFICIALES · SEMANA N» con el sello «SELLADA», el **podio con escena**
 * (suelo de trama, focos y peanas de alturas distintas: 1.º en el centro, 2.º a la izquierda y 3.º a la
 * derecha), con la portada y los restos del sello «AUTORÍA OCULTA», el alias tachado y el productor en
 * display; la barra **TU RESULTADO** con «Play al campeón» y «Clasificación»; y la tabla completa en filas de
 * marcador con histograma. El XP, los puntos de temporada y el oído de oro llegan con la Fase 7; la Elección
 * del sello, con la 9. Nunca «K.O.» ni «gana a…». Sin movimiento, el podio aparece quieto.
 */
export function WeekResultsPage() {
  const initial = useLoaderData() as WeekResults
  const { data = initial } = useQuery({ ...resultsQuery(initial.week.slug), initialData: initial })
  const { week, rows, mine } = data
  const podium = rows.filter((row) => isMedal(row.result.position))
  const ranked = rows.filter((row) => row.result.position !== null).length
  const totalVotes = rows.reduce((sum, row) => sum + row.result.votes, 0)
  const champion = podium.find((row) => row.result.position === 1)
  const standingsRef = useRef<HTMLElement>(null)
  const shortcuts = useShortcuts((state) => state.enabled)
  const [shared, setShared] = useState(false)
  const [params, setParams] = useSearchParams()
  // `?ceremonia`: la home la ofrece la primera vez tras el sellado (`RF-RES-09`).
  const [ceremony, setCeremony] = useState(() => params.has('ceremonia') && podium.length > 0)
  const signedIn = useSession((state) => state.me !== null)
  const queryClient = useQueryClient()
  useControlKeys(ceremony ? null : KEYS)
  const endCeremony = () => {
    setCeremony(false)
    if (params.has('ceremonia')) setParams({}, { replace: true })
    void rememberCeremonySeen(week.slug, signedIn).then(() =>
      queryClient.invalidateQueries({ queryKey: queryKeys.weeks.current() }),
    )
  }

  const play = (row: ResultRow) => usePlayer.getState().play(entryTrack(row.entry, { votable: false }))
  const showStandings = () => {
    const first = standingsRef.current?.querySelector<HTMLElement>('a, button')
    standingsRef.current?.scrollIntoView({ block: 'start' })
    first?.focus({ preventScroll: true })
  }
  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share)
        await navigator.share({ title: t('results.shareTitle', { number: week.number }), url })
      else await navigator.clipboard.writeText(url)
      setShared(true)
    } catch {
      // Cancelado: nada que decir.
    }
  }

  // T (clasificación) y X (compartir) desde cualquier parte de la pantalla (atajos de una tecla).
  // biome-ignore lint/correctness/useExhaustiveDependencies: las acciones leen el estado vigente
  useEffect(() => {
    if (!shortcuts) return
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key === 't') {
        event.preventDefault()
        showStandings()
      } else if (key === 'x') {
        event.preventDefault()
        void share()
      } else if (key === 'r' && podium.length > 0) {
        event.preventDefault()
        setCeremony(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts])

  return (
    <div className={styles.page}>
      <DocumentTitle page={t('results.documentTitle', { number: week.number })} />
      <header className={styles.head}>
        {/* La placa del HUD: «RESULTADOS OFICIALES · SEMANA N» con el sello «SELLADA» (maqueta 04). */}
        <FrameSlot name="hudCenter">
          <div className={styles.hudPlate}>
            <TitlePlate
              aria-hidden="true"
              kicker={t('results.kicker')}
              title={t('results.title', { number: week.number })}
            />
            <Stamp tone="red" turn={1} className={styles.sealed} aria-hidden="true">
              {t('results.sealed')}
            </Stamp>
          </div>
        </FrameSlot>
        {/* En escritorio lo dice la placa del HUD; en móvil (sin centro del HUD), esta cabeza. */}
        <h1 className={styles.heading}>
          <span className={cx('bb-label', styles.headingKicker)}>{t('results.kicker')}</span>{' '}
          <span className={cx('bb-display', styles.headingTitle)}>
            {t('results.title', { number: week.number })}
          </span>
        </h1>
        <p className={styles.summary}>
          {t('results.summary', {
            sample: week.sampleTitle,
            entries: t('results.entries', { count: rows.length }),
            votes: t('results.votes', { count: totalVotes }),
          })}
        </p>
        {podium.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            keyHint={t('frame.keys.glyph.r')}
            onClick={() => setCeremony(true)}
          >
            {t('ceremony.watch')}
          </Button>
        )}
        {week.correctedAt !== null && (
          <p className={styles.corrected} role="note">
            {t('results.corrected', { date: formatDate(week.correctedAt) })}
          </p>
        )}
      </header>

      {rows.length === 0 ? (
        <Frame className={styles.empty}>
          <h2 className="bb-display">{t('results.empty.title')}</h2>
          <p>{t('results.empty.body', { sample: week.sampleTitle })}</p>
          <Button to={paths.home()}>{t('screen.backToMenu')}</Button>
        </Frame>
      ) : (
        <>
          {podium.length > 0 ? (
            <Podium rows={podium} onPlay={play} />
          ) : (
            <p className={styles.noPodium}>{t('results.noPodium')}</p>
          )}
          <MineBar
            mine={mine}
            ranked={ranked}
            onPlayChampion={champion ? () => play(champion) : null}
            onStandings={showStandings}
          />
          {shared && <Done>{t('results.shared')}</Done>}
          {ceremony && <ResultsCeremony results={data} onDone={endCeremony} />}
          <section ref={standingsRef} className={styles.standings} aria-labelledby="standings-title">
            <h2 id="standings-title" className={cx('bb-label', styles.standingsTitle)}>
              {t('results.standingsTitle')}
            </h2>
            <ol className={styles.rows}>
              {rows.map((row) => (
                <li key={row.entry.id}>
                  <StandingRow row={row} onPlay={() => play(row)} />
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  )
}

/** El podio con escena: el DOM va 1.º, 2.º y 3.º; la rejilla los coloca 2-1-3 sobre sus peanas. */
function Podium({ rows, onPlay }: { rows: ResultRow[]; onPlay: (row: ResultRow) => void }) {
  const spots = useRef<(HTMLButtonElement | null)[]>([])
  // ← → recorren el podio de izquierda a derecha (2.º, 1.º, 3.º), como se ve.
  const visual = [...rows].sort((a, b) => visualOrder(a) - visualOrder(b))
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const current = visual.findIndex((row) => spots.current[rows.indexOf(row)] === document.activeElement)
    if (current < 0) return
    event.preventDefault()
    const next = visual[(current + (event.key === 'ArrowRight' ? 1 : visual.length - 1)) % visual.length]
    if (next) spots.current[rows.indexOf(next)]?.focus()
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ← → mueven el foco entre los botones del podio
    <section className={styles.podium} aria-label={t('results.podiumLabel')} onKeyDown={onKeyDown}>
      <div className={styles.beams} aria-hidden="true" />
      <div className={styles.floor} aria-hidden="true">
        <HalftoneCanvas className={styles.floorDots} shape="podiumFloor" cell={11} background="wine3" />
      </div>
      {rows.map((row, index) => {
        const place = row.result.position as MedalPlace
        return (
          <div key={row.entry.id} className={styles.spot} data-place={place}>
            {place === 1 && (
              <>
                <svg className={styles.crown} viewBox="0 0 100 52" aria-hidden="true">
                  <path d="M8 48 L4 12 L28 30 L50 4 L72 30 L96 12 L92 48 Z" />
                </svg>
                <span className={styles.champion}>{t('results.champion')}</span>
              </>
            )}
            <button
              ref={(node) => {
                spots.current[index] = node
              }}
              type="button"
              className={styles.art}
              aria-label={t('player.play', { title: row.entry.title })}
              onClick={() => onPlay(row)}
            >
              <Frame variant="title" cut="lg" className={styles.cover}>
                {row.entry.cover.kind === 'own' ? (
                  <img src={row.entry.cover.url} alt="" />
                ) : (
                  <GenerativeCover
                    seed={row.entry.cover.seed}
                    bpm={row.entry.bpm}
                    musicalKey={row.entry.musicalKey}
                  />
                )}
              </Frame>
              {/* Los restos del sello «AUTORÍA OCULTA» que la ceremonia arranca. */}
              <span className={cx(styles.torn, styles.tornA)} aria-hidden="true">
                {t('results.hiddenA')}
              </span>
              <span className={cx(styles.torn, styles.tornB)} aria-hidden="true">
                {t('results.hiddenB')}
              </span>
            </button>
            <div className={styles.name}>
              <span className="sr-only">{t('results.place', { position: place })}</span>
              <span className={styles.aliasX}>
                <span className="sr-only">{t('results.aliasLabel')} </span>
                {row.entry.alias}
              </span>
              <Link to={paths.entry(row.entry.id)} className={cx('bb-display', styles.producer)}>
                {producerOf(row)}
              </Link>
              <span className={styles.score}>
                <Medal place={place} className={styles.medal} />
                <b>{scoreOf(row.result.scoreMilli)}</b>
                <span>
                  {t('results.votes', { count: row.result.votes })}
                  <br />
                  {t(`ui.medal.place${place}`)}
                </span>
              </span>
            </div>
            <div className={styles.pedestal} aria-hidden="true">
              <span className={styles.pedestalTop} />
              <span className={cx('bb-display', styles.pedestalFront)}>{place}</span>
            </div>
          </div>
        )
      })}
    </section>
  )
}

const visualOrder = (row: ResultRow) => ({ 2: 0, 1: 1, 3: 2 })[row.result.position as MedalPlace] ?? 3

/** La barra «TU RESULTADO» (`RF-RES-08`): posición, puntuación y votos; sin participar, solo los botones. */
function MineBar({
  mine,
  ranked,
  onPlayChampion,
  onStandings,
}: {
  mine: ResultRow | null
  ranked: number
  onPlayChampion: (() => void) | null
  onStandings: () => void
}) {
  return (
    <Frame cut="base" className={styles.mine}>
      {mine && (
        <section className={styles.mineStats} aria-label={t('results.mine.label')}>
          <span className={styles.mineTag}>{t('results.mine.label')}</span>
          <Tile label={t('results.mine.position')}>
            {mine.result.position ? (
              <>
                {mine.result.position}.º <span>{t('results.mine.of', { total: ranked })}</span>
              </>
            ) : (
              t('results.mine.unranked')
            )}
          </Tile>
          <Tile label={t('results.mine.score')}>{scoreOf(mine.result.scoreMilli)}</Tile>
          <Tile label={t('results.mine.votes')}>{formatNumber(mine.result.votes)}</Tile>
        </section>
      )}
      <div className={styles.mineActions}>
        {onPlayChampion && (
          <Button icon="triangleRight" keyHint={t('frame.keys.glyph.enter')} onClick={onPlayChampion}>
            {t('results.playChampion')}
          </Button>
        )}
        <Button variant="white" keyHint={t('frame.keys.glyph.t')} onClick={onStandings}>
          {t('results.standings')}
        </Button>
      </div>
      {mine && mine.result.position === null && (
        <p className={styles.mineNote}>{t('results.mine.unrankedNote')}</p>
      )}
    </Frame>
  )
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.tile}>
      <small>{label}</small>
      <b>{children}</b>
    </div>
  )
}

/** Una fila de la tabla: el marcador con su medalla y, a la derecha, el histograma de 5 barras. */
function StandingRow({ row, onPlay }: { row: ResultRow; onPlay: () => void }) {
  const current = usePlayer((state) => state.track?.id === row.entry.id)
  const status = usePlayer((state) => state.status)
  const playing = current && (status === 'playing' || status === 'loading')
  const { position, scoreMilli, votes, histogram } = row.result
  const votesText = t('results.votes', { count: votes })
  return (
    <EntryRow
      title={`${producerOf(row)} · ${row.entry.title}`}
      subtitle={
        position === null
          ? t('results.unrankedRow', { alias: row.entry.alias, votes: votesText })
          : t('results.rowSubtitle', { alias: row.entry.alias, votes: votesText })
      }
      to={paths.entry(row.entry.id)}
      playing={playing}
      onPlayToggle={() => (current ? usePlayer.getState().toggle() : onPlay())}
      {...(position !== null
        ? {
            result: {
              position,
              score: scoreMilli / 1000,
              ...(isMedal(position) ? { medal: position } : {}),
            },
          }
        : {})}
      actions={<MiniHistogram histogram={histogram} />}
    />
  )
}
