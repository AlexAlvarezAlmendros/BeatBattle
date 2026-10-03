import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { isSeriousMode, SERIOUS_ATTRIBUTE, setSeriousMode, useSeriousMode } from './useSeriousMode'

afterEach(() => {
  document.documentElement.removeAttribute(SERIOUS_ATTRIBUTE)
})

describe('useSeriousMode (§3.6 «Modo serio», RNF-A11Y-08)', () => {
  it('lee y escribe <html data-serious>', () => {
    expect(isSeriousMode()).toBe(false)
    setSeriousMode(true)
    expect(document.documentElement).toHaveAttribute('data-serious')
    expect(isSeriousMode()).toBe(true)
    setSeriousMode(false)
    expect(document.documentElement).not.toHaveAttribute('data-serious')
  })

  it('el hook sigue los cambios del atributo, vengan de donde vengan', async () => {
    const { result } = renderHook(() => useSeriousMode())
    expect(result.current).toBe(false)
    await act(async () => setSeriousMode(true))
    expect(result.current).toBe(true)
    await act(async () => document.documentElement.removeAttribute('data-serious'))
    expect(result.current).toBe(false)
  })
})
