import { describe, expect, it } from 'vitest'
import { ensureHistoryEntryKey } from './router'

/** `History` mínimo: solo lo que usa `ensureHistoryEntryKey`. */
function fakeHistory(state: unknown) {
  const history = {
    state,
    replaceState(next: unknown) {
      history.state = next
    },
  }
  return history
}

describe('ensureHistoryEntryKey', () => {
  it('da clave propia a la primera entrada de una carga nueva (sin history.state)', () => {
    const first = fakeHistory(null)
    const second = fakeHistory(null)
    const a = ensureHistoryEntryKey(first as unknown as History)
    const b = ensureHistoryEntryKey(second as unknown as History)
    expect(a).toMatch(/^[a-z0-9]+$/)
    // Dos cargas nuevas no comparten clave: ninguna hereda la posición guardada por la otra.
    expect(a).not.toBe(b)
    expect(a).not.toBe('default')
    expect(first.state).toEqual({ key: a })
  })

  it('conserva la clave de una recarga o de Atrás/Adelante, y el resto del estado', () => {
    const history = fakeHistory({ usr: { from: 'home' }, key: 'abc123', idx: 2 })
    expect(ensureHistoryEntryKey(history as unknown as History)).toBe('abc123')
    expect(history.state).toEqual({ usr: { from: 'home' }, key: 'abc123', idx: 2 })
  })

  it('añade la clave sin perder lo que ya hubiera (p. ej. el índice de React Router)', () => {
    const history = fakeHistory({ usr: null, idx: 0 })
    const key = ensureHistoryEntryKey(history as unknown as History)
    expect(history.state).toEqual({ usr: null, idx: 0, key })
  })
})
