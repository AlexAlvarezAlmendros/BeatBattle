import { DEFAULT_KEY, sfxCatalog } from '@beatbattle/audio'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const playSfx = vi.fn()
vi.mock('./synth', () => ({ playSfx: (...args: unknown[]) => playSfx(...args) }))
vi.mock('./noise', () => ({ makeNoiseBank: () => ({}) }))
vi.mock('./mix', () => ({
  createMix: () => ({
    input: { sfx: {}, music: {} },
    analyser: { kind: 'analyser' },
    setMuted: () => {},
    setMusicPlaying: () => {},
  }),
}))

const { AudioEngine } = await import('./engine')

/** Contexto falso que recuerda con qué opciones se creó. */
const created: AudioContextOptions[] = []
class FakeContext {
  state = 'running'
  currentTime = 12.5
  constructor(options: AudioContextOptions = {}) {
    created.push(options)
  }
  resume() {
    return Promise.resolve()
  }
  createMediaElementSource() {
    return { connect: () => {}, disconnect: () => {} }
  }
}

/** Un `<audio>` falso que suena o no. */
function element(paused: boolean) {
  return { paused, addEventListener: () => {}, removeEventListener: () => {} } as unknown as HTMLMediaElement
}

function pointer(fine: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: fine)' ? fine : false }))
}

describe('motor de audio: latencia (RD-SND-05)', () => {
  beforeEach(() => {
    created.length = 0
    playSfx.mockClear()
    vi.stubGlobal('AudioContext', FakeContext)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('RD-SND-05: con puntero fino, el contexto pide la latencia mínima del dispositivo (0)', () => {
    pointer(true)
    new AudioEngine().unlock()
    expect(created).toEqual([{ latencyHint: 0 }])
  })

  it('RD-SND-05: en táctil, `interactive` (un búfer mínimo da chasquidos en móviles lentos)', () => {
    pointer(false)
    new AudioEngine().unlock()
    expect(created).toEqual([{ latencyHint: 'interactive' }])
  })

  it('RD-SND-05: un efecto se programa en `currentTime`, sin esperas añadidas', () => {
    pointer(true)
    const engine = new AudioEngine()
    engine.unlock()
    engine.play('ui.press')
    expect(playSfx).toHaveBeenCalledTimes(1)
    expect(playSfx.mock.calls[0]?.[4]).toBe(12.5)
  })

  it('RD-SND-05: `ui.press` suena desde el disparo, con ataque ≤ 1 ms', () => {
    const { layers } = sfxCatalog(DEFAULT_KEY)['ui.press']
    for (const layer of layers) {
      expect(layer.delay ?? 0).toBe(0)
      expect(layer.attack).toBeLessThanOrEqual(0.001)
    }
  })
})

describe('motor de audio: voto ciego (RD-MOT-06)', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeContext)
    pointer(true)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('RD-MOT-06: con una entrada sin sellar sonando, nada visual puede leer la música', () => {
    const engine = new AudioEngine()
    engine.unlock()
    const release = engine.attachElement(element(false), { blind: true })
    expect(engine.musicPlaying).toBe(true)
    expect(engine.musicReactive).toBe(false)
    expect(engine.musicAnalyser).toBeNull()
    release()
    expect(engine.musicAnalyser).not.toBeNull()
  })

  it('RD-MOT-06: con el sample o una entrada sellada, la arena reacciona', () => {
    const engine = new AudioEngine()
    engine.unlock()
    engine.attachElement(element(false), { blind: false })
    expect(engine.musicReactive).toBe(true)
    expect(engine.musicAnalyser).not.toBeNull()
  })
})
