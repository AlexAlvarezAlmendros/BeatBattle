import { create } from 'zustand'
import { audio } from '../../audio/engine'
import type { WaveformPeak } from '../../ui/Waveform'

/**
 * El reproductor global (guía §2.6, §4.7.3; tarea 5.13): **un único** `HTMLAudioElement` para toda la web
 * (`crossOrigin="anonymous"`, `preload="none"`), que sigue sonando al navegar porque vive fuera de las
 * pantallas (`RF-PLAY-01`). Lo usan el sample de la semana, la rejilla, la ficha y el Modo Jurado.
 *
 * - **Sonoridad** (`RF-PLAY-03`): cada pista suena con su `gainDb` (medida en el servidor, ≤ 0: solo
 *   atenúa) con una rampa de 50 ms; «Escuchar el master tal cual» (Ajustes → Sonido) la quita, salvo en el
 *   Modo Jurado (`equalize: 'always'`).
 * - **Voto ciego** (`RD-MOT-06`): una entrada sin sellar pasa por el motor con `blind`, y entonces nada
 *   visual la lee (el analizador no llega al Escenario).
 * - **Media Session** (`RF-PLAY-02`): título, artista (alias o productor), portada y play, pausa, anterior
 *   y siguiente, en los controles del sistema.
 * - **Errores** (`RF-PLAY-09`): si no carga, `status: 'error'`; la barra lo dice y ofrece reintentar.
 *
 * Ningún sonido antes de un gesto (`RD-SND-01`): `play` solo se llama desde un clic, un toque o una tecla.
 */

export interface PlayerTrack {
  /** Id de la entrada, o `sample:<semana>`. */
  id: string
  kind: 'entry' | 'sample'
  title: string
  /** Alias de batalla (voto ciego), productor (revelada) o créditos (sample). */
  artist: string
  streamUrl: string
  durationMs: number
  /** Ajuste de sonoridad en dB (≤ 0); `null` sin medir (0 dB). */
  gainDb: number | null
  /** Portada para la Media Session (solo una URL pública: la generativa no tiene). */
  artworkUrl: string | null
  /** Portada de la barra: la generativa con su semilla, o la URL (la propia revelada o la del sample). */
  cover:
    | { kind: 'generative'; seed: number; bpm: number | null; musicalKey: string | null }
    | { kind: 'url'; url: string }
    | null
  /** Onda (mín/máx por barra), si la hay. */
  peaks: readonly WaveformPeak[] | null
  /** Entrada de una semana ciega sin sellar (`RD-MOT-06`). */
  blind: boolean
  weekSlug: string
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export interface PlayOptions {
  /** La cola para anterior y siguiente (la pista va dentro). */
  queue?: readonly PlayerTrack[]
  /** El Modo Jurado iguala siempre, aunque el master esté «tal cual» (§2.6). */
  equalize?: 'always'
  /** Empezar desde aquí (ms). */
  fromMs?: number
}

interface PlayerState {
  track: PlayerTrack | null
  queue: readonly PlayerTrack[]
  status: PlayerStatus
  /** Posición en ms. */
  positionMs: number
  /** «Escuchar el master tal cual»: sin igualación fuera del Modo Jurado (por defecto, no). */
  rawMaster: boolean
  /** La pista actual se iguala siempre (Modo Jurado). */
  forceEqualize: boolean
  play(track: PlayerTrack, options?: PlayOptions): void
  toggle(): void
  pause(): void
  seek(ms: number): void
  next(): void
  prev(): void
  retry(): void
  /** Vacía el reproductor (deja de sonar y la barra se va). */
  stop(): void
  setRawMaster(raw: boolean): void
}

/** Clave de `localStorage` de «Escuchar el master tal cual». */
export const RAW_MASTER_STORAGE_KEY = 'bb:raw-master'

function readRawMaster(): boolean {
  try {
    return globalThis.localStorage?.getItem(RAW_MASTER_STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

let element: HTMLAudioElement | null = null
let detach: (() => void) | null = null
let attachedBlind: boolean | null = null

/** El elemento único, creado al primer uso (en el navegador). */
export function playerElement(): HTMLAudioElement {
  if (element) return element
  const el = new Audio()
  el.crossOrigin = 'anonymous'
  el.preload = 'none'
  el.addEventListener('timeupdate', () => usePlayer.setState({ positionMs: el.currentTime * 1000 }))
  el.addEventListener('playing', () => usePlayer.setState({ status: 'playing' }))
  el.addEventListener('pause', () => {
    if (usePlayer.getState().status === 'playing') usePlayer.setState({ status: 'paused' })
  })
  el.addEventListener('waiting', () => usePlayer.setState({ status: 'loading' }))
  el.addEventListener('ended', () => usePlayer.setState({ status: 'ended' }))
  el.addEventListener('error', () => {
    // Un `src` vacío (al parar) también dispara `error`: solo cuenta si hay pista.
    if (usePlayer.getState().track) usePlayer.setState({ status: 'error' })
  })
  element = el
  return el
}

/** Pasa el elemento por el motor (bus de música, *ducking*, analizador), como fuente ciega o no. */
function route(track: PlayerTrack): void {
  const el = playerElement()
  audio.unlock()
  if (detach && attachedBlind === track.blind) return
  detach?.()
  detach = audio.attachElement(el, { blind: track.blind })
  attachedBlind = track.blind
}

/** La ganancia que toca a la pista actual (`RF-PLAY-03`). */
export function gainFor(track: PlayerTrack, state: Pick<PlayerState, 'rawMaster' | 'forceEqualize'>): number {
  if (state.rawMaster && !state.forceEqualize) return 0
  return Math.min(0, track.gainDb ?? 0)
}

function applyGain(): void {
  const { track, rawMaster, forceEqualize } = usePlayer.getState()
  if (!track || !element) return
  audio.setElementGainDb(element, gainFor(track, { rawMaster, forceEqualize }))
}

function mediaSession(): MediaSession | null {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null
}

/** Media Session (`RF-PLAY-02`): metadatos y acciones de la pista. */
function publishSession(track: PlayerTrack): void {
  const session = mediaSession()
  if (!session) return
  if (typeof MediaMetadata !== 'undefined')
    session.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: 'Beat Battle',
      artwork: track.artworkUrl ? [{ src: track.artworkUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
    })
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => usePlayer.getState().toggle()],
    ['pause', () => usePlayer.getState().pause()],
    ['previoustrack', () => usePlayer.getState().prev()],
    ['nexttrack', () => usePlayer.getState().next()],
    ['seekto', (details) => usePlayer.getState().seek((details.seekTime ?? 0) * 1000)],
  ]
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler)
    } catch {
      // Acción no admitida en este navegador.
    }
  }
}

