import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  SFX_IDS,
  sfxCatalog,
  UPLOAD_PROGRESS_STEP,
  uploadProgressDegree,
  uploadProgressSfx,
} from '../src/sfx'
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
  'ui.move': { duration: 0.02, levelDb: -28, jitter: 0 },
  'ui.toggle': { duration: 0.06, levelDb: -20, jitter: 0 },
  'ui.open': { duration: 0.22, levelDb: -20, jitter: 0 },
  'ui.close': { duration: 0.22, levelDb: -20, jitter: 0 },
  'ui.error': { duration: 0.28, levelDb: -14, jitter: 0 },
  'ui.success': { duration: 0.3, levelDb: -16, jitter: 0 },
  'nav.page': { duration: 0.24, levelDb: -24, jitter: 0 },
  'upload.hover': { duration: 0.24, levelDb: -24, jitter: 0 },
  'upload.drop': { duration: 0.3, levelDb: -14, jitter: 0 },
  'upload.progress': { duration: 0.08, levelDb: -24, jitter: 0 },
  'upload.done': { duration: 2, levelDb: -8, jitter: 0 },
  'ann.newbeat': { duration: 0.35, levelDb: -14, jitter: 0 },
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

  it('§3.7.1: los efectos de la interfaz con nota van en la tonalidad de la semana', () => {
    const minor = sfxCatalog({ tonic: 0, mode: 'minor' })
    const other = sfxCatalog({ tonic: 2, mode: 'minor' })
    expect(minor['ui.toggle'].layers[0]?.freq?.[0]).not.toBe(other['ui.toggle'].layers[0]?.freq?.[0])
    expect(minor['ui.error'].layers[0]?.freq?.[0]).not.toBe(other['ui.error'].layers[0]?.freq?.[0])
    // Segunda menor en el error; quinta en el conmutador.
    const [a, b] = minor['ui.error'].layers.map((layer) => layer.freq?.[0] ?? 0)
    expect((b as number) / (a as number)).toBeCloseTo(2 ** (1 / 12))
    const [c, d] = minor['ui.toggle'].layers.map((layer) => layer.freq?.[0] ?? 0)
    expect((d as number) / (c as number)).toBeCloseTo(2 ** (7 / 12))
  })

  it('RD-SND-04 / 4.17: la nota de `upload.progress` sube con el porcentaje (nunca baja), en la escala de la semana', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 11 }),
        fc.constantFrom('minor', 'major'),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (tonic, mode, a, b) => {
          const key = { tonic, mode } as Key
          const [low, high] = a <= b ? [a, b] : [b, a]
          const hz = (p: number) => uploadProgressSfx(key, p).layers[0]?.freq?.[0] ?? 0
          expect(hz(high)).toBeGreaterThanOrEqual(hz(low))
          expect(hz(low)).toBeCloseTo(pentatonicHz(key, uploadProgressDegree(low), 5))
        },
      ),
    )
    // Del grado 1 al empezar al 11 al 100 %: dos octavas y un grado.
    expect(uploadProgressDegree(0)).toBe(1)
    expect(uploadProgressDegree(1)).toBe(11)
    expect(uploadProgressDegree(1.7)).toBe(11)
    expect(uploadProgressDegree(Number.NaN)).toBe(1)
    // Cada 5 % cambia de paso: entre dos pasos seguidos la nota no baja y en 10 % siempre sube.
    for (let step = 0; step < 18; step++)
      expect(uploadProgressDegree((step + 2) * UPLOAD_PROGRESS_STEP)).toBeGreaterThan(
        uploadProgressDegree(step * UPLOAD_PROGRESS_STEP),
      )
  })

  it('§3.7.1 / 4.17: los de la subida van en la tonalidad de la semana', () => {
    const a = sfxCatalog({ tonic: 0, mode: 'minor' })
    const d = sfxCatalog({ tonic: 2, mode: 'minor' })
    for (const id of ['upload.hover', 'upload.drop', 'upload.done', 'ann.newbeat'] as const) {
      const first = (catalog: typeof a) => catalog[id].layers.find((layer) => layer.freq)?.freq?.[0]
      expect(first(a), id).not.toBe(first(d))
    }
    // El zumbido de la ranura: la tónica en la 1.ª octava, entre 32 y 62 Hz.
    for (let tonic = 0; tonic < 12; tonic++) {
      const hum = sfxCatalog({ tonic, mode: 'minor' } as Key)['upload.hover'].layers[0]?.freq?.[0] ?? 0
      expect(hum).toBeGreaterThanOrEqual(32)
      expect(hum).toBeLessThan(62)
    }
  })

  it('Anexo D: el impacto de `upload.done` llega tras el riser de 1,5 s', () => {
    const { layers } = sfxCatalog()['upload.done']
    const riser = layers[0]
    expect(riser?.attack).toBeCloseTo(1.45)
    expect(layers.slice(1).every((layer) => layer.delay === 1.5)).toBe(true)
  })
})
