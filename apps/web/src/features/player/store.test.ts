import { playbackGainDb } from '@beatbattle/rules'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { audio } from '../../audio/engine'
import { gainFor, type PlayerTrack, playerElement, resetPlayerForTests, usePlayer } from './store'

function track(overrides: Partial<PlayerTrack> = {}): PlayerTrack {
  return {
    id: 'e-1',
    kind: 'entry',
    title: 'Bruma en Gràcia',
    artist: 'Tigre Púrpura',
    streamUrl: 'https://res.cloudinary.com/demo/video/authenticated/s--x--/e-1.mp3',
    durationMs: 180_000,
    gainDb: -6,
    artworkUrl: null,
    cover: { kind: 'generative', seed: 7, bpm: 140, musicalKey: 'Am' },
    peaks: null,
    blind: true,
    weekSlug: '2026-w42',
    ...overrides,
  }
}

let attach: ReturnType<typeof vi.spyOn>
let gain: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetPlayerForTests()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('playing'))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.spyOn(audio, 'unlock').mockImplementation(() => {})
  attach = vi.spyOn(audio, 'attachElement').mockImplementation(() => () => {})
  gain = vi.spyOn(audio, 'setElementGainDb').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  resetPlayerForTests()
})

describe('reproductor global (§2.6, §4.7.3)', () => {
  it('RF-PLAY-03: una entrada medida a −8 LUFS suena con −6 dB; una a −18 LUFS, a 0 dB', () => {
    usePlayer.getState().play(track({ gainDb: playbackGainDb(-8) }))
    expect(gain).toHaveBeenLastCalledWith(playerElement(), -6)
    usePlayer.getState().play(track({ id: 'e-2', gainDb: playbackGainDb(-18) }))
    expect(gain).toHaveBeenLastCalledWith(playerElement(), 0)
  })

  it('RF-PLAY-03: «master tal cual» quita la igualación, salvo en el Modo Jurado; nunca sube', () => {
    const loud = track({ gainDb: -6 })
    expect(gainFor(loud, { rawMaster: true, forceEqualize: false })).toBe(0)
    expect(gainFor(loud, { rawMaster: true, forceEqualize: true })).toBe(-6)
    expect(gainFor(track({ gainDb: 3 }), { rawMaster: false, forceEqualize: false })).toBe(0)
    expect(gainFor(track({ gainDb: null }), { rawMaster: false, forceEqualize: false })).toBe(0)
    usePlayer.getState().play(loud)
    usePlayer.getState().setRawMaster(true)
    expect(gain).toHaveBeenLastCalledWith(playerElement(), 0)
    usePlayer.getState().play(track({ id: 'e-3' }), { equalize: 'always' })
    expect(gain).toHaveBeenLastCalledWith(playerElement(), -6)
  })

  it('RD-MOT-06: una entrada sin sellar pasa por el motor como ciega; el sample, no', () => {
    usePlayer.getState().play(track())
    expect(attach).toHaveBeenLastCalledWith(playerElement(), { blind: true })
    usePlayer.getState().play(track({ id: 'sample:42', kind: 'sample', blind: false, gainDb: null }))
    expect(attach).toHaveBeenLastCalledWith(playerElement(), { blind: false })
  })

  it('RF-PLAY-02: Media Session con título, artista y portada, y play, pausa, anterior y siguiente', () => {
    const handlers = new Map<string, unknown>()
    const session = {
      metadata: null as unknown,
      setActionHandler: (action: string, fn: unknown) => handlers.set(action, fn),
    }
    vi.stubGlobal('navigator', { ...navigator, mediaSession: session })
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(readonly init: Record<string, unknown>) {}
      },
    )
    usePlayer.getState().play(track({ artworkUrl: 'https://res.cloudinary.com/demo/image/upload/c.jpg' }))
    expect((session.metadata as { init: Record<string, unknown> }).init).toMatchObject({
      title: 'Bruma en Gràcia',
      artist: 'Tigre Púrpura',
      artwork: [expect.objectContaining({ src: 'https://res.cloudinary.com/demo/image/upload/c.jpg' })],
    })
    expect([...handlers.keys()]).toEqual(
      expect.arrayContaining(['play', 'pause', 'previoustrack', 'nexttrack']),
    )
    ;(handlers.get('pause') as () => void)()
    expect(usePlayer.getState().status).toBe('paused')
    vi.unstubAllGlobals()
  })

  it('RF-PLAY-09: si el audio no carga, el estado es `error` y reintentar vuelve a pedirlo', () => {
    usePlayer.getState().play(track())
    playerElement().dispatchEvent(new Event('error'))
    expect(usePlayer.getState().status).toBe('error')
    usePlayer.getState().retry()
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled()
    expect(usePlayer.getState().status).toBe('playing')
  })

  it('anterior y siguiente recorren la cola; pasados 3 s, anterior vuelve al principio', () => {
    const a = track({ id: 'a' })
    const b = track({ id: 'b' })
    usePlayer.getState().play(a, { queue: [a, b] })
    usePlayer.getState().next()
    expect(usePlayer.getState().track?.id).toBe('b')
    usePlayer.getState().next()
    expect(usePlayer.getState().track?.id).toBe('b')
    usePlayer.getState().seek(10_000)
    usePlayer.getState().prev()
    expect(usePlayer.getState()).toMatchObject({ positionMs: 0, track: { id: 'b' } })
    usePlayer.getState().prev()
    expect(usePlayer.getState().track?.id).toBe('a')
  })

  it('un único elemento de audio para todas las pistas; parar lo vacía', () => {
    usePlayer.getState().play(track({ id: 'a' }))
    const first = playerElement()
    usePlayer.getState().play(track({ id: 'b', streamUrl: 'https://res.cloudinary.com/demo/b.mp3' }))
    expect(playerElement()).toBe(first)
    expect(first.src).toBe('https://res.cloudinary.com/demo/b.mp3')
    expect(first.crossOrigin).toBe('anonymous')
    usePlayer.getState().stop()
    expect(usePlayer.getState()).toMatchObject({ track: null, status: 'idle' })
  })
})
