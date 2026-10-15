import { sfxCatalog } from '@beatbattle/audio'
import { describe, expect, it } from 'vitest'
import type { NoiseBank } from './noise'
import { playSfx } from './synth'

/** Un `AudioParam` que apunta su valor de partida y la automatización. */
function param(initial = 1) {
  return {
    value: initial,
    events: [] as string[],
    setValueAtTime(v: number, t: number) {
      this.events.push(`set ${v}@${t}`)
    },
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
  }
}

function fakeContext() {
  const gains: ReturnType<typeof param>[] = []
  const node = () => ({ connect: (next: unknown) => next })
  const ctx = {
    createBufferSource: () => ({
      ...node(),
      playbackRate: param(),
      start() {},
      stop() {},
      buffer: null,
      loop: false,
    }),
    createOscillator: () => ({ ...node(), frequency: param(440), type: 'sine', start() {}, stop() {} }),
    createBiquadFilter: () => ({ ...node(), frequency: param(350), Q: param(1), type: 'lowpass' }),
    createGain: () => {
      const gain = param(1)
      gains.push(gain)
      return { ...node(), gain }
    },
  }
  return { ctx: ctx as unknown as BaseAudioContext, gains }
}

describe('síntesis de efectos', () => {
  it('RD-SND-02: cada capa parte en silencio (sin el chasquido de la primera muestra de una capa con retardo)', () => {
    const { ctx, gains } = fakeContext()
    const bank = { white: {}, pink: {}, brown: {} } as unknown as NoiseBank
    playSfx(ctx, {} as AudioNode, bank, sfxCatalog()['cer.confetti'], 0.05, { random: () => 0.5 })
    expect(gains.length).toBeGreaterThan(1)
    for (const gain of gains) {
      // El GainNode nace a 1: hay que dejarlo a 0 antes de la automatización.
      expect(gain.value).toBe(0)
      expect(gain.events[0]).toMatch(/^set 0@/)
    }
  })
})
