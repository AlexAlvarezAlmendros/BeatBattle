import type { HTMLAttributes, Ref } from 'react'
import { t } from '../../i18n'
import { CoverArt } from '../CoverArt'
import { Cursor } from '../Cursor'
import { Frame } from '../Frame'
import { cx, forceStateAttr, type InteractionState } from '../forceState'
import { Icon } from '../Icon'
import { Skeleton } from '../Skeleton'
import { Stamp } from '../Stamp'
import styles from './EntryCell.module.css'

/** Props que pone la rejilla (`useRovingGrid().getItemProps(i)`). */
export type EntryCellItemProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<HTMLElement> | ((element: HTMLElement | null) => void)
}

export interface EntryCellProps {
  /** Alias de batalla (dos líneas como mucho). Sin él, es la casilla «?» de aleatorio. */
  alias?: string
  bpm?: number
  /** Tonalidad en palabras. */
  musicalKey?: string
  /** Tu voto (1–5), si ya has votado: la casilla se atenúa y lleva el sello «✓ VOTADA n/5». */
  myVote?: number
  loading?: boolean
  /** La entrada no ha cargado. */
  error?: boolean
  itemProps: EntryCellItemProps
  state?: InteractionState
  className?: string
}

/**
 * Casilla de entrada (guía §3.3, §3.8.13): portada cuadrada en marco de chaflán `--bb-cut` y el alias
 * en dos líneas como mucho (12 px, mayúsculas). **Enfocada**: cursor blanco con 1P, marco rojo y alias
 * blanco. **Votada**: portada al 42 % y «✓ VOTADA n/5» (es tu voto). **Aleatorio**: la casilla «?».
 * `role="option"` dentro del `listbox` 2D (lo ponen las `itemProps`), y se anuncia «Tigre Púrpura,
 * 94 BPM, Re menor, sin votar».
 *
 * Integridad (§1.3): sin números de orden, medias, recuentos ni autoría; todas iguales de tamaño, marco
 * y tinta.
 */
export function EntryCell({
  alias,
  bpm,
  musicalKey,
  myVote,
  loading = false,
  error = false,
  itemProps,
  state,
  className,
}: EntryCellProps) {
  const { ref, ...item } = itemProps
  const random = alias === undefined
  const voted = myVote !== undefined
  const label = random
    ? t('ui.entryCell.randomLabel')
    : loading
      ? t('ui.entryCell.loading')
      : t('ui.entryCell.label', {
          alias,
          bpm: bpm ?? 0,
          key: musicalKey ?? '',
          state: error
            ? t('ui.entryCell.error')
            : voted
              ? t('ui.entryCell.votedState', { vote: myVote })
              : t('ui.entryCell.notVoted'),
        })
  return (
    <div
      {...item}
      ref={ref as Ref<HTMLDivElement>}
      role="option"
      tabIndex={item.tabIndex ?? -1}
      className={cx(styles.cell, className)}
      aria-label={label}
      aria-busy={loading || undefined}
      data-voted={voted || undefined}
      data-random={random || undefined}
      data-error={error || undefined}
      {...forceStateAttr(state)}
    >
      <Cursor cut="base" player="top" />
      <Frame cut="base" className={styles.art} aria-hidden="true">
        {loading ? (
          <Skeleton className={styles.skeleton} />
        ) : random ? (
          <span className={cx('bb-display', styles.random)}>{t('ui.entryCell.randomGlyph')}</span>
        ) : error ? (
          <span className={styles.failed}>
            <Icon name="alert" />
          </span>
        ) : (
          <CoverArt className={styles.cover} />
        )}
      </Frame>
      {voted && !loading && (
        <Stamp size="sm" turn={-0.6} className={styles.stamp} aria-hidden="true">
          {t('ui.entryCell.voted', { vote: myVote })}
        </Stamp>
      )}
      <span className={styles.alias} aria-hidden="true">
        {random ? t('ui.entryCell.random') : loading ? '' : alias}
      </span>
    </div>
  )
}
