import { type PublicWeek, PublicWeekSchema } from '@beatbattle/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { type LoaderFunctionArgs, useLoaderData, useLocation } from 'react-router'
import { paths } from '../../app/paths'
import { notFound } from '../../app/routes'
import { ScreenPage } from '../../app/ScreenPage'
import { formatDuration, t } from '../../i18n'
import { ApiClientError, apiFetch } from '../../net/api'
import { queryKeys } from '../../net/queryKeys'
import { acceptRules, requestDownload, weekQuery } from '../../net/weeks'
import { Button } from '../../ui/Button'
import { DataChip } from '../../ui/Chip'
import { useFitText } from '../../ui/hooks/useFitText'
import { RoundClock } from '../../ui/RoundClock'
import { Tag } from '../../ui/Tag'
import { VinylSun } from '../../ui/VinylSun'
import { Waveform } from '../../ui/Waveform'
import { PaperNotice } from '../account/FormBits'
import { useSession } from '../account/session'
import { DropReveal } from './DropReveal'
import { RulesModal } from './RulesModal'
import { useSamplePlayer } from './useSamplePlayer'
import styles from './WeekPage.module.css'
import { decodePeaks, menuWeekOf, musicalKeyName, rangeText } from './weekModel'

/** `/semana/:slug`: 404 con la página propia si no existe o aún no ha caído (§2.1, `scheduled`). */
export async function weekLoader({ params, request }: LoaderFunctionArgs): Promise<PublicWeek> {
  try {
    return await apiFetch(`/api/weeks/${encodeURIComponent(params.slug ?? '')}`, {
      schema: PublicWeekSchema,
      signal: request.signal,
    })
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound()
    throw error
  }
}

type DownloadState = 'idle' | 'busy' | 'started' | 'error' | 'unverified'

/**
 * `/semana/:slug` — la ficha del drop (§2.4, §3.8.14; tarea 3.16): el vinilo-sol al BPM del sample, el
 * título y los créditos, los chips, la onda reproducible con el MP3 de escucha (`RF-DROP-09`: suena sin
 * cuenta), la cuenta atrás, el reto y la licencia. «Pillar el sample» abre las bases la primera vez
 * (`RF-DROP-06`) y descarga con la URL firmada de 1 h (`RF-DROP-07`); sin sesión, lleva a entrar.
 */
