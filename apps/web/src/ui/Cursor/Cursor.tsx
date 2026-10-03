import { t } from '../../i18n'
import type { FrameCut } from '../Frame'
import './cursor.css'

/** Forma de la pieza que lleva el cursor: chaflán (marcos, casillas) o paralelogramo (placas, pestañas). */
export type CursorShape = 'cut' | 'slant'

/** Paralelogramo grande (`--bb-slant`, placas del menú) o pequeño (`--bb-slant-sm`, etiquetas). */
export type CursorSlant = 'base' | 'sm'

/** Dónde va la etiqueta 1P: a la izquierda (listas) o encima (rejillas). */
export type CursorPlayer = 'left' | 'top'

export interface CursorProps {
  shape?: CursorShape
  /** Chaflán de la pieza, si `shape` es `cut` (por defecto, `base`). */
  cut?: FrameCut
  /** Paralelogramo de la pieza, si `shape` es `slant` (por defecto, `base`). */
  slant?: CursorSlant
  /** Etiqueta 1P: `true` o `'left'` a la izquierda, `'top'` encima; sin ella, solo el marco. */
  player?: boolean | CursorPlayer
}

/**
 * Cursor de juego (§3.3): el marco blanco de 3 px separado 4 px que marca la opción enfocada, con la
 * etiqueta 1P opcional. Va **dentro** del elemento enfocable, que lleva los atributos de
 * `cursorHostAttributes()` (o los que ya dan `useRovingMenu`, `useRovingGrid` y `useRovingTabs`). Es
 * decorativo (`aria-hidden`): el foco real está en el elemento, y lo que se lee es su nombre.
 *
 * ```tsx
 * <a {...menu.getItemProps(0)} className={styles.plate}>
 *   <Cursor shape="slant" player />
 *   …
 * </a>
 * ```
 */
export function Cursor({ shape = 'cut', cut = 'base', slant = 'base', player = false }: CursorProps) {
  const position: CursorPlayer | undefined = player === true ? 'left' : player || undefined
  return (
    <>
      <span
        data-cursor-ring={shape}
        data-cursor-cut={shape === 'cut' ? cut : undefined}
        data-cursor-slant={shape === 'slant' ? slant : undefined}
        aria-hidden="true"
      />
      {position && (
        <span data-cursor-player={position} data-tag="cta" data-tag-size="md" aria-hidden="true">
          {t('ui.cursor.player')}
        </span>
      )}
    </>
  )
}

/**
 * Atributos del elemento que lleva el cursor, para una pieza suelta que no usa los hooks de foco
 * itinerante. `active` marca la opción elegida, que enseña el cursor aunque el foco esté fuera de su
 * grupo (`data-cursor-group`).
 */
export function cursorHostAttributes(active = false): {
  'data-cursor': ''
  'data-cursor-active'?: 'true'
} {
  return active ? { 'data-cursor': '', 'data-cursor-active': 'true' } : { 'data-cursor': '' }
}
