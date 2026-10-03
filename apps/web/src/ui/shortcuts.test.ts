import { afterEach, describe, expect, it } from 'vitest'
import { SHORTCUTS_STORAGE_KEY, singleKeyAllowed, useShortcuts } from './shortcuts'

afterEach(() => {
  useShortcuts.getState().set(true)
  localStorage.clear()
})

describe('atajos de una tecla (WCAG 2.1.4, RNF-A11Y-08)', () => {
  it('RNF-A11Y-08: encendidos por defecto; apagarlos se guarda en este navegador', () => {
    expect(useShortcuts.getState().enabled).toBe(true)
    useShortcuts.getState().set(false)
    expect(useShortcuts.getState().enabled).toBe(false)
    expect(localStorage.getItem(SHORTCUTS_STORAGE_KEY)).toBe('off')
    useShortcuts.getState().toggle()
    expect(localStorage.getItem(SHORTCUTS_STORAGE_KEY)).toBe('on')
  })

  it('apagados, una tecla de carácter solo actúa con el foco dentro de su grupo', () => {
    expect(singleKeyAllowed()).toBe(true)
    useShortcuts.getState().set(false)
    expect(singleKeyAllowed()).toBe(false)
    expect(singleKeyAllowed(true)).toBe(true)
  })
})
