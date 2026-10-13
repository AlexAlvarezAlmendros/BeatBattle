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

describe('motor de audio: topes y silencio (Anexo D, RD-SND-01)', () => {
  beforeEach(() => {
    playSfx.mockClear()
    vi.stubGlobal('AudioContext', FakeContext)
    pointer(true)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('RD-SND-01: sin un gesto antes (sin contexto) no suena nada', () => {
    new AudioEngine().play('ui.press')
    expect(playSfx).not.toHaveBeenCalled()
  })

  it('Anexo D: `ui.move` como mucho 12 por segundo y `ui.hover` 8; los demás, siempre', () => {
    const engine = new AudioEngine()
    engine.unlock()
    const ctx = engine.context as unknown as FakeContext
    for (const id of ['ui.move', 'ui.move', 'ui.hover', 'ui.hover', 'ui.press', 'ui.press'] as const)
      engine.play(id)
    expect(playSfx).toHaveBeenCalledTimes(4)
    ctx.currentTime += 1 / 12 + 0.001
    engine.play('ui.move')
    engine.play('ui.hover')
    expect(playSfx).toHaveBeenCalledTimes(5)
    ctx.currentTime += 1 / 8
    engine.play('ui.hover')
    expect(playSfx).toHaveBeenCalledTimes(6)
  })

  it('con el silencio (M) no suena nada', () => {
    const engine = new AudioEngine()
    engine.unlock()
    engine.setMuted(true)
    engine.play('ui.toggle')
    expect(playSfx).not.toHaveBeenCalled()
  })
})
