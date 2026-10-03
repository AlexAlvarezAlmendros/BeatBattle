import { COMPONENT_ANCHORS } from '../anchors'
import type { GallerySectionEntry } from '../registry'

/**
 * Índice de la galería: sus secciones, en orden, cada una en su fichero de esta carpeta (ver
 * `../registry.ts`). Cada tarea que añade piezas añade aquí su sección.
 */
export const GALLERY_SECTIONS: readonly GallerySectionEntry[] = [
  {
    id: 'base',
    title: 'dev.gallery.sections.base',
    anchors: [
      { id: 'base-paleta', label: 'dev.gallery.base.blocks.palette' },
      { id: 'base-contraste', label: 'dev.gallery.base.blocks.contrast' },
      { id: 'base-tipografia', label: 'dev.gallery.base.blocks.typography' },
      { id: 'base-escala', label: 'dev.gallery.base.blocks.scale' },
      { id: 'base-forma', label: 'dev.gallery.base.blocks.shape' },
      { id: 'base-primitivas', label: 'dev.gallery.base.blocks.primitives' },
      { id: 'base-cursor', label: 'dev.gallery.base.blocks.cursor' },
    ],
    load: () => import('./BaseSection'),
  },
  {
    id: 'componentes',
    title: 'dev.gallery.sections.components',
    anchors: COMPONENT_ANCHORS.map(({ id, key }) => ({
      id,
      label: `dev.gallery.components.${key}` as const,
    })),
    load: () => import('./ComponentsSection'),
  },
]
