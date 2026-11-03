import { describe, expect, it } from 'vitest'
import { ownStatsText } from './EntryPage'

describe('ficha de la entrada propia (§2.6)', () => {
  it('cuenta votos y escuchas con su plural', () => {
    expect(ownStatsText({ votes: 1, plays: 1 })).toBe(
      'Es tu entrada: 1 voto · 1 escucha. Las notas, el domingo.',
    )
    expect(ownStatsText({ votes: 0, plays: 3 })).toBe(
      'Es tu entrada: 0 votos · 3 escuchas. Las notas, el domingo.',
    )
  })
})
