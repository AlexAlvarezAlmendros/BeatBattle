import type { SfxDef, SfxLayer } from '@beatbattle/audio'
import type { NoiseBank } from './noise'

/**
 * Síntesis de los efectos definidos como datos (`@beatbattle/audio`, `RD-SND-02`; modelo de Orchard):
 * cada capa es una fuente (ruido, tono o FM) con su filtro y su envolvente. El nivel del efecto (dBFS de
 * pico en el bus de efectos al 100 %, Anexo D) escala todas sus capas. Funciona igual en tiempo real y en
 * `OfflineAudioContext` (las pruebas lo miden así).
 */

export const dbToGain = (db: number) => 10 ** (db / 20)

/** Envolvente: 0 → pico en `attack` y caída exponencial con constante `decay`/4. */
function envelope(gain: AudioParam, t0: number, peak: number, attack: number, decay: number, dur: number) {
  gain.setValueAtTime(0, t0)
  gain.linearRampToValueAtTime(peak, t0 + Math.max(0.001, attack))
  gain.setTargetAtTime(0, t0 + attack, Math.max(0.004, decay / 4))
  gain.setValueAtTime(0, t0 + dur)
}

function source(
  ctx: BaseAudioContext,
  layer: SfxLayer,
  t0: number,
  rate: number,
  bank: NoiseBank,
  offset: number,
) {
  if (layer.kind === 'noise') {
    const src = ctx.createBufferSource()
    src.buffer = bank[layer.noise ?? 'pink']
    src.loop = true
    src.playbackRate.value = rate
    src.start(t0, offset)
    return { node: src as AudioNode, stop: (t: number) => src.stop(t) }
  }
  const osc = ctx.createOscillator()
  osc.type = layer.wave ?? 'sine'
  const [f0, f1] = layer.freq ?? [440, 440]
  osc.frequency.setValueAtTime(f0 * rate, t0)
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), t0 + layer.dur)
  osc.start(t0)
  if (layer.kind === 'fm') {
    const mod = ctx.createOscillator()
    const depth = ctx.createGain()
    mod.frequency.value = f0 * rate * (layer.harmonicity ?? 2)
    depth.gain.value = f0 * rate * (layer.modIndex ?? 1)
    mod.connect(depth).connect(osc.frequency)
    mod.start(t0)
    return {
      node: osc as AudioNode,
      stop: (t: number) => {
        osc.stop(t)
        mod.stop(t)
      },
    }
  }
  return { node: osc as AudioNode, stop: (t: number) => osc.stop(t) }
}

export interface PlayOptions {
  /** Ganancia extra (lineal) sobre el nivel del efecto. */
  gain?: number
  /** Generador en [0, 1) para la variación de tono (por defecto, `Math.random`). */
  random?: () => number
}

/** Dispara `def` en `out` en el instante `at` (segundos del contexto). Devuelve cuándo acaba. */
export function playSfx(
  ctx: BaseAudioContext,
  out: AudioNode,
  bank: NoiseBank,
  def: SfxDef,
  at: number,
  options: PlayOptions = {},
): number {
  const random = options.random ?? Math.random
  const rate = def.jitter ? 2 ** (((random() * 2 - 1) * def.jitter) / 12) : 1
  const level = dbToGain(def.levelDb) * (options.gain ?? 1)
  let end = at
  for (const layer of def.layers) {
    const t0 = at + (layer.delay ?? 0)
    const { node, stop } = source(ctx, layer, t0, rate, bank, random() * 2)
    let tail: AudioNode = node
    if (layer.filter) {
      const filter = ctx.createBiquadFilter()
      filter.type = layer.filter.type
      filter.Q.value = layer.filter.q
      filter.frequency.setValueAtTime(layer.filter.freq[0], t0)
      if (layer.filter.freq[1] !== layer.filter.freq[0])
        filter.frequency.exponentialRampToValueAtTime(layer.filter.freq[1], t0 + layer.dur)
      tail.connect(filter)
      tail = filter
    }
    const gain = ctx.createGain()
    envelope(gain.gain, t0, layer.gain * level, layer.attack, layer.decay, layer.dur)
    tail.connect(gain).connect(out)
    stop(t0 + layer.dur + 0.02)
    end = Math.max(end, t0 + layer.dur)
  }
  return end
}
