import { expect, test } from '@playwright/test'
import { collectErrors, open, openGallery } from './support'

/**
 * Motor de audio (guía §3.7, Anexo D; tarea 1.4). Lo que suena se mide renderizándolo *offline* en el
 * navegador con el mismo código (`apps/web/src/audio/offline.ts`, servido por Vite en desarrollo).
 */

declare global {
  interface Window {
    __bbAudioContexts: AudioContext[]
  }
}

/** Antes de cargar: apunta cada `AudioContext` que se cree. */
function recordContexts() {
  const created: AudioContext[] = []
  window.__bbAudioContexts = created
  const Original = window.AudioContext
  window.AudioContext = class extends Original {
    constructor(options?: AudioContextOptions) {
      super(options)
      created.push(this)
    }
  } as typeof AudioContext
}

/** El módulo de render *offline*, servido por Vite en desarrollo (se importa desde la página). */
const OFFLINE_MODULE = '/src/audio/offline.ts'

interface SfxMetrics {
  peakDb: number
  activeSeconds: number
  duration: number
  levelDb: number
}

test.describe('audio', () => {
  test('RD-SND-01: cargar la página sin interactuar no crea ningún AudioContext; el primer gesto lo crea y lo pone en marcha', async ({
    page,
  }) => {
    await page.addInitScript(recordContexts)
    await open(page, '/', 'Beat Battle')
    await page.waitForTimeout(1_500)
    expect(await page.evaluate(() => window.__bbAudioContexts.length)).toBe(0)
    await page.keyboard.press('Shift')
    await expect.poll(() => page.evaluate(() => window.__bbAudioContexts.length)).toBe(1)
    await expect.poll(() => page.evaluate(() => window.__bbAudioContexts[0]?.state)).toBe('running')
    // Más gestos no crean más contextos.
    await page.mouse.click(5, 5)
    expect(await page.evaluate(() => window.__bbAudioContexts.length)).toBe(1)
  })

  test('RD-SND-02 / Anexo D: cada efecto de la tarea, renderizado offline, suena a su nivel (±2 dB) y dura lo que dice el Anexo D', async ({
    page,
  }) => {
    await open(page, '/', 'Beat Battle')
    const metrics = await page.evaluate(async (url) => {
      const offline = await import(/* @vite-ignore */ url)
      const result: Record<string, SfxMetrics> = {}
      for (const id of offline.SFX_IDS as readonly string[]) result[id] = await offline.renderSfx(id)
      return result
    }, OFFLINE_MODULE)
    // Los 16 de la tarea 1.4, `vote.unlocked` de la 1.5, los 7 de la interfaz de la 2.27, `drop.needle` de la
    // 3.17, los 5 de la subida de la 4.17 (`upload.*`, `ann.newbeat`), los 2 del Modo Jurado de la 5.18, los 6 de la
    // ceremonia de la 6.17 (`cer.*`) y los 4 de los logros de la 7.17 (`ach.*`).
    test.info().annotations.push({
      type: 'medidas',
      description: Object.entries(metrics)
        .map(([id, m]) => `${id} ${m.peakDb.toFixed(1)}/${m.levelDb} dB ${m.activeSeconds.toFixed(3)} s`)
        .join(' · '),
    })
    expect(Object.keys(metrics)).toHaveLength(42)
    for (const [id, m] of Object.entries(metrics)) {
      expect(
        Math.abs(m.peakDb - m.levelDb),
        `${id}: pico ${m.peakDb.toFixed(1)} dBFS frente a ${m.levelDb}`,
      ).toBeLessThanOrEqual(2)
      expect(m.activeSeconds, `${id}: suena`).toBeGreaterThan(0)
      expect(m.activeSeconds, `${id}: dura ${m.activeSeconds.toFixed(3)} s`).toBeLessThanOrEqual(
        m.duration + 0.03,
      )
    }
  })

  test('RD-SND-02 / 7.17: los `ach.*`, renderizados offline en las 24 tonalidades, suenan a su nivel (±2 dB), en las notas de la tónica y siempre igual', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await open(page, '/', 'Beat Battle')
    const { rows, renderDiff } = await page.evaluate(async (url) => {
      const offline = await import(/* @vite-ignore */ url)
      const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
      const out: {
        key: string
        id: string
        metrics: SfxMetrics
        bellsDb: number
        choirDb: number | null
      }[] = []
      for (let tonic = 0; tonic < 12; tonic++)
        for (const mode of ['minor', 'major'] as const) {
          const third = mode === 'minor' ? 3 : 4
          // Campanitas en la 5.ª octava (La menor: la tónica es La5, 880 Hz): la tríada de la tónica y su octava.
          const bell = (step: number) => hz(12 * 6 + tonic + step)
          const bells: Record<string, number[]> = {
            'ach.common': [bell(7), bell(12)],
            'ach.rare': [bell(third), bell(7), bell(12)],
            'ach.epic': [bell(0), bell(third), bell(7), bell(12)],
            'ach.legendary': [bell(0), bell(third), bell(7), bell(12)],
          }
          // El coro del legendario, la tríada una octava más abajo y la tónica dos.
          const choir = [
            hz(12 * 4 + tonic),
            hz(12 * 5 + tonic),
            hz(12 * 5 + tonic + third),
            hz(12 * 5 + tonic + 7),
          ]
          for (const [id, notes] of Object.entries(bells)) {
            const key = { tonic, mode }
            const voices = id === 'ach.legendary' ? choir : []
            const contrast: number[] = await offline.renderSfxPitch(id, key, [...notes, ...voices])
            out.push({
              key: `${tonic}${mode === 'minor' ? 'm' : 'M'}`,
              id,
              metrics: await offline.renderSfx(id, key),
              bellsDb: Math.min(...contrast.slice(0, notes.length)),
              choirDb: voices.length ? Math.min(...contrast.slice(notes.length)) : null,
            })
          }
        }
      const first: number[] = await offline.renderSfxSamples('ach.legendary')
      const second: number[] = await offline.renderSfxSamples('ach.legendary')
      let renderDiff = first.length === second.length ? 0 : Number.POSITIVE_INFINITY
      first.forEach((value, i) => {
        renderDiff = Math.max(renderDiff, Math.abs(value - (second[i] ?? Number.POSITIVE_INFINITY)))
      })
      return { rows: out, renderDiff }
    }, OFFLINE_MODULE)
    test.info().annotations.push({
      type: 'medidas',
      description: ['ach.common', 'ach.rare', 'ach.epic', 'ach.legendary']
        .map((id) => {
          const mine = rows.filter((row) => row.id === id)
          const peaks = mine.map((row) => row.metrics.peakDb)
          const choir = mine.flatMap((row) => (row.choirDb === null ? [] : [row.choirDb]))
          const choirText = choir.length ? `, coro ≥ ${Math.min(...choir).toFixed(1)} dB` : ''
          return `${id} pico ${Math.min(...peaks).toFixed(1)}…${Math.max(...peaks).toFixed(1)}/${mine[0]?.metrics.levelDb} dB, notas ≥ ${Math.min(...mine.map((row) => row.bellsDb)).toFixed(1)} dB${choirText}`
        })
        .join(' · '),
    })
    expect(rows).toHaveLength(96)
    for (const { key, id, metrics, bellsDb, choirDb } of rows) {
      const where = `${id} en ${key}`
      expect(
        Math.abs(metrics.peakDb - metrics.levelDb),
        `${where}: pico ${metrics.peakDb.toFixed(1)} dBFS frente a ${metrics.levelDb}`,
      ).toBeLessThanOrEqual(2)
      expect(metrics.activeSeconds, `${where}: suena`).toBeGreaterThan(0)
      expect(
        metrics.activeSeconds,
        `${where}: dura ${metrics.activeSeconds.toFixed(3)} s`,
      ).toBeLessThanOrEqual(metrics.duration + 0.03)
      // Cada campanita suena en su nota, muy por encima del semitono de al lado; el coro, de ruido, menos.
      expect(
        bellsDb,
        `${where}: campanitas ${bellsDb.toFixed(1)} dB sobre el semitono`,
      ).toBeGreaterThanOrEqual(12)
      if (choirDb !== null)
        expect(choirDb, `${where}: coro ${choirDb.toFixed(1)} dB sobre el semitono`).toBeGreaterThanOrEqual(3)
    }
    // El mismo render dos veces (ruido con semilla y sin variación por disparo): igual hasta −120 dBFS. No al bit:
    // Chrome suma las capas en un orden que puede cambiar el último bit (6·10⁻⁸, también en `level.up`).
    expect(renderDiff).toBeLessThanOrEqual(1e-6)
  })

  test('RD-SND-03: con una entrada sonando, el bus de efectos baja 6 dB y el de ambiente 18 dB (render offline)', async ({
    page,
  }) => {
    await open(page, '/', 'Beat Battle')
    const ducking = await page.evaluate(async (url) => {
      const offline = await import(/* @vite-ignore */ url)
      return offline.renderDucking() as Promise<{ sfxDb: number; ambienceDb: number }>
    }, OFFLINE_MODULE)
    expect(ducking.sfxDb).toBeCloseTo(-6, 0)
    expect(ducking.ambienceDb).toBeCloseTo(-18, 0)
  })

  test('§3.7: el banco de escucha de la galería dispara los efectos sin errores', async ({ page }) => {
    const errors = collectErrors(page)
    await page.addInitScript(recordContexts)
    await openGallery(page)
    const button = page.locator('[data-sfx="star.vote.5"]')
    await button.scrollIntoViewIfNeeded()
    await button.click()
    await page.locator('[data-sfx="level.up"]').click()
    // Los de los logros (7.17), en su bloque.
    const legendary = page.locator('#sonido-ach [data-sfx="ach.legendary"]')
    await legendary.scrollIntoViewIfNeeded()
    await legendary.click()
    await expect.poll(() => page.evaluate(() => window.__bbAudioContexts[0]?.state)).toBe('running')
    await page.waitForTimeout(500)
    expect(errors).toEqual([])
  })
})
