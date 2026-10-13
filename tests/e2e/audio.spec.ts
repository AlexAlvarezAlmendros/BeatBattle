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
    // 3.17 y los 5 de la subida de la 4.17 (`upload.*`, `ann.newbeat`).
    test.info().annotations.push({
      type: 'medidas',
      description: Object.entries(metrics)
        .map(([id, m]) => `${id} ${m.peakDb.toFixed(1)}/${m.levelDb} dB ${m.activeSeconds.toFixed(3)} s`)
        .join(' · '),
    })
    expect(Object.keys(metrics)).toHaveLength(30)
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
    await expect.poll(() => page.evaluate(() => window.__bbAudioContexts[0]?.state)).toBe('running')
    await page.waitForTimeout(500)
    expect(errors).toEqual([])
  })
})
