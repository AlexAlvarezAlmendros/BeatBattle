/**
 * Anclas de la galería para el índice. Van aparte de las secciones para que la cabecera de la página
 * (título, ajustes e índice) se pinte sin esperar a cargar los componentes.
 */

/** Secciones, en orden (las de los componentes cuelgan de «Componentes»). */
export const SECTION_ANCHORS = [
  { id: 'color', key: 'color' },
  { id: 'tipografia', key: 'typography' },
  { id: 'espaciado', key: 'spacing' },
  { id: 'radios', key: 'radii' },
  { id: 'sombras', key: 'shadows' },
  { id: 'movimiento', key: 'motion' },
  { id: 'componentes', key: 'components' },
] as const

/** Componentes, en el orden de §3.3. */
export const COMPONENT_ANCHORS = [
  { id: 'boton', key: 'button' },
  { id: 'chip', key: 'chip' },
  { id: 'tarjeta', key: 'card' },
  { id: 'tesela', key: 'dataTile' },
  { id: 'rotulo', key: 'sectionLabel' },
  { id: 'onda', key: 'waveform' },
  { id: 'fila', key: 'entryRow' },
  { id: 'modal', key: 'modal' },
  { id: 'aviso', key: 'toast' },
  { id: 'xp', key: 'xpBar' },
  { id: 'esqueleto', key: 'skeleton' },
  { id: 'cuenta-atras', key: 'countdown' },
] as const

export type ComponentKey = (typeof COMPONENT_ANCHORS)[number]['key']
