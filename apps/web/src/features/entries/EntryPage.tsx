import { listenThresholdMs } from '@beatbattle/rules'
import { type PublicEntry, PublicEntrySchema } from '@beatbattle/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { type LoaderFunctionArgs, useLoaderData } from 'react-router'
import { notFound } from '../../app/routes'
import { ScreenPage } from '../../app/ScreenPage'
import { formatDuration, t } from '../../i18n'
import { ApiClientError, apiFetch } from '../../net/api'
import { getMyEntry } from '../../net/entries'
import { queryKeys } from '../../net/queryKeys'
import { entryStats, myVotes } from '../../net/votes'
import { weekQuery } from '../../net/weeks'
import { Button } from '../../ui/Button'
import { DataChip } from '../../ui/Chip'
import { GenerativeCover } from '../../ui/CoverArt'
import { Frame } from '../../ui/Frame'
import { Stamp } from '../../ui/Stamp'
import { Stars } from '../../ui/Stars'
import { Waveform } from '../../ui/Waveform'
import { Done } from '../account/FormBits'
import { useSession } from '../account/session'
import { usePlayer } from '../player/store'
import { entryTrack } from '../player/tracks'
import { ReportDialog } from '../vote/ReportDialog'
import { useStarsListen, useVote } from '../vote/useVote'
import { decodePeaks, musicalKeyName } from '../week/weekModel'
import styles from './EntryPage.module.css'

/** `/e/:id`: la ficha pública (404 si no existe, se ha retirado o está oculta). */
export async function entryLoader({ params, request }: LoaderFunctionArgs): Promise<PublicEntry> {
  try {
    return await apiFetch(`/api/entries/${encodeURIComponent(params.id ?? '')}`, {
      schema: PublicEntrySchema,
      signal: request.signal,
    })
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound()
    throw error
  }
}

/**
 * `/e/:id` — la ficha de una entrada (guía §2.6, §3.8.14; tarea 5.17): la portada grande (generativa en voto
 * ciego) con inclinación al pasar el ratón, el alias (o el productor, revelada), los chips, la descripción,
 * la onda que suena en el reproductor global y salta con clic, arrastre y teclado (`RF-PLAY-06`), las
 * estrellas con su escucha mínima (nunca en la propia, `RF-VOTE-03`), compartir y denunciar. El dueño ve sus
 * votos y escuchas, sin la media (§2.7). Tras el sellado, la posición y la puntuación llegan con la Fase 6.
 */
