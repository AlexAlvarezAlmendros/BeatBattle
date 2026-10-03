/**
 * Lógica pura del foco itinerante de los menús de juego (guía §3.3 «El foco es el cursor», RD-MOT-05):
 * qué opción queda elegida al pulsar una tecla. La comparten `useRovingMenu`, `useRovingGrid` y
 * `useRovingTabs`; aquí no hay React ni DOM más allá de mirar el destino de un evento.
 */

/** Índice dentro de `[0, count)` dando la vuelta: `wrapIndex(-1, 6)` → 5. */
export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return ((index % count) + count) % count
}

/** Índice dentro de `[0, count)` sin dar la vuelta. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(Math.max(index, 0), count - 1)
}

export type Orientation = 'vertical' | 'horizontal'

export interface ListNavigationOptions {
  /** Las flechas dan la vuelta al llegar al final (por defecto, sí: «en bucle en listas y rejillas»). */
  loop?: boolean
  orientation?: Orientation
}

/**
 * Lista (menú de modos, pestañas, estrellas): flechas de su orientación, Inicio y Fin. Devuelve el
 * índice nuevo o `null` si la tecla no navega.
 */
export function listNavigation(
  key: string,
  index: number,
  count: number,
  { loop = true, orientation = 'vertical' }: ListNavigationOptions = {},
): number | null {
  if (count <= 0) return null
  const [previous, next] = orientation === 'vertical' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
  const step = (delta: number) => (loop ? wrapIndex(index + delta, count) : clampIndex(index + delta, count))
  switch (key) {
    case next:
      return step(1)
    case previous:
      return step(-1)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

export interface GridNavigationOptions {
  /** Las flechas dan la vuelta (por defecto, sí). */
  loop?: boolean
  /** Filas que saltan RePág y AvPág (por defecto, 4: §3.8.13). */
  pageRows?: number
}

/**
 * Rejilla (listbox en dos dimensiones, §3.8.13): ←/→ recorren en orden de lectura (y dan la vuelta de
 * la última a la primera), ↑/↓ cambian de fila conservando la columna (de la última fila a la
 * primera y al revés; si la columna no existe en la última fila, la anterior), Inicio/Fin van a la
 * primera y la última, RePág/AvPág saltan `pageRows` filas sin dar la vuelta.
 */
export function gridNavigation(
  key: string,
  index: number,
  count: number,
  columns: number,
  { loop = true, pageRows = 4 }: GridNavigationOptions = {},
): number | null {
  if (count <= 0) return null
  const cols = Math.max(1, Math.floor(columns))
  const column = index % cols
  const lastRowStart = Math.floor((count - 1) / cols) * cols
  switch (key) {
    case 'ArrowRight':
      return loop ? wrapIndex(index + 1, count) : clampIndex(index + 1, count)
    case 'ArrowLeft':
      return loop ? wrapIndex(index - 1, count) : clampIndex(index - 1, count)
    case 'ArrowDown': {
      const below = index + cols
      if (below < count) return below
      if (!loop) return index
      return column
    }
    case 'ArrowUp': {
      const above = index - cols
      if (above >= 0) return above
      if (!loop) return index
      const target = lastRowStart + column
      return target < count ? target : target - cols
    }
    case 'Home':
      return 0
    case 'End':
      return count - 1
    case 'PageDown': {
      const target = index + cols * pageRows
      if (target < count) return target
      const last = lastRowStart + column
      return last < count ? last : last - cols
    }
    case 'PageUp': {
      const target = index - cols * pageRows
      return target >= 0 ? target : column
    }
    default:
      return null
  }
}

/** Texto comparable para la letra inicial: sin acentos, en minúsculas y sin espacios delante. */
export function normalizeForTypeahead(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}

/**
 * Letra inicial (§3.8.3): la siguiente opción, desde la actual y dando la vuelta, cuya etiqueta
 * empieza por `char` (sin distinguir mayúsculas ni acentos: «s» encuentra «Salón de la fama»).
 * `null` si ninguna empieza así.
 */
export function typeaheadMatch(labels: readonly string[], from: number, char: string): number | null {
  const wanted = normalizeForTypeahead(char)
  if (!wanted) return null
  for (let offset = 1; offset <= labels.length; offset += 1) {
    const candidate = wrapIndex(from + offset, labels.length)
    if (normalizeForTypeahead(labels[candidate] ?? '').startsWith(wanted)) return candidate
  }
  return null
}

/** ¿Es una tecla de letra o cifra sin modificadores (para la letra inicial o las teclas globales)? */
export function isCharacterKey(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
): boolean {
  return (
    event.key.length === 1 && event.key.trim() !== '' && !event.ctrlKey && !event.metaKey && !event.altKey
  )
}

/** ¿El evento viene de un campo donde se escribe? Las teclas de juego no se roban ahí. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
}

/**
 * ¿El elemento activa con Intro por sí mismo (botón o enlace)? Entonces Intro se deja al navegador,
 * que genera el clic: así la activación pasa siempre por `click` y no se dispara dos veces.
 */
export function activatesNatively(element: Element, key: 'Enter' | ' '): boolean {
  if (element instanceof HTMLButtonElement) return true
  if (element instanceof HTMLInputElement) return ['button', 'submit', 'reset'].includes(element.type)
  if (element instanceof HTMLAnchorElement && element.hasAttribute('href')) return key === 'Enter'
  return false
}
