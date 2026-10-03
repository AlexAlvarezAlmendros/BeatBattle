import { useId, useRef } from 'react'
import { formatDuration, t } from '../../i18n'
import { Button } from '../Button'
import { CoverArt } from '../CoverArt'
import { DataTile, DataTileList } from '../DataTile'
import { Frame } from '../Frame'
import { cx } from '../forceState'
import { useFitText } from '../hooks/useFitText'
import { Icon } from '../Icon'
import { Skeleton, SkeletonGroup } from '../Skeleton'
import { Stamp } from '../Stamp'
import { Waveform, type WaveformPeak } from '../Waveform'
import styles from './FighterCard.module.css'

/** Lo que la ficha sabe de una entrada durante el voto ciego (§1.3): nada de autoría ni recuentos. */
export interface FighterEntry {
  /** Alias de batalla (nunca el productor antes del sellado). */
  alias: string
  title: string
  bpm: number
  /** Tonalidad en palabras («Re menor», §3.2). */
  musicalKey: string
  durationSeconds: number
  genre: string
  peaks: readonly WaveformPeak[]
  /** Tu voto, si ya has votado (es estado propio, §3.3 «Sello de goma»). */
  myVote?: number
}

export interface FighterCardProps {
  entry?: FighterEntry
  /** Segundos de escucha que desbloquean las estrellas (`RF-VOTE-*`, 45 s). */
  listenSeconds?: number
  loading?: boolean
  /** No se ha podido cargar la entrada: aviso de papel y reintentar. */
  error?: boolean
  onListen?: () => void
  onJury?: () => void
  onRetry?: () => void
  className?: string
}

/**
 * Ficha de luchador (guía §3.3, §3.8.13): la entrada enfocada en la selección. Retrato (la portada en
 * marco blanco con el sello «AUTORÍA OCULTA»), columna de cuatro teselas (tempo, tonalidad, duración,
 * género), **banda del alias** (placa negra con filete blanco y cuña roja; el alias se ajusta a su
 * ancho, `useFitText`) y panel opaco con el título, el estado propio («SIN VOTAR · Escucha 45 s…»), la
 * previa de la onda y los botones. Se actualiza al mover el cursor: su región es viva y educada.
 *
 * Integridad (§1.3): ni autoría, ni medias, ni recuentos, ni posición; el único estado es el del
 * usuario (su voto).
 */
export function FighterCard({
  entry,
  listenSeconds = 45,
  loading = false,
  error = false,
  onListen,
  onJury,
  onRetry,
  className,
}: FighterCardProps) {
  const aliasId = useId()
  const aliasRef = useRef<HTMLHeadingElement>(null)
  useFitText(aliasRef, entry?.alias ?? '')

  if (error || (!entry && !loading)) {
    return (
      <Frame as="section" cut="lg" className={cx(styles.card, styles.failed, className)} role="alert">
        <p className={styles.paper}>
          <Icon name="alert" />
          {t('ui.fighterCard.error')}
        </p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            {t('ui.fighterCard.retry')}
          </Button>
        )}
      </Frame>
    )
  }

  if (loading || !entry) {
    return (
      <SkeletonGroup
        className={cx(styles.card, styles.loading, className)}
        label={t('ui.fighterCard.loading')}
      >
        <div className={styles.top}>
          <Skeleton className={styles.portraitSkeleton} />
          <div className={styles.tilesSkeleton}>
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} />
            ))}
          </div>
        </div>
        <Skeleton height="var(--bb-space-16)" />
        <Skeleton height="var(--bb-space-16)" />
      </SkeletonGroup>
    )
  }

  const voted = entry.myVote !== undefined
  return (
    <section className={cx(styles.card, className)} aria-labelledby={aliasId} aria-live="polite">
      <div className={styles.top}>
        <div className={styles.portrait}>
          <Frame variant="title" cut="lg" className={styles.cover}>
            <CoverArt />
          </Frame>
          <Stamp className={styles.hidden} turn={-0.7}>
            {t('ui.fighterCard.authorHidden')}
          </Stamp>
        </div>
        <DataTileList className={styles.tiles} columns={1}>
          <DataTile label={t('ui.fighterCard.tempo')} value={entry.bpm} unit={t('ui.fighterCard.bpm')} />
          <DataTile label={t('ui.fighterCard.key')} value={entry.musicalKey} word />
          <DataTile label={t('ui.fighterCard.duration')} value={formatDuration(entry.durationSeconds)} />
          <DataTile label={t('ui.fighterCard.genre')} value={entry.genre} word />
        </DataTileList>
      </div>
      <div className={styles.band}>
        <h2 ref={aliasRef} id={aliasId} className={cx('bb-display', styles.alias)}>
          {entry.alias}
        </h2>
      </div>
      <Frame cut="base" className={styles.panel}>
        <p className={styles.titleLine}>
          <span className="bb-label">{t('ui.fighterCard.titleLabel')}</span> <b>{entry.title}</b>
        </p>
        <p className={styles.status}>
          <Stamp size="sm" turn={-0.2}>
            {voted ? t('ui.fighterCard.voted', { vote: entry.myVote ?? 0 }) : t('ui.fighterCard.notVoted')}
          </Stamp>
          <span>
            {voted
              ? t('ui.fighterCard.votedHint')
              : t('ui.fighterCard.listenHint', { seconds: listenSeconds })}
          </span>
        </p>
        <div className={styles.preview}>
          <span className="bb-label">{t('ui.fighterCard.preview')}</span>
          <Waveform peaks={entry.peaks} height={32} animateIn={false} decorative />
          <span className={styles.time}>{formatDuration(entry.durationSeconds)}</span>
        </div>
        <div className={styles.actions}>
          <Button icon="triangleRight" keyHint={t('frame.keys.glyph.enter')} onClick={onListen}>
            {t('ui.fighterCard.listen')}
          </Button>
          <Button variant="outline" keyHint={t('ui.fighterCard.juryKey')} onClick={onJury}>
            {t('ui.fighterCard.jury')}
          </Button>
        </div>
      </Frame>
    </section>
  )
}
