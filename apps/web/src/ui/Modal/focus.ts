/** Elementos que pueden recibir el foco con Tab. */
const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',')

/** Elementos tabulables dentro de `root`, en orden de documento (sin `tabindex="-1"` ni ocultos). */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.tabIndex >= 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]'),
  )
}

/**
 * Trampa de foco: con Tab al final vuelve al principio y con Mayús+Tab al principio salta al final.
 * Devuelve `true` si ha movido el foco (y entonces hay que cancelar el evento).
 */
export function trapTab(root: HTMLElement, shiftKey: boolean): boolean {
  const items = tabbables(root)
  const active = document.activeElement
  if (items.length === 0) {
    root.focus()
    return true
  }
  const first = items[0]!
  const last = items[items.length - 1]!
  if (shiftKey && (active === first || active === root || !root.contains(active))) {
    last.focus()
    return true
  }
  if (!shiftKey && (active === last || !root.contains(active))) {
    first.focus()
    return true
  }
  return false
}

/** Contador de modales abiertos: el bloqueo del scroll se quita al cerrar el último. */
let scrollLocks = 0
let saved: { overflow: string; paddingRight: string } | null = null

/**
 * Bloquea el scroll de la página mientras haya un modal abierto, compensando el ancho de la barra
 * de scroll para que el contenido no salte. Devuelve la función que lo libera.
 */
export function lockScroll(): () => void {
  const body = document.body
  if (scrollLocks === 0) {
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    body.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
  }
  scrollLocks += 1
  let released = false
  return () => {
    if (released) return
    released = true
    scrollLocks -= 1
    if (scrollLocks === 0 && saved) {
      body.style.overflow = saved.overflow
      body.style.paddingRight = saved.paddingRight
      saved = null
    }
  }
}
