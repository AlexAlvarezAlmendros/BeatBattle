import { describe, expect, it } from 'vitest'
import * as balance from '../src/balance'
import * as calendar from '../src/calendar'
import * as entryAudio from '../src/entryAudio'
import * as goldenEar from '../src/goldenEar'
import * as rules from '../src/index'
import * as levels from '../src/levels'
import * as listen from '../src/listen'
import * as loudness from '../src/loudness'
import * as phase from '../src/phase'
import * as prng from '../src/prng'
import * as scoring from '../src/scoring'
import * as season from '../src/season'

const modules = {
  balance,
  calendar,
  entryAudio,
  goldenEar,
  levels,
  listen,
  loudness,
  phase,
  prng,
  scoring,
  season,
}

describe('@beatbattle/rules', () => {
  it.each(Object.entries(modules))('el índice reexporta todo %s', (_, module) => {
    for (const [name, value] of Object.entries(module)) {
      expect(rules, name).toHaveProperty(name, value)
    }
  })

  it('no exporta nada que no venga de un módulo público', () => {
    const fromModules = new Set(Object.values(modules).flatMap((module) => Object.keys(module)))
    for (const name of Object.keys(rules)) expect(fromModules.has(name), name).toBe(true)
  })
})
