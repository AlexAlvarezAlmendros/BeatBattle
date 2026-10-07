/**
 * Grafo de mezcla (guía §3.7.2): buses de música, efectos y ambiente → máster → compresor → limitador →
 * salida. Con una entrada sonando (el reproductor de la Fase 5), el bus de efectos baja 6 dB (`RD-SND-03`)
 * y el de ambiente, 18 dB. Recibe el contexto por parámetro: igual en tiempo real y *offline*.
 */

export type Bus = 'music' | 'sfx' | 'ambience'

/** Atenuación de cada bus mientras suena una entrada (dB). */
export const DUCKING_DB: Record<Bus, number> = { music: 0, sfx: -6, ambience: -18 }

/** Volumen por defecto de cada bus (lineal): efectos al 50 % (§3.7.1). */
export const DEFAULT_VOLUME: Record<Bus, number> = { music: 1, sfx: 0.5, ambience: 1 }

/** Constante de tiempo del *ducking* (s): entra y sale sin clic. */
const DUCK_TIME = 0.08

export interface Mix {
  /** Entrada de cada bus. */
  input: Record<Bus, GainNode>
  master: GainNode
  /**
   * Analizador del bus de música (FFT de 1024, §3.5 y tarea 1.6): lo lee el Escenario para mover la trama.
   * Sin suavizado propio (el paso bajo de 2 Hz va en `createReactivity`) y sin salida.
   */
  analyser: AnalyserNode
  setVolume(bus: Bus, volume: number): void
  /** ¿Suena una entrada? Atenúa efectos y ambiente (§3.7.2). */
  setMusicPlaying(playing: boolean, at?: number): void
  setMuted(muted: boolean): void
}

export function createMix(ctx: BaseAudioContext): Mix {
  // Limitador: un compresor muy rápido y de razón alta justo por debajo de 0 dBFS.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -1
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.05
  limiter.connect(ctx.destination)
  // Compresor maestro suave (el de Orchard).
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -18
  compressor.knee.value = 6
  compressor.ratio.value = 2.5
  compressor.attack.value = 0.02
  compressor.release.value = 0.25
  compressor.connect(limiter)
  const master = ctx.createGain()
  master.connect(compressor)

  const make = (bus: Bus) => {
    const volume = ctx.createGain()
    volume.gain.value = DEFAULT_VOLUME[bus]
    const duck = ctx.createGain()
    volume.connect(duck).connect(master)
    return { volume, duck }
  }
  const buses = { music: make('music'), sfx: make('sfx'), ambience: make('ambience') }
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  analyser.smoothingTimeConstant = 0
  analyser.minDecibels = -90
  analyser.maxDecibels = -10
  buses.music.volume.connect(analyser)

  return {
    input: { music: buses.music.volume, sfx: buses.sfx.volume, ambience: buses.ambience.volume },
    master,
    analyser,
    setVolume(bus, volume) {
      buses[bus].volume.gain.value = Math.min(1, Math.max(0, volume))
    },
    setMusicPlaying(playing, at = ctx.currentTime) {
      for (const bus of ['sfx', 'ambience'] as const) {
        const target = playing ? 10 ** (DUCKING_DB[bus] / 20) : 1
        buses[bus].duck.gain.setTargetAtTime(target, at, DUCK_TIME)
      }
    },
    setMuted(muted) {
      master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.01)
    },
  }
}
