import type { ComponentType } from 'react'
import type { SimpleMessageKey } from '../../i18n'

/**
 * Registro de secciones de la galería (`/dev/galeria`, RD-VIS-03). Cada sección vive en su fichero de
 * `sections/` (exporta por defecto el componente que la pinta entera: su `<section id>` con su `<h2>`
 * y sus bloques `<h3>`), y `sections/index.ts` las lista en orden. Para añadir una sección: un fichero
 * nuevo en `sections/` y una entrada en `GALLERY_SECTIONS`; la cabecera, el índice y la carga diferida
 * salen de aquí.
 */

/** Un bloque de una sección, para el índice (su `<h3>` lleva ese `id`). */
export interface GalleryAnchor {
  id: string
  label: SimpleMessageKey
}

export interface GallerySectionEntry {
  /** `id` del `<section>` que pinta la sección: el ancla del índice. Único en la galería. */
  id: string
  /** Título (`<h2>`), también en el índice. */
  title: SimpleMessageKey
  /** Bloques de la sección, para el índice. */
  anchors?: readonly GalleryAnchor[]
  /** El fichero de la sección, que se carga aparte: la cabecera sale sin esperarlo. */
  load: () => Promise<{ default: ComponentType }>
}