export function EntryPage() {
  const initial = useLoaderData() as PublicEntry
  const { data: entry = initial } = useQuery({
    queryKey: queryKeys.entries.detail(initial.id),
    queryFn: () => apiFetch(`/api/entries/${encodeURIComponent(initial.id)}`, { schema: PublicEntrySchema }),
    initialData: initial,
  })
  const week = useQuery(weekQuery(entry.weekSlug)).data
  const me = useSession((state) => state.me)
  const mine = useQuery({
    queryKey: queryKeys.entries.mine(entry.weekSlug),
    queryFn: ({ signal }) => getMyEntry(entry.weekSlug, signal).catch(() => null),
    enabled: me !== null,
  }).data
  const own = mine?.id === entry.id
  const votes = useQuery({
    queryKey: ['me', 'votes', entry.weekSlug],
    queryFn: ({ signal }) => myVotes(entry.weekSlug, signal),
    enabled: me !== null,
  }).data
  const stats = useQuery({
    queryKey: queryKeys.entries.stats(entry.id),
    queryFn: ({ signal }) => entryStats(entry.id, signal),
    enabled: own,
  }).data
  const votingOpen = week ? week.phase === 'open' || week.phase === 'voting' : false
  const votable = votingOpen && !own && me?.emailVerified === true
  const track = entryTrack(entry, { votable: votingOpen && !own })
  const current = usePlayer((state) => state.track?.id === entry.id)
  const status = usePlayer((state) => state.status)
  const positionMs = usePlayer((state) => (current ? state.positionMs : 0))
  const playing = current && (status === 'playing' || status === 'loading')
  const [vote, setVote] = useState<number | null | undefined>(undefined)
  const saved =
    vote === undefined ? (votes?.votes.find((item) => item.entryId === entry.id)?.stars ?? null) : vote
  const { vote: sendVote } = useVote(entry)
  const thresholdMs = listenThresholdMs(entry.durationMs)
  const listen = useStarsListen(entry.id, thresholdMs)
  const [reporting, setReporting] = useState(false)
  const [shared, setShared] = useState(false)
  const peaks = entry.peaks ? decodePeaks(entry.peaks) : []
  const seconds = entry.durationMs / 1000
  const name = entry.producer?.displayName ?? entry.alias

  const toggle = () => {
    const player = usePlayer.getState()
    if (current) player.toggle()
    else player.play(track)
  }
  const seek = (fraction: number) => {
    const player = usePlayer.getState()
    if (current) player.seek(fraction * entry.durationMs)
    else player.play(track, { fromMs: fraction * entry.durationMs })
  }
  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: t('entryPage.shareTitle', { alias: name }), url })
      else await navigator.clipboard.writeText(url)
      setShared(true)
    } catch {
      // Cancelado: nada que decir.
    }
  }

  return (
    <ScreenPage
      title={name}
      kicker={t('entryPage.kicker', { number: week?.number ?? '' })}
      documentTitle={t('entryPage.documentTitle', { alias: name })}
      titleMinFontPx={24}
      piece={
        <Frame variant="title" cut="lg" className={styles.cover}>
          {entry.cover.kind === 'own' ? (
            <img src={entry.cover.url} alt="" />
          ) : (
            <GenerativeCover seed={entry.cover.seed} bpm={entry.bpm} musicalKey={entry.musicalKey} />
          )}
          {entry.producer === null && (
            <Stamp size="sm" turn={-4} className={styles.stamp}>
              {t('entryPage.hidden')}
            </Stamp>
          )}
        </Frame>
      }
    >
      <div className={styles.body}>
        {/* El alias en display (el `<h1>` va en la cabeza de móvil y, en escritorio, para los lectores). */}
        <p className={`bb-display ${styles.alias}`} aria-hidden="true">
          {name}
        </p>
        <p className={styles.title}>
          <span className="bb-label">{t('entryPage.titleLabel')}</span> {entry.title}
        </p>
        <div className={styles.chips}>
          {entry.bpm !== null && <DataChip value={Math.round(entry.bpm)} unit={t('home.stage.bpmUnit')} />}
          {entry.musicalKey && <DataChip value={musicalKeyName(entry.musicalKey)} word />}
          <DataChip value={formatDuration(seconds)} unit={t('home.stage.minUnit')} />
          {entry.genres.map((genre) => (
            <DataChip key={genre} value={genre} word />
          ))}
          {entry.daw && <DataChip value={entry.daw} word />}
        </div>
        {entry.description && <p className={styles.description}>{entry.description}</p>}
        <div className={styles.player}>
          <Button
            variant="white"
            iconOnly
            icon={playing ? 'pause' : 'triangleRight'}
            aria-label={
              playing ? t('player.pause', { title: entry.title }) : t('player.play', { title: entry.title })
            }
            onClick={toggle}
          />
          <div className={styles.wave}>
            <Waveform
              peaks={peaks}
              height={56}
              playhead
              progress={seconds > 0 ? Math.min(1, positionMs / 1000 / seconds) : 0}
              duration={seconds}
              onSeek={seek}
            />
          </div>
          <span className={styles.time}>
            {t('player.time', { current: formatDuration(positionMs / 1000), total: formatDuration(seconds) })}
          </span>
        </div>
        <p className={styles.note}>{t('entryPage.equalized')}</p>

        {own ? (
          <p className={styles.own}>
            {stats ? t('entryPage.ownStats', { votes: stats.votes, plays: stats.plays }) : t('entryPage.own')}
          </p>
        ) : votable ? (
          <Stars
            className={styles.stars}
            label={t('entryPage.starsLabel', { alias: entry.alias })}
            value={saved}
            listen={listen}
            onVote={async (stars) => {
              await sendVote(stars)
              setVote(stars)
            }}
          />
        ) : votingOpen ? (
          <p className={styles.note}>{me ? t('entryPage.verifyToVote') : t('entryPage.signInToVote')}</p>
        ) : null}

        <div className={styles.actions}>
          <Button variant="outline" onClick={share}>
            {t('entryPage.share')}
          </Button>
          {me && !own && (
            <Button variant="outline" onClick={() => setReporting(true)}>
              {t('entryPage.report')}
            </Button>
          )}
        </div>
        {shared && <Done>{t('entryPage.shared')}</Done>}
      </div>
      <ReportDialog
        entryId={entry.id}
        alias={entry.alias}
        open={reporting}
        onClose={() => setReporting(false)}
      />
    </ScreenPage>
  )
}
