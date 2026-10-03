import { describe, expect, it } from 'vitest'
import { pressedInputs, STICK_THRESHOLD, stickKeys } from './useGamepad'

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