export function WeekPage() {
  const initial = useLoaderData() as PublicWeek
  const { data: week = initial } = useQuery({ ...weekQuery(initial.slug), initialData: initial })
  const me = useSession((state) => state.me)
  const status = useSession((state) => state.status)
  const location = useLocation()
  const queryClient = useQueryClient()
  const [rulesOpen, setRulesOpen] = useState<null | 'original' | 'stems'>(null)
  const [download, setDownload] = useState<DownloadState>('idle')
  const [replay, setReplay] = useState(false)
  const player = useSamplePlayer(week.sample.streamUrl, week.sample.durationMs / 1000)
  const live = menuWeekOf(week, Date.now())
  const peaks = decodePeaks(week.sample.peaks)
  const seconds = week.sample.durationMs / 1000
  const titleRef = useRef<HTMLParagraphElement>(null)
  useFitText(titleRef, week.sample.title, { minFontPx: 24 })

  const start = async (kind: 'original' | 'stems') => {
    setDownload('busy')
    try {
      const { downloadUrl } = await requestDownload(week.slug, kind)
      // Adjunto: el navegador lo descarga sin salir de la página.
      window.location.assign(downloadUrl)
      setDownload('started')
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'RULES_NOT_ACCEPTED') {
        setDownload('idle')
        setRulesOpen(kind)
        return
      }
      setDownload(
        error instanceof ApiClientError && error.code === 'EMAIL_NOT_VERIFIED' ? 'unverified' : 'error',
      )
    }
  }

  const ask = (kind: 'original' | 'stems') => {
    if (week.viewer?.rulesAccepted) void start(kind)
    else setRulesOpen(kind)
  }

  const accept = async () => {
    const kind = rulesOpen ?? 'original'
    setDownload('busy')
    try {
      await acceptRules(week.slug)
      queryClient.setQueryData(queryKeys.weeks.detail(week.slug), {
        ...week,
        viewer: { dropSeen: week.viewer?.dropSeen ?? false, rulesAccepted: true },
      })
      setRulesOpen(null)
      await start(kind)
    } catch (error) {
      setDownload(
        error instanceof ApiClientError && error.code === 'EMAIL_NOT_VERIFIED' ? 'unverified' : 'error',
      )
      setRulesOpen(null)
    }
  }

  const open = live?.phase === 'open'
  const signIn = `${paths.signIn()}?next=${encodeURIComponent(location.pathname)}`
  const actions =
    status !== 'loading' && !me ? (
      <Button to={signIn} variant="cta" size="lg">
        {t('pages.week.signInToDownload')}
      </Button>
    ) : (
      <>
        <Button
          variant="cta"
          size="lg"
          loading={download === 'busy'}
          onClick={() => ask('original')}
          disabledReason={open ? undefined : t('pages.week.closedReason')}
        >
          {t('pages.week.download')}
        </Button>
        {week.sample.hasStems && open && (
          <Button variant="outline" size="lg" onClick={() => ask('stems')}>
            {t('pages.week.stems')}
          </Button>
        )}
      </>
    )

  return (
    <ScreenPage
      title={week.sample.title}
      kicker={t('pages.week.kicker', { number: week.number })}
      documentTitle={t('pages.week.documentTitle', { number: week.number, title: week.sample.title })}
      fill
      piece={
        <div className={styles.piece}>
          <VinylSun
            stage
            className={styles.vinyl}
            label={`S${week.number}`}
            sub={week.sample.bpm ? `${Math.round(week.sample.bpm)} BPM` : week.label}
            bpm={week.sample.bpm ?? 90}
          />
        </div>
      }
    >
      <div className={styles.body}>
        <header className={styles.head}>
          <p className="bb-label">{rangeText(week)}</p>
          {/* El título en display (el `<h1>` lo pone la cabeza de móvil y, en escritorio, va en la placa). */}
          <p ref={titleRef} className={`bb-display ${styles.title}`} aria-hidden="true">
            {week.sample.title}
          </p>
          <p className={styles.credits}>{week.sample.credits}</p>
          {week.sample.origin && (
            <p className={styles.origin}>{t('pages.week.origin', { origin: week.sample.origin })}</p>
          )}
        </header>

        <div className={styles.chips}>
          {week.sample.bpm !== null && (
            <DataChip value={Math.round(week.sample.bpm)} unit={t('home.stage.bpmUnit')} />
          )}
          {week.sample.musicalKey && <DataChip value={musicalKeyName(week.sample.musicalKey)} word />}
          <DataChip value={formatDuration(seconds)} unit={t('home.stage.minUnit')} />
          {week.sample.genreHint && (
            <DataChip value={week.sample.genreHint} unit={t('home.stage.suggested')} unitFirst word />
          )}
        </div>

        <div className={styles.player}>
          <Button
            variant="white"
            iconOnly
            icon={player.playing ? 'pause' : 'triangleRight'}
            aria-label={t(player.playing ? 'pages.week.pause' : 'pages.week.listen', {
              title: week.sample.title,
            })}
            aria-pressed={player.playing}
            onClick={player.toggle}
          />
          <Waveform
            className={styles.wave}
            peaks={peaks}
            height={56}
            progress={player.progress}
            duration={seconds}
            onSeek={player.seek}
            animateIn={false}
          />
          <span className={styles.time}>
            {t('home.stage.time', {
              current: formatDuration(player.current),
              total: formatDuration(seconds),
            })}
          </span>
        </div>

        {live ? (
          <RoundClock
            className={styles.clock}
            target={live.closesAt}
            label={t(live.phase === 'open' ? 'pages.week.closes' : 'pages.week.votes')}
            variant="inline"
            when={live.clockWhen}
            week={live.weekBar}
          />
        ) : (
          <p className={styles.sealed}>
            <Tag tone="white">{t('pages.week.sealed')}</Tag>
          </p>
        )}

        {week.challenge && (
          <p className={styles.challenge}>
            <Tag tone="white">{t('pages.week.challenge')}</Tag> {week.challenge}{' '}
            <span className={styles.note}>{t('pages.week.challengeNote')}</span>
          </p>
        )}

        <div className={styles.actions}>{actions}</div>
        {download === 'started' && <PaperNotice live>{t('pages.week.downloading')}</PaperNotice>}
        {download === 'error' && <PaperNotice live>{t('pages.week.downloadError')}</PaperNotice>}
        {download === 'unverified' && (
          <PaperNotice
            live
            action={
              <Button to={paths.verify()} size="sm" variant="outline">
                {t('account.verify.resend')}
              </Button>
            }
          >
            {t('pages.week.unverified')}
          </PaperNotice>
        )}

        {live && (
          <Button className={styles.replay} variant="outline" size="sm" onClick={() => setReplay(true)}>
            {t('pages.week.replay')}
          </Button>
        )}

        <details className={styles.license}>
          <summary className="bb-label">{t('pages.week.license')}</summary>
          <p>{week.sample.licenseText}</p>
        </details>
      </div>

      {replay && (
        <DropReveal
          week={{
            number: week.number,
            title: week.sample.title,
            bpm: week.sample.bpm,
            musicalKey: week.sample.musicalKey,
            streamUrl: week.sample.streamUrl,
          }}
          onDone={() => setReplay(false)}
        />
      )}
      <RulesModal
        open={rulesOpen !== null}
        weekNumber={week.number}
        busy={download === 'busy'}
        error={null}
        onClose={() => setRulesOpen(null)}
        onAccept={() => void accept()}
      />
    </ScreenPage>
  )
}
