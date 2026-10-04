import { useEffect } from 'react'
import { isIdleFocus } from '../../ui/hooks/roving'

/**
 * Mando (guía §3.3 «El foco es el cursor»; tarea 0.23): los menús de juego se recorren también con un
 * mando con el mapeo estándar del navegador (Gamepad API). El mando no tiene lógica propia: cada botón
 * se traduce a la tecla que ya entienden los menús y el marco, así que todo lo que funciona con teclado
 * funciona con mando y al revés.
 *
 * | Mando                         | Tecla           |
 * |-------------------------------|-----------------|
 * | Cruceta o palanca izquierda   | ← ↑ ↓ →         |
 * | A (abajo)                     | clic en el foco |
 * | B (derecha)                   | Esc             |
 * | LB / RB                       | Q / E           |
 *
 * Solo escucha mientras hay un mando conectado (`gamepadconnected`): sin mando, ni un fotograma de
 * trabajo. La A hace clic en el elemento enfocado (una tecla Intro sintética no activaría un enlace); con
 * el foco en ningún control (`isIdleFocus`: `<body>` o el `<main>` del marco), es Intro, como el teclado.
 */

/** Botones del mapeo estándar (https://w3c.github.io/gamepad/#remapping). */
export const GAMEPAD_KEYS: ReadonlyMap<number, string> = new Map([
  [12, 'ArrowUp'],
  [13, 'ArrowDown'],
  [14, 'ArrowLeft'],
  [15, 'ArrowRight'],
  [1, 'Escape'],
  [4, 'q'],
  [5, 'e'],
])

/** Botón A: activa lo que tiene el foco. */
export const GAMEPAD_ACCEPT = 0

/** A partir de dónde la palanca cuenta como una flecha. */
export const STICK_THRESHOLD = 0.6

/** Teclas que corresponden a la palanca izquierda (ejes 0 y 1). */
export function stickKeys(axes: readonly number[]): string[] {
  const [x = 0, y = 0] = axes
  const keys: string[] = []
  if (y <= -STICK_THRESHOLD) keys.push('ArrowUp')
  if (y >= STICK_THRESHOLD) keys.push('ArrowDown')
  if (x <= -STICK_THRESHOLD) keys.push('ArrowLeft')
  if (x >= STICK_THRESHOLD) keys.push('ArrowRight')
  return keys
}

/** Lo que está pulsado en un mando: teclas y si la A está abajo. */
export function pressedInputs(pad: Pick<Gamepad, 'buttons' | 'axes'>): Set<string> {
  const pressed = new Set<string>(stickKeys(pad.axes))
  pad.buttons.forEach((button, index) => {
    if (!button.pressed) return
    if (index === GAMEPAD_ACCEPT) pressed.add('accept')
    const key = GAMEPAD_KEYS.get(index)
    if (key) pressed.add(key)
  })
  return pressed
}

/** Lanza la tecla sobre el foco (o el documento): la recogen los menús y el marco como si fuera el teclado. */
function sendKey(key: string): void {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

/**
 * La A: con el foco en ningún control (la página recién cargada, o el `<main>` del marco tras Esc o al
 * cambiar de pantalla), Intro, que el menú de la pantalla recoge como el teclado (`useIdleMenuKeys`); si
 * no, el clic sobre lo enfocado.
 */
export function acceptFocused(): void {
  const target = document.activeElement
  if (isIdleFocus(target)) sendKey('Enter')
  else if (target instanceof HTMLElement) target.click()
}

export function useGamepad(): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return
    let frame = 0
    let held = new Set<string>()

    const poll = () => {
      const pads = navigator.getGamepads().filter((pad): pad is Gamepad => Boolean(pad))
      if (pads.length === 0) {
        frame = 0
        held = new Set()
        return
      }
      const now = new Set<string>()
      for (const pad of pads) for (const input of pressedInputs(pad)) now.add(input)
      // Solo el flanco de bajada: mantener pulsado no repite (el cursor salta una opción por pulsación).
      for (const input of now) {
        if (held.has(input)) continue
        if (input === 'accept') acceptFocused()
        else sendKey(input)
      }
      held = now
      frame = requestAnimationFrame(poll)
    }

    const start = () => {
      if (!frame) frame = requestAnimationFrame(poll)
    }
    window.addEventListener('gamepadconnected', start)
    if (navigator.getGamepads().some(Boolean)) start()
    return () => {
      window.removeEventListener('gamepadconnected', start)
      cancelAnimationFrame(frame)
    }
  }, [])
}
