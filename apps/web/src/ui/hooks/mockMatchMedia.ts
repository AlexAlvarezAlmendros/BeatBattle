/**
 * `matchMedia` simulado para los tests (jsdom no lo trae). Cada consulta empieza con el valor de
 * `initial` (o `false`) y `set()` lo cambia y avisa a quien escuche, como haría el navegador al
 * cambiar la preferencia del sistema.
 *
 * ```ts
 * const media = mockMatchMedia({ '(prefers-reduced-motion: reduce)': true })
 * …
 * media.restore()
 * ```
 *
 * Solo lo importan los tests; no entra en la build porque nada de la app lo usa.
 */
export interface MatchMediaController {
  /** Cambia el resultado de una consulta y dispara su evento `change`. */
  set(query: string, matches: boolean): void
  /** Deja `window.matchMedia` como estaba. */
  restore(): void
}

export function mockMatchMedia(initial: Readonly<Record<string, boolean>> = {}): MatchMediaController {
  const state = new Map(Object.entries(initial))
  const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>()
  const had = Object.hasOwn(window, 'matchMedia')
  const previous = window.matchMedia

  const matchMedia = (query: string): MediaQueryList => {
    const own = listeners.get(query) ?? new Set()
    listeners.set(query, own)
    return {
      get matches() {
        return state.get(query) ?? false
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => own.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        own.delete(listener),
      addListener: (listener: (event: MediaQueryListEvent) => void) => own.add(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) => own.delete(listener),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList
  }

  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMedia })

  return {
    set(query, matches) {
      state.set(query, matches)
      for (const listener of listeners.get(query) ?? []) {
        listener({ matches, media: query } as MediaQueryListEvent)
      }
    },
    restore() {
      if (had)
        Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: previous })
      else Reflect.deleteProperty(window, 'matchMedia')
    },
  }
}
