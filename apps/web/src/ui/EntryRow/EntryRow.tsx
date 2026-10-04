import { Children, type HTMLAttributes, isValidElement, type ReactNode, useId } from 'react'
import { Link, type To } from 'react-router'
import { t } from '../../i18n'
import { Button } from '../Button'
import { cx, forceStateAttr } from '../forceState'
import { Icon } from '../Icon'
import { Waveform, type WaveformPeak } from '../Waveform'
import styles from './EntryRow.module.css'

/**
 * Estados forzables para la galería: `focus` y `pressed` son los del play (el primer control de la
 * fila) y `focusTitle`, el del enlace del título.
 */
export type EntryRowState = 'rest' | 'hover' | 'focus' | 'focusTitle' | 'pressed'

/**
 * Estado del audio de la fila (§3.3): `loading` mientras carga (el play enseña la onda de carga) y
 * `error` si no ha cargado (`RF-PLAY-09`: «No hemos podido cargar este beat», y el play reintenta).
 */
export type EntryRowStatus = 'idle' | 'loading' | 'error'

export interface EntryRowProps {
  title: string
  /** Alias del productor («Prod. by …»). */
  alias: string
  genres?: readonly string[]
  bpm?: number
  /** Tonalidad ya formateada («Re♯ menor»). */
  musicalKey?: string
  /** Picos de la mini onda. */
  peaks: readonly WaveformPeak[]
  /** Parte escuchada, en `[0, 1]`. */
  progress?: number
  /** Está sonando: play en rojo y su etiqueta pasa a «Pausar». */
  playing?: boolean
  /** Audio cargando o que no ha cargado (el play pasa a «Reintentar»). */
  status?: EntryRowStatus
  /** No se puede reproducir (p. ej. la entrada aún se está procesando): play deshabilitado y fila apagada. */
  disabled?: boolean
  coverUrl?: string
  /** Ficha de la entrada: el título enlaza ahí. */
  to?: To
  onPlayToggle?: () => void
  /** Acciones a la derecha (votar, compartir…), cuando las haya. */
  actions?: ReactNode
  /** Nivel del encabezado del título (por defecto `h3`). */
  titleAs?: 'h2' | 'h3' | 'h4'
  /** Estado forzado para la galería. */
  state?: EntryRowState
  className?: string
}

/**
 * Fila de entrada (§3.3): la anatomía de la lista de beats del sello (`BeatListRow`): portada, play
 * redondo, título, «Prod. by», chips de género, BPM y tonalidad en gris con cifras tabulares; la mini
 * onda sustituye a la barra de progreso. Hover: fondo `--bb-ink-700` y la mini onda «respira» (sin
 * movimiento, solo el fondo; Anexo E). El play se transforma en pausa (`Icon`, Anexo E). Con puntero
 * grueso, el enlace del título cubre toda la fila (RNF-A11Y-09).
 *
 * Estados (§3.3): cargando (el play enseña la onda de carga), error (`RF-PLAY-09`: el aviso «No hemos
 * podido cargar este beat» bajo el título y el play pasa a «Reintentar») y deshabilitado (no se puede
 * reproducir: play deshabilitado y la fila apagada).
 *
 * Solo pinta con props: el audio y el reproductor llegan en la Fase 5.
 */
export function EntryRow({
  title,
  alias,
  genres = [],
  bpm,
  musicalKey,
  peaks,
  progress = 0,
  playing = false,
  status = 'idle',
  disabled = false,
  coverUrl,
  to,
  onPlayToggle,
  actions,
  titleAs: TitleTag = 'h3',
  state,
  className,
}: EntryRowProps) {
  const titleId = useId()
  return (
    <article
      className={cx(styles.row, className)}
      aria-labelledby={titleId}
      data-playing={playing || undefined}
      data-status={status === 'idle' ? undefined : status}
      data-disabled={disabled || undefined}
      {...forceStateAttr(state === 'focusTitle' ? 'focus' : state)}
    >
      <div className={styles.thumb}>
        {coverUrl ? (
          <img src={coverUrl} alt={t('ui.entryRow.cover', { title })} loading="lazy" />
        ) : (
          <span className={styles.coverFallback} aria-hidden="true" />
        )}
      </div>

      <Button
        variant="icon"
        size="sm"
        icon={playing ? 'pause' : 'play'}
        aria-label={t(
          status === 'error' ? 'ui.entryRow.retry' : playing ? 'ui.entryRow.pause' : 'ui.entryRow.play',
          { title },
        )}
        onClick={onPlayToggle}
        loading={status === 'loading'}
        loadingLabel={t('ui.entryRow.loading', { title })}
        status={status === 'error' ? 'error' : 'idle'}
        disabled={disabled}
        state={state === 'focus' || state === 'pressed' ? state : undefined}
        className={styles.play}
      />

      <div className={styles.center}>
        <div className={styles.info}>
          <TitleTag id={titleId} className={styles.title}>
            {to !== undefined ? (
              <Link
                to={to}
                className={cx(styles.titleLink, styles.titleText)}
                {...forceStateAttr(state === 'focusTitle' ? 'focus' : undefined)}
              >
                {title}
              </Link>
            ) : (
              <span className={styles.titleText}>{title}</span>
            )}
          </TitleTag>
          {status === 'error' && (
            <p className={styles.error}>
              <Icon name="alert" className={styles.errorIcon} />
              {t('ui.entryRow.loadError')}
            </p>
          )}
          <div className={styles.meta}>
            <span className={styles.alias}>{t('ui.entryRow.by', { alias })}</span>
            {genres.length > 0 && (
              // biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none
              <ul role="list" className={styles.tags} aria-label={t('ui.entryRow.genres')}>
                {genres.map((genre) => (
                  <li key={genre} className={styles.tag}>
                    {genre}
                  </li>
                ))}
              </ul>
            )}
            {bpm !== undefined && <span className={styles.data}>{t('ui.entryRow.bpm', { bpm })}</span>}
            {musicalKey && <span className={styles.data}>{musicalKey}</span>}
          </div>
        </div>
        <div className={styles.wave}>
          {/* Sin entrada animada: en una lista no aporta y serían decenas de animaciones a la vez. */}
          <Waveform
            peaks={peaks}
            progress={progress}
            height={24}
            playhead={false}
            animateIn={false}
            decorative
          />
        </div>
      </div>

      {actions && <div className={styles.actions}>{actions}</div>}
    </article>
  )
}

/** Lista de filas de entrada (`<ol>`), con el filete entre filas del sello. */
export function EntryList({ className, children, ...rest }: HTMLAttributes<HTMLOListElement>) {
  return (
    // biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none
    <ol role="list" {...rest} className={cx(styles.list, className)}>
      {Children.map(children, (child, index) =>
        isValidElement(child) ? (
          <li key={child.key ?? index} className={styles.item}>
            {child}
          </li>
        ) : null,
      )}
    </ol>
  )
}
