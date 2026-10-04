import { createBrowserRouter } from 'react-router'
import { routes } from './routes'

/** Forma del `history.state` que escribe React Router: `{ usr, key, idx }`. */
interface HistoryEntryState {
  key?: unknown
  [field: string]: unknown
}

/**
 * Da clave propia a la primera entrada del historial de este documento, si aún no la tiene.
 *
 * React Router saca `location.key` de `history.state.key` y, si no hay, usa `'default'`: la misma clave en
 * toda carga nueva. `ScrollRestoration` guarda las posiciones por clave, así que una URL cargada de nuevo
 * en la misma pestaña (escrita en la barra o desde un enlace externo) heredaba el desplazamiento de la
 * página que se cargó antes. Con una clave por entrada, una carga nueva empieza arriba, y una recarga o
 * Atrás/Adelante entre documentos recuperan su posición, porque el navegador conserva `history.state`.
 */
export function ensureHistoryEntryKey(history: History = window.history): string {
  const state = (history.state ?? {}) as HistoryEntryState
  if (typeof state.key === 'string' && state.key !== '') return state.key
  // Como las claves de React Router: corta y sin significado.
  const key = Math.random().toString(36).slice(2, 10)
  history.replaceState({ ...state, key }, '')
  return key
}

ensureHistoryEntryKey()

/** Router de la app (guía §2.18). Las rutas viven en `routes.tsx` para poder probarlas en memoria. */
export const router = createBrowserRouter(routes)
