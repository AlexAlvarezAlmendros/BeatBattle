/**
 * Cuándo sale la pantalla de título (guía §3.8.1, tarea 1.13): la primera vez que se entra al menú en cada
 * sesión, salvo que se haya desactivado (Opciones; hasta que existan, `localStorage['bb:title'] = 'off'`).
 * Las pruebas la desactivan en su configuración; las suyas la vuelven a encender.
 */

/** Desactivada a mano (Opciones). */
export const TITLE_KEY = 'bb:title'
/** Ya se ha visto en esta sesión. */
export const TITLE_SEEN_KEY = 'bb:title-seen'

export function shouldShowTitle(): boolean {
  try {
    if (window.localStorage.getItem(TITLE_KEY) === 'off') return false
    return window.sessionStorage.getItem(TITLE_SEEN_KEY) !== 'yes'
  } catch {
    // Sin almacenamiento, una vez por carga.
    return true
  }
}

export function markTitleSeen(): void {
  try {
    window.sessionStorage.setItem(TITLE_SEEN_KEY, 'yes')
  } catch {
    // Sin almacenamiento: volverá a salir en la próxima carga.
  }
}