function start(fromMs = 0): void {
  const el = playerElement()
  if (fromMs > 0) el.currentTime = fromMs / 1000
  void el.play().catch(() => {
    if (usePlayer.getState().status !== 'error') usePlayer.setState({ status: 'paused' })
  })
}

export const usePlayer = create<PlayerState>((set, get) => ({
  track: null,
  queue: [],
  status: 'idle',
  positionMs: 0,
  rawMaster: readRawMaster(),
  forceEqualize: false,

  play(track, options = {}) {
    const el = playerElement()
    const same = get().track?.id === track.id && el.src !== ''
    route(track)
    set({
      track,
      queue: options.queue ?? (get().queue.some((item) => item.id === track.id) ? get().queue : [track]),
      forceEqualize: options.equalize === 'always',
      status: 'loading',
      ...(same ? {} : { positionMs: options.fromMs ?? 0 }),
    })
    if (!same) {
      el.preload = 'auto'
      el.src = track.streamUrl
    }
    applyGain()
    publishSession(track)
    start(options.fromMs ?? 0)
  },

  toggle() {
    const { track, status } = get()
    if (!track) return
    if (status === 'playing' || status === 'loading') {
      get().pause()
      return
    }
    if (status === 'error') {
      get().retry()
      return
    }
    route(track)
    if (status === 'ended') playerElement().currentTime = 0
    set({ status: 'loading' })
    start()
  },

  pause() {
    element?.pause()
    if (get().track) set({ status: 'paused' })
  },

  seek(ms) {
    const { track } = get()
    if (!track || !element) return
    const clamped = Math.min(track.durationMs, Math.max(0, ms))
    element.currentTime = clamped / 1000
    set({ positionMs: clamped })
  },

  next() {
    const { track, queue } = get()
    const at = queue.findIndex((item) => item.id === track?.id)
    const following = at >= 0 ? queue[at + 1] : undefined
    if (following) get().play(following, { queue, ...(get().forceEqualize ? { equalize: 'always' } : {}) })
  },

  prev() {
    const { track, queue, positionMs } = get()
    // Como en cualquier reproductor: pasados 3 s, «anterior» vuelve al principio de la pista.
    if (positionMs > 3000) {
      get().seek(0)
      return
    }
    const at = queue.findIndex((item) => item.id === track?.id)
    const before = at > 0 ? queue[at - 1] : undefined
    if (before) get().play(before, { queue, ...(get().forceEqualize ? { equalize: 'always' } : {}) })
    else get().seek(0)
  },

  retry() {
    const { track, positionMs } = get()
    if (!track) return
    const el = playerElement()
    route(track)
    set({ status: 'loading' })
    el.src = track.streamUrl
    el.load()
    start(positionMs)
  },

  stop() {
    const el = element
    set({ track: null, queue: [], status: 'idle', positionMs: 0, forceEqualize: false })
    if (el) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    const session = mediaSession()
    if (session) session.metadata = null
  },

  setRawMaster(raw) {
    try {
      globalThis.localStorage?.setItem(RAW_MASTER_STORAGE_KEY, raw ? 'on' : 'off')
    } catch {
      // Sin almacenamiento: dura lo que la pestaña.
    }
    set({ rawMaster: raw })
    applyGain()
  },
}))

/** Para los tests: vuelve al estado inicial y suelta el elemento. */
export function resetPlayerForTests(): void {
  detach?.()
  detach = null
  attachedBlind = null
  element = null
  usePlayer.setState({
    track: null,
    queue: [],
    status: 'idle',
    positionMs: 0,
    forceEqualize: false,
    rawMaster: false,
  })
}
