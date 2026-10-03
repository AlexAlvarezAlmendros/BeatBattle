import { afterEach, describe, expect, it } from 'vitest'
import { LOOPS_ATTRIBUTE, LOOPS_PAUSED, useLoops } from './loops'

afterEach(() => useLoops.getState().set(false))

describe('pausa de los bucles decorativos (WCAG 2.2.2)', () => {
  it('WCAG 2.2.2: por defecto en marcha; la pausa marca <html data-loops="paused"> y se quita al reanudar', () => {
    expect(useLoops.getState().paused).toBe(false)
    expect(document.documentElement).not.toHaveAttribute(LOOPS_ATTRIBUTE)
    useLoops.getState().toggle()
    expect(useLoops.getState().paused).toBe(true)
    expect(document.documentElement).toHaveAttribute(LOOPS_ATTRIBUTE, LOOPS_PAUSED)
    useLoops.getState().toggle()
    expect(useLoops.getState().paused).toBe(false)
    expect(document.documentElement).not.toHaveAttribute(LOOPS_ATTRIBUTE)
  })
})
