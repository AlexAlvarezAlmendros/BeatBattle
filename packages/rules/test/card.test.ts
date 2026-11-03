import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CARD_VARIANTS, cardVariant, RED_CARD_LEVEL, unlockedVariants } from '../src/card'

/** Las variantes de la carta (guía §3.4.4; tareas 7.22 y 7.28): las mismas en la web y en la imagen OG del perfil. */
describe('variantes de la carta (§3.4.4)', () => {
  it('§3.4.4: roja desde el rango Productor (nivel 9), holo con una victoria y de campeón con `season_champ`', () => {
    expect(RED_CARD_LEVEL).toBe(9)
    expect(cardVariant({ level: 8, wins: 0, champion: false })).toBe('standard')
    expect(cardVariant({ level: 9, wins: 0, champion: false })).toBe('red')
    expect(cardVariant({ level: 1, wins: 1, champion: false })).toBe('holo')
    expect(cardVariant({ level: 1, wins: 0, champion: true })).toBe('champion')
  })

  it('§3.4.4 (propiedad): la estándar siempre está, van en orden y la carta sale con la más alta', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.nat({ max: 50 }),
        fc.boolean(),
        (level, wins, champion) => {
          const facts = { level, wins, champion }
          const unlocked = unlockedVariants(facts)
          expect(unlocked[0]).toBe('standard')
          const order = unlocked.map((variant) => CARD_VARIANTS.indexOf(variant))
          expect(order).toEqual([...order].sort((a, b) => a - b))
          expect(cardVariant(facts)).toBe(unlocked.at(-1))
        },
      ),
    )
  })
})
