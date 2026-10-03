import { Children, type HTMLAttributes, isValidElement, type ReactNode, useId } from 'react'
import { Link, type To } from 'react-router'
import { formatNumber, t } from '../../i18n'
import { Button } from '../Button'
import { CoverArt } from '../CoverArt'
import { cx, forceStateAttr } from '../forceState'
import { Icon } from '../Icon'
import { Medal, type MedalPlace } from '../Medal'
import styles from './EntryRow.module.css'

/**
 * Estados forzables para la galería: `focus` y `pressed` son los del play (el primer control de la
 * fila) y `focusTitle`, el del enlace del título.
 */
export type EntryRowState = 'rest' | 'hover' | 'focus' | 'focusTitle' | 'pressed'

/** Estado del audio: cargando (el play enseña la onda de carga) o error (`RF-PLAY-09`). */
export type EntryRowStatus = 'idle' | 'loading' | 'error'

/** Resultado de una semana **sellada** (`RF-PLAY-05`): sin él, la fila no enseña posición ni nota. */
export interface EntryRowResult {
  position: number
  /** Media bayesiana (§2.8), con dos decimales. */
  score: number
  medal?: MedalPlace
}

export interface EntryRowProps {
  title: string
  /** Segunda línea («S40 · era Faro Errante · 41 votos»; antes del sellado, sin autoría ni votos). */
  subtitle?: string
  /** Solo tras el sellado. */
  result?: EntryRowResult
  /** Está sonando: play en rojo y su etiqueta pasa a «Pausar». */
  playing?: boolean
  status?: EntryRowStatus
  /** No se puede reproducir (p. ej. se está procesando): play deshabilitado y fila apagada. */
  disabled?: boolean
  /** Ficha de la entrada: el título enlaza ahí. */
  to?: To
  onPlayToggle?: () => void
  /** Acciones a la derecha, cuando las haya. */
  actions?: ReactNode
  titleAs?: 'h2' | 'h3' | 'h4'
  state?: EntryRowState
  className?: string
}

/**
 * Fila de entrada (guía §3.3; listas largas: archivo, clasificación, historial): un marcador de
 * 56–58 px con portada de 44 px, título y subtítulo, posición en display, puntuación en Oxanium y
 * medalla. **Antes del sellado, sin posición ni puntuación** (`RF-PLAY-05`): `result` solo llega con la
 * semana sellada. Hover: `--bb-panel-2`. Error de audio: aviso y reintentar (`RF-PLAY-09`).
 */
export function EntryRow({
  title,
  subtitle,
  result,
  playing = false,
  status = 'idle',
  disabled = false,
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
      data-sealed={result ? '' : undefined}
      {...forceStateAttr(
        state === 'focusTitle' || state === 'focus' || state === 'pressed' ? undefined : state,
      )}
    >
      <CoverArt className={styles.cover} />
      <Button
        variant={playing ? 'cta' : 'outline'}
        size="sm"
        iconOnly
        icon={playing ? 'pause' : 'play'}
        aria-label={t(
          status === 'error' ? 'ui.entryRow.retry' : playing ? 'ui.entryRow.pause' : 'ui.entryRow.play',
          { title },
        )}
        onClick={onPlayToggle}
        loading={status === 'loading'}
        loadingLabel={t('ui.entryRow.loading', { title })}
        disabled={disabled}
        state={state === 'focus' || state === 'pressed' ? state : undefined}
      />
      <div className={styles.info}>
        <TitleTag id={titleId} className={styles.title}>
          {to !== undefined ? (
            <Link
              to={to}
              className={cx(styles.titleText, styles.titleLink)}
              {...forceStateAttr(state === 'focusTitle' ? 'focus' : undefined)}
            >
              {title}
            </Link>
          ) : (
            <span className={styles.titleText}>{title}</span>
          )}
        </TitleTag>
        {status === 'error' ? (
          <p className={styles.error}>
            <Icon name="alert" />
            {t('ui.entryRow.loadError')}
          </p>
        ) : (
          subtitle && <p className={styles.subtitle}>{subtitle}</p>
        )}
      </div>
      {result && (
        <div className={styles.result}>
          <span className={cx('bb-display', styles.position)}>
            {t('ui.entryRow.position', { position: result.position })}
          </span>
          <span className={styles.score}>
            <span className="sr-only">{t('ui.entryRow.score')} </span>
            {formatNumber(result.score, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {result.medal && <Medal place={result.medal} className={styles.medal} />}
        </div>
      )}
      {actions && <div className={styles.actions}>{actions}</div>}
    </article>
  )
}

/** Lista de filas de entrada (`<ol>`). */
export function EntryList({ className, children, ...rest }: HTMLAttributes<HTMLOListElement>) {
  return (
    // biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none
    <ol role="list" {...rest} className={cx(styles.list, className)}>
      {Children.map(children, (child, index) =>
        isValidElement(child) ? <li key={child.key ?? index}>{child}</li> : null,
      )}
    </ol>
  )
}
