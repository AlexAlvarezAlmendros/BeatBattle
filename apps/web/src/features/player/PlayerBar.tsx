import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { paths } from '../../app/paths'
import { formatDuration, t } from '../../i18n'
import { Button } from '../../ui/Button'
import { CoverArt, GenerativeCover } from '../../ui/CoverArt'
import { Frame } from '../../ui/Frame'
import { Waveform } from '../../ui/Waveform'
import styles from './PlayerBar.module.css'
import { type PlayerTrack, usePlayer } from './store'

/** Variable con el alto de la barra del reproductor: se suma al margen del foco (`global.css`). */
export const PLAYER_HEIGHT_VAR = '--player-h'

/**
 * ¿Se esconde la barra en esta pantalla? En la home, mientras suena el sample (la tarjeta del escenario ya
 * es su mando), y en el Modo Jurado, que lleva su propio panel (§3.8.7).
 */
export function playerHiddenOn(pathname: string, track: PlayerTrack | null): boolean {
  if (!track) return true
  if (pathname === paths.jury()) return true
  return pathname === paths.home() && track.kind === 'sample'
}

/**
 * El reproductor global (guía §2.6; tarea 5.13), anclado abajo encima de la barra de controles: portada
 * (generativa en voto ciego), alias o título, anterior, play y siguiente, la onda con el progreso en rojo
 * (clic, arrastre y teclado, `RF-PLAY-06`), el tiempo y cerrar; en las entradas, «Votar» lleva a su ficha.
 * Barra fina en escritorio; en móvil, una fila mínima que se despliega con la onda y el resto
 * (`aria-expanded`). Si el audio no carga, lo dice con «Reintentar» (`RF-PLAY-09`).
 */
export function PlayerBar() {
  const { pathname } = useLocation()
  const track = usePlayer((state) => state.track)
  const status = usePlayer((state) => state.status)
  const positionMs = usePlayer((state) => state.positionMs)
  const queue = usePlayer((state) => state.queue)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const panelId = useId()
  const hidden = playerHiddenOn(pathname, track)
  usePlayerHeight(ref, !hidden)
  // Una pista nueva vuelve a la fila mínima.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al cambiar de pista
  useEffect(() => setOpen(false), [track?.id])
  if (hidden || !track) return null

  const player = usePlayer.getState()
  const playing = status === 'playing' || status === 'loading'
  const failed = status === 'error'
  const at = queue.findIndex((item) => item.id === track.id)
  const total = track.durationMs / 1000
  const time = t('player.time', { current: formatDuration(positionMs / 1000), total: formatDuration(total) })
  const prevButton = (
    <Button
      variant="outline"
      size="sm"
      iconOnly
      icon="prev"
      aria-label={t('player.prev')}
      onClick={() => player.prev()}
    />
  )
  const nextButton = (
    <Button
      variant="outline"
      size="sm"
      iconOnly
      icon="next"
      aria-label={t('player.next')}
      disabled={at < 0 || at >= queue.length - 1}
      onClick={() => player.next()}
    />
  )
  return (
    <section
      ref={ref}
      className={styles.bar}
      aria-label={t('player.label')}
      data-open={open || undefined}
      data-kind={track.kind}
    >
      <Frame as="span" cut="sm" className={styles.cover} aria-hidden="true">
        {track.cover?.kind === 'url' ? (
          <img src={track.cover.url} alt="" width={40} height={40} />
        ) : track.cover?.kind === 'generative' ? (
          <GenerativeCover
            seed={track.cover.seed}
            bpm={track.cover.bpm}
            musicalKey={track.cover.musicalKey}
          />
        ) : (
          <CoverArt />
        )}
      </Frame>
      <p className={styles.info}>
        <span className={styles.title}>{track.title}</span>
        <span className={styles.artist}>{track.artist}</span>
      </p>
      <div className={styles.transport}>
        <span className={styles.secondary}>{prevButton}</span>
        <Button
          variant="white"
          size="sm"
          iconOnly
          icon={playing ? 'pause' : 'triangleRight'}
          aria-label={
            playing ? t('player.pause', { title: track.title }) : t('player.play', { title: track.title })
          }
          onClick={() => player.toggle()}
        />
        <span className={styles.secondary}>{nextButton}</span>
      </div>
      <div id={panelId} className={styles.panel}>
        <div className={styles.wave}>
          <Waveform
            peaks={track.peaks ?? []}
            height={32}
            animateIn={false}
            progress={total > 0 ? Math.min(1, positionMs / 1000 / total) : 0}
            playhead
            duration={total}
            onSeek={(fraction) => player.seek(fraction * track.durationMs)}
            error={failed ? t('player.error') : undefined}
          />
        </div>
        {/* En móvil, anterior y siguiente bajan al panel desplegado, con el tiempo (la fila de arriba es
            para el título). */}
        <span className={styles.panelNav}>
          {prevButton}
          {nextButton}
        </span>
        <span className={styles.time}>{time}</span>
        {failed ? (
          <Button variant="outline" size="sm" onClick={() => player.retry()}>
            {t('player.retry')}
          </Button>
        ) : track.kind === 'entry' ? (
          <Button variant="cta" size="sm" to={paths.entry(track.id)}>
            {t('player.vote')}
          </Button>
        ) : null}
      </div>
      {failed && (
        <p className={styles.error} role="alert">
          {t('player.error')}
        </p>
      )}
      <Button
        className={styles.expand}
        variant="outline"
        size="sm"
        iconOnly
        icon={open ? 'chevronDown' : 'chevronUp'}
        aria-label={open ? t('player.collapse') : t('player.expand')}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      />
      <Button
        className={styles.close}
        variant="outline"
        size="sm"
        iconOnly
        icon="close"
        aria-label={t('player.close')}
        onClick={() => player.stop()}
      />
    </section>
  )
}

/** Publica el alto de la barra en la raíz (`--player-h`) mientras se ve, para el margen del foco. */
function usePlayerHeight(ref: { current: HTMLElement | null }, shown: boolean): void {
  useLayoutEffect(() => {
    const root = document.documentElement
    const bar = ref.current
    if (!shown || !bar) {
      root.style.removeProperty(PLAYER_HEIGHT_VAR)
      return
    }
    const update = () =>
      root.style.setProperty(PLAYER_HEIGHT_VAR, `${Math.ceil(bar.getBoundingClientRect().height)}px`)
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(bar)
    return () => {
      observer?.disconnect()
      root.style.removeProperty(PLAYER_HEIGHT_VAR)
    }
  }, [ref, shown])
}
