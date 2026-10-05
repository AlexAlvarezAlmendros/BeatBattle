import { afterEach, describe, expect, it } from 'vitest'
import { readStageOverride, STAGE_OVERRIDE_KEY, stageAllowed } from './stageGate'

describe('puerta del Escenario (§3.5, 1.1)', () => {
  afterEach(() => window.localStorage.removeItem(STAGE_OVERRIDE_KEY))

  it('RNF-A11Y-03: con «reducir movimiento» no se carga el Escenario (la arena estática)', () => {
    expect(stageAllowed(null, true, false)).toBe(false)
    expect(stageAllowed(null, false, false)).toBe(true)
  })

  it('§3.5: con ahorro de datos tampoco', () => {
    expect(stageAllowed(null, false, true)).toBe(false)
  })

  it('§3.5: `bb:stage` = `off` lo apaga siempre y `on` lo enciende también con «reducir movimiento»', () => {
    expect(stageAllowed('off', false, false)).toBe(false)
    expect(stageAllowed('on', true, true)).toBe(true)
  })

  it('§3.5: el interruptor solo acepta `on` y `off`', () => {
    expect(readStageOverride()).toBeNull()
    window.localStorage.setItem(STAGE_OVERRIDE_KEY, 'on')
    expect(readStageOverride()).toBe('on')
    window.localStorage.setItem(STAGE_OVERRIDE_KEY, 'off')
    expect(readStageOverride()).toBe('off')
    window.localStorage.setItem(STAGE_OVERRIDE_KEY, 'quizá')
    expect(readStageOverride()).toBeNull()
  })
})
