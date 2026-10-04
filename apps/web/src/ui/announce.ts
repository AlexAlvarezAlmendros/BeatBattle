/**
 * Anunciador compartido (WCAG 4.1.3, mensajes de estado): una única región viva `polite`, oculta a la
 * vista, para lo que no tiene región propia (el resultado de un botón: «Subido (Hecho)»). Los avisos
 * y la cuenta atrás llevan las suyas.
 *
 * La región tiene que estar en el árbol de accesibilidad antes que el mensaje para que los lectores
 * de pantalla lo anuncien: las piezas que pueden anunciar llaman a `ensureAnnouncer()` al montarse.
 */

/** Espera entre vaciar la región y escribir el mensaje: así se anuncia aunque se repita el texto. */
export const ANNOUNCE_DELAY_MS = 100

let region: HTMLElement | null = null
let pending: ReturnType<typeof setTimeout> | undefined

/** Crea la región (una sola, al final de `<body>`) si aún no existe. `null` fuera del navegador. */
export function ensureAnnouncer(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  if (region?.isConnected) return region
  region = document.createElement('div')
  region.setAttribute('role', 'status')
  region.setAttribute('aria-live', 'polite')
  region.setAttribute('aria-atomic', 'true')
  region.className = 'sr-only'
  region.dataset.announcer = ''
  document.body.append(region)
  return region
}

/** Anuncia `message` a los lectores de pantalla, sin interrumpir (`polite`). */
export function announce(message: string): void {
  const node = ensureAnnouncer()
  if (!node) return
  clearTimeout(pending)
  node.textContent = ''
  pending = setTimeout(() => {
    node.textContent = message
  }, ANNOUNCE_DELAY_MS)
}
