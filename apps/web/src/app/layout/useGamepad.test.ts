import { afterEach, describe, expect, it, vi } from 'vitest'
import { acceptFocused, pressedInputs, STICK_THRESHOLD, stickKeys } from './useGamepad'

const button = (pressed: boolean) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 })
const pad = (pressed: number[], axes: number[] = [0, 0]) => ({
  buttons: Array.from({ length: 17 }, (_, index) => button(pressed.includes(index))),
  axes,
})

describe('mando (0.23, §3.3): botones del mapeo estándar → teclas de los menús', () => {
  it('la cruceta son las flechas, B es Esc, LB/RB son Q/E y A acepta', () => {
    expect([...pressedInputs(pad([12]))]).toEqual(['ArrowUp'])
    expect([...pressedInputs(pad([13]))]).toEqual(['ArrowDown'])
    expect([...pressedInputs(pad([14, 15]))].sort()).toEqual(['ArrowLeft', 'ArrowRight'])
    expect([...pressedInputs(pad([1]))]).toEqual(['Escape'])
    expect([...pressedInputs(pad([4, 5]))].sort()).toEqual(['e', 'q'])
    expect([...pressedInputs(pad([0]))]).toEqual(['accept'])
    expect([...pressedInputs(pad([]))]).toEqual([])
  })

  it('la palanca izquierda cuenta como flecha a partir del umbral', () => {
    expect(stickKeys([0, -STICK_THRESHOLD])).toEqual(['ArrowUp'])
    expect(stickKeys([0, STICK_THRESHOLD + 0.1])).toEqual(['ArrowDown'])
    expect(stickKeys([-0.9, 0])).toEqual(['ArrowLeft'])
    expect(stickKeys([0.3, -0.3])).toEqual([])
  })
})

describe('mando: A acepta como Intro (§3.3: «el mando no tiene lógica propia, se traduce a esas teclas»)', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('RD-VIS-02 d: con el foco en el <main> del marco (tras Esc o al navegar), A manda Intro al menú, no un clic al <main>', () => {
    const main = document.createElement('main')
    main.tabIndex = -1
    main.dataset.focusTarget = 'main'
    document.body.append(main)
    main.focus()
    const clicked = vi.fn()
    main.addEventListener('click', clicked)
    const keys: string[] = []
    const onKey = (event: KeyboardEvent) => keys.push(event.key)
    document.addEventListener('keydown', onKey)
    acceptFocused()
    document.removeEventListener('keydown', onKey)
    expect(keys).toEqual(['Enter'])
    expect(clicked).not.toHaveBeenCalled()
  })

  it('con el foco en un control, A hace clic en él (una tecla Intro sintética no activaría un enlace)', () => {
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    acceptFocused()
    expect(clicked).toHaveBeenCalledTimes(1)
  })
})
