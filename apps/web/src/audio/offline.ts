import { DEFAULT_KEY, type Key, type SfxId, sfxCatalog } from '@beatbattle/audio'
import { createMix } from './mix'
import { makeNoiseBank } from './noise'
import { dbToGain, playSfx } from './synth'

/**
 * Render *offline* para medir los efectos y la mezcla (guía §3.7, Anexo D; `RD-SND-02`, `RD-SND-03`).
 * Lo usan los E2E desde la página (`import('/src/audio/offline.ts')` en el servidor de desarrollo): el
 * mismo código que suena, renderizado en un `OfflineAudioContext` y medido.
 */

const SAMPLE_RATE = 48_000

const toDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -200)

export interface SfxMetrics {
  /** Pico (dBFS) del efecto solo, en el bus de efectos al 100 % (sin compresor). */
  peakDb: number
  /** Último instante (s) con señal por encima de −60 dBFS. */
  activeSeconds: number
  /** Duración nominal del Anexo D. */
  duration: number
  levelDb: number
}

/** Renderiza un efecto solo (sin variación de tono) y mide su pico y cuánto dura. */
export async function renderSfx(id: SfxId, key: Key = DEFAULT_KEY): Promise<SfxMetrics> {
  const def = sfxCatalog(key)[id]
  const seconds = def.duration + 0.5
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE)
  playSfx(ctx, ctx.destination, makeNoiseBank(ctx), { ...def, jitter: 0 }, 0.05, { random: () => 0.5 })
  const data = (await ctx.startRendering()).getChannelData(0)
  let peak = 0
  let last = 0
  const floor = dbToGain(-60)
  for (let i = 0; i < data.length; i++) {
    const value = Math.abs(data[i] ?? 0)
    if (value > peak) peak = value
    if (value > floor) last = i
  }
  return {
    peakDb: toDb(peak),
    activeSeconds: last / SAMPLE_RATE - 0.05,
    duration: def.duration,
    levelDb: def.levelDb,
  }
}

export interface DuckingMetrics {
  /** Cambio de nivel (dB) de un tono en el bus de efectos al sonar una entrada. */
  sfxDb: number
  /** Ídem en el bus de ambiente. */
  ambienceDb: number
}

/**
 * Un tono constante por cada bus (a nivel bajo, por debajo del umbral del compresor), y a mitad del render
 * empieza a sonar una entrada: mide cuánto bajan los efectos y el ambiente (`RD-SND-03`).
 */
export async function renderDucking(): Promise<DuckingMetrics> {
  const seconds = 2
  const measure = async (bus: 'sfx' | 'ambience') => {
    const ctx = new OfflineAudioContext(1, seconds * SAMPLE_RATE, SAMPLE_RATE)
    const mix = createMix(ctx)
    mix.setVolume(bus, 1)
    const osc = ctx.createOscillator()
    osc.frequency.value = 440
    const level = ctx.createGain()
    level.gain.value = dbToGain(-40)
    osc.connect(level).connect(mix.input[bus])
    osc.start(0)
    mix.setMusicPlaying(true, 1)
    const data = (await ctx.startRendering()).getChannelData(0)
    const rms = (from: number, to: number) => {
      let sum = 0
      for (let i = Math.floor(from * SAMPLE_RATE); i < Math.floor(to * SAMPLE_RATE); i++)
        sum += (data[i] ?? 0) ** 2
      return Math.sqrt(sum / ((to - from) * SAMPLE_RATE))
    }
    return toDb(rms(1.5, 1.9)) - toDb(rms(0.4, 0.9))
  }
  return { sfxDb: await measure('sfx'), ambienceDb: await measure('ambience') }
}

/** Los efectos medibles (para las pruebas, que los recorren desde la página). */
export { SFX_IDS } from '@beatbattle/audio'
