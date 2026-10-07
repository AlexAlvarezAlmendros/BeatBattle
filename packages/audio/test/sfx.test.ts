import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SFX_IDS, sfxCatalog } from '../src/sfx'
import { type Key, pentatonicHz } from '../src/theory'

/** Duración nominal del Anexo D de cada efecto de la tarea 1.4 (s). */
const ANNEX_D: Record<string, { duration: number; levelDb: number; jitter: number }> = {
  'ui.enter': { duration: 1.2, levelDb: -6, jitter: 0 },
  'ui.hover': { duration: 0.025, levelDb: -30, jitter: 1 },
  'ui.press': { duration: 0.04, levelDb: -18, jitter: 1 },
  'vote.locked': { duration: 0.12, levelDb: -12, jitter: 0.5 },
  'vote.unlocked': { duration: 0.45, levelDb: -16, jitter: 0 },
  'xp.gain': { duration: 0.09, levelDb: -22, jitter: 0 },
  'level.up': { duration: 1.6, levelDb: -8, jitter: 0 },
  'star.vote.5': { duration: 0.6, levelDb: -10, jitter: 0 },
}

describe('catálogo de efectos (Anexo D, 1.4)', () => {
  const catalog = sfxCatalog()

  it('RD-SND-02: cada efecto de la tarea es una definición de datos con capas', () => {
    for (const id of SFX_IDS) {
      expect(catalog[id].layers.length, id).toBeGreaterThan(0)
    }
  })

  it('RD-SND-02: duración, nivel y variación son los del Anexo D', () => {
    for (const [id, expected] of Object.entries(ANNEX_D)) {
      const def = catalog[id as keyof typeof catalog]
      expect(def.duration, id).toBe(expected.duration)
      expect(def.levelDb, id).toBe(expected.levelDb)
      expect(def.jitter, id).toBe(expected.jitter)
    }
    for (const n of [1, 2, 3, 4, 5] as const) expect(catalog[`star.hover.${n}`].levelDb).toBe(-26)
    for (const n of [1, 2, 3, 4] as const) expect(catalog[`star.vote.${n}`].levelDb).toBe(-14)
  })

  it('RD-SND-02: ninguna capa pasa de la duración del efecto (más su retardo)', () => {
    for (const id of SFX_IDS) {
      const def = catalog[id]
      const end = Math.max(...def.layers.map((layer) => (layer.delay ?? 0) + layer.dur))
      expect(end, id).toBeLessThanOrEqual(def.duration + 1e-9)
    }
  })

  it('RD-SND-04: las estrellas tocan la pentatónica de la tonalidad, del grado 1 al 5, en orden ascendente', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 11 }), fc.constantFrom('minor', 'major'), (tonic, mode) => {
        const key = { tonic, mode } as Key
        const stars = sfxCatalog(key)
        const notes = ([1, 2, 3, 4, 5] as const).map(
          (n) => stars[`star.hover.${n}`].layers[0]?.freq?.[0] ?? 0,
        )
        notes.forEach((hz, index) => {
          expect(hz).toBeCloseTo(pentatonicHz(key, index + 1, 5))
        })
        for (let i = 1; i < notes.length; i++) expect(notes[i]).toBeGreaterThan(notes[i - 1] as number)
      }),
    )
  })

  it('el blip de XP sube un grado por combo, con tope', () => {
    const base = sfxCatalog(undefined, 0)['xp.gain'].layers[0]?.freq?.[0] ?? 0
    const combo = sfxCatalog(undefined, 2)['xp.gain'].layers[0]?.freq?.[0] ?? 0
    const capped = sfxCatalog(undefined, 50)['xp.gain'].layers[0]?.freq?.[0] ?? 0
    expect(combo).toBeGreaterThan(base)
    expect(capped).toBe(sfxCatalog(undefined, 7)['xp.gain'].layers[0]?.freq?.[0])
  })
})
