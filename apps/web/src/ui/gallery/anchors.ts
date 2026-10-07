/**
 * Bloques de la sección «Componentes» de la galería (tarea 0.25), en el orden de §3.3. `matrix` dice si
 * el componente está en la matriz de estados de §3.3 (`stateMatrix.ts`): los que no (chip de dato,
 * sello, placa, portada y medalla) no son interactivos y se enseñan en sus variantes.
 */
export const COMPONENT_ANCHORS = [
  { id: 'boton', key: 'button', matrix: true },
  { id: 'opcion-menu', key: 'menuPlate', matrix: true },
  { id: 'pestanas', key: 'tabs', matrix: true },
  { id: 'chip-dato', key: 'dataChip', matrix: false },
  { id: 'chip-filtro', key: 'filterChip', matrix: true },
  { id: 'sello', key: 'stamp', matrix: false },
  { id: 'ficha', key: 'fighterCard', matrix: true },
  { id: 'casilla', key: 'entryCell', matrix: true },
  { id: 'fila', key: 'entryRow', matrix: true },
  { id: 'tesela', key: 'tile', matrix: true },
  { id: 'onda', key: 'waveform', matrix: true },
  { id: 'ventana', key: 'modal', matrix: true },
  { id: 'anunciador', key: 'announcer', matrix: true },
  { id: 'aviso', key: 'toast', matrix: true },
  { id: 'medidor', key: 'meter', matrix: true },
  { id: 'esqueleto', key: 'skeleton', matrix: true },
  { id: 'reloj', key: 'roundClock', matrix: true },
  { id: 'estrellas', key: 'stars', matrix: true },
  { id: 'placa', key: 'titlePlate', matrix: false },
  { id: 'portada', key: 'cover', matrix: false },
] as const

export type ComponentKey = (typeof COMPONENT_ANCHORS)[number]['key']

/** Componentes de la matriz de §3.3. */
export type MatrixComponentKey = Extract<(typeof COMPONENT_ANCHORS)[number], { matrix: true }>['key']
