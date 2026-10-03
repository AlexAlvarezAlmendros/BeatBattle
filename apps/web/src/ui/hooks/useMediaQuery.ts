import { useCallback, useSyncExternalStore } from 'react'

/**
 * Consulta de medios como estado de React: `true` mientras `query` se cumple, y se actualiza al
 * cambiar (girar el móvil, cambiar la preferencia del sistema).
 *
 * Todas las instancias de una misma consulta comparten un único `MediaQueryList` y un único oyente
 * de `change` (`subscribeMedia`): una lista con cientos de botones no crea cientos de oyentes.
 *
 * Sin `matchMedia` (jsdom, render en servidor) devuelve `false`: ninguna pieza debe depender de
 * esto para funcionar, solo para decidir cuánto adorno pone.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => subscribeMedia(query, onChange), [query])
  const getSnapshot = useCallback(() => matchesMedia(query), [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** ¿Se cumple la consulta ahora mismo? `false` si el entorno no tiene `matchMedia`. */
export function matchesMedia(query: string): boolean {
  return getMediaQueryList(query)?.matches ?? false
}

interface MediaEntry {
  list: MediaQueryList | null
  listeners: Set<() => void>
  notify: () => void
}

/** Consultas con oyentes: un `change` por consulta, conectado con el primero y quitado con el último. */
const entries = new Map<string, MediaEntry>()

/** Avisa a `onChange` cuando cambie `query`. Devuelve la función que deja de escuchar. */
export function subscribeMedia(query: string, onChange: () => void): () => void {
  let entry = entries.get(query)
  if (!entry) {
    const listeners = new Set<() => void>()
    const created: MediaEntry = {
      list: getMediaQueryList(query),
      listeners,
      notify: () => {
        for (const listener of [...listeners]) listener()
      },
    }
    created.list?.addEventListener('change', created.notify)
    entries.set(query, created)
    entry = created
  }
  const current = entry
  current.listeners.add(onChange)
  return () => {
    current.listeners.delete(onChange)
    if (current.listeners.size > 0 || entries.get(query) !== current) return
    current.list?.removeEventListener('change', current.notify)
    entries.delete(query)
  }
}

/**
 * `MediaQueryList` de cada consulta, creado una vez (es un objeto vivo: `matches` se actualiza
 * solo). Si cambia `window.matchMedia` (los tests lo simulan), se empieza de cero.
 */
let listsFor: typeof window.matchMedia | null = null
const lists = new Map<string, MediaQueryList>()

function getMediaQueryList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  if (listsFor !== window.matchMedia) {
    lists.clear()
    listsFor = window.matchMedia
  }
  let list = lists.get(query)
  if (!list) {
    list = window.matchMedia(query)
    lists.set(query, list)
  }
  return list
}
