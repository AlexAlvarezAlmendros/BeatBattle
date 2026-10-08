import { DEFAULT_KEY, type Key, type SfxDef, type SfxId, sfxCatalog } from '@beatbattle/audio'
import { createMix, type Mix } from './mix'
import { makeNoiseBank, type NoiseBank } from './noise'
import { playSfx } from './synth'

/**
 * Motor de audio del cliente (guía §3.7, tarea 1.4). Un solo `AudioContext`, que **no existe hasta la
 * primera interacción** (`RD-SND-01`: la política de *autoplay* y la cortesía de §3.7.1); hasta entonces
 * `play()` no hace nada. La puerta completa, con «PULSA PARA EMPEZAR» y `ui.enter`, es la tarea 1.13.
 *
 * - Efectos del catálogo de `@beatbattle/audio` afinados en la tonalidad de la semana (`setKey`).
 * - `ui.hover` como mucho 8 por segundo (Anexo D).
 * - Silencio (tecla M, `useSound`) en el máster; *ducking* con `setMusicPlaying` (`RD-SND-03`).
 */

/** Separación mínima entre dos `ui.hover` (s): 8 por segundo como mucho (Anexo D). */
export const HOVER_MIN_GAP = 1 / 8

type ContextConstructor = new (options?: AudioContextOptions) => AudioContext

function contextConstructor(): ContextConstructor | null {
  if (typeof window === 'undefined') return null
  const legacy = (window as Window & { webkitAudioContext?: ContextConstructor }).webkitAudioContext
  return window.AudioContext ?? legacy ?? null
}

/**
 * Latencia que se le pide al contexto (`RD-SND-05`: la mínima posible; la parte de la app < 10 ms). Con
 * puntero fino, la mínima del dispositivo (`0`): en Linux con PipeWire, la latencia base pasa de 10,7 ms
 * (`interactive`, bloques de 512) a 2,7, y el total medido, de 35 a ~27 ms. En táctil, `interactive`: con
 * un búfer mínimo, un móvil lento puede dar chasquidos.
 */
function latencyHint(): AudioContextLatencyCategory | number {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches
    ? 0
    : 'interactive'
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private mix: Mix | null = null
  private bank: NoiseBank | null = null
  private key: Key = DEFAULT_KEY
  private catalog: Record<SfxId, SfxDef> = sfxCatalog(DEFAULT_KEY)
  private muted = false
  private lastHover = Number.NEGATIVE_INFINITY
  private loop: AudioBufferSourceNode | null = null
  private element: HTMLMediaElement | null = null
  /** ¿Es el elemento que suena una entrada sin sellar? (`RD-MOT-06`) */
  private elementBlind = false
  private elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()
  private musicListeners = new Set<(playing: boolean) => void>()

  /** ¿Hay ya contexto (ha habido una interacción)? */
  get unlocked(): boolean {
    return this.ctx !== null
  }

  get context(): AudioContext | null {
    return this.ctx
  }

  /**
   * Crea y reanuda el contexto. Solo desde un gesto del usuario (clic, toque, tecla): fuera de uno, el
   * navegador lo dejaría suspendido.
   */
  unlock(): void {
    const Context = contextConstructor()
    if (!Context) return
    if (!this.ctx) {
      this.ctx = new Context({ latencyHint: latencyHint() })
      this.mix = createMix(this.ctx)
      this.bank = makeNoiseBank(this.ctx)
      this.mix.setMuted(this.muted)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setKey(key: Key): void {
    this.key = key
    this.catalog = sfxCatalog(key)
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.mix?.setMuted(muted)
  }

  setMusicPlaying(playing: boolean): void {
    this.mix?.setMusicPlaying(playing)
  }

  /**
   * Analizador del bus de música (tarea 1.6), o `null` sin contexto. También `null` mientras suena una
   * fuente ciega (`RD-MOT-06`): nada visual lee una entrada sin sellar.
   */
  get musicAnalyser(): AnalyserNode | null {
    if (this.blindPlaying) return null
    return this.mix?.analyser ?? null
  }

  /** ¿Suena una entrada sin sellar (`attachElement` con `blind`)? */
  private get blindPlaying(): boolean {
    return this.elementBlind && this.element !== null && !this.element.paused
  }

  /**
   * ¿Puede reaccionar lo visual a la música que suena? Sí con el sample y las entradas selladas; no con una
   * entrada sin sellar (`RD-MOT-06`, §1.3: todas igual hasta el sellado, así que la arena queda en reposo).
   */
  get musicReactive(): boolean {
    return this.musicPlaying && !this.blindPlaying
  }

  /** ¿Suena música (un bucle o un elemento de audio)? */
  get musicPlaying(): boolean {
    return this.loop !== null || (this.element !== null && !this.element.paused)
  }

  private announceMusic(): void {
    const playing = this.musicPlaying
    this.mix?.setMusicPlaying(playing)
    for (const listener of this.musicListeners) listener(playing)
  }

  /**
   * Lleva un `<audio>` por el bus de música (spike de la tarea 1.7; el reproductor es de la Fase 5): pasa
   * por el analizador (la trama reacciona) y por el *ducking*. El elemento necesita `crossOrigin` para que
   * el analizador vea el audio de Cloudinary. Devuelve con qué soltarlo. Hace falta el contexto.
   *
   * `blind` es obligatorio a propósito: una entrada de una semana sin sellar va con `true` y entonces nada
   * visual la lee (`RD-MOT-06`); el sample y las entradas selladas, con `false`.
   */
  attachElement(element: HTMLMediaElement, { blind }: { blind: boolean }): () => void {
    const { ctx, mix } = this
    if (!ctx || !mix) return () => {}
    let source = this.elementSources.get(element)
    if (!source) {
      source = ctx.createMediaElementSource(element)
      this.elementSources.set(element, source)
    }
    source.connect(mix.input.music)
    this.element = element
    this.elementBlind = blind
    const update = () => this.announceMusic()
    for (const type of ['play', 'pause', 'ended'] as const) element.addEventListener(type, update)
    update()
    return () => {
      for (const type of ['play', 'pause', 'ended'] as const) element.removeEventListener(type, update)
      source.disconnect()
      if (this.element === element) {
        this.element = null
        this.elementBlind = false
      }
      this.announceMusic()
    }
  }

  /** Avisa cada vez que la música empieza o para (el Escenario enciende o apaga la reactividad). */
  onMusicChange(listener: (playing: boolean) => void): () => void {
    this.musicListeners.add(listener)
    return () => this.musicListeners.delete(listener)
  }

  /**
   * Toca un bucle por el bus de música (el ritmo de prueba del banco, tarea 1.6; el reproductor de entradas
   * es de la Fase 5), con el *ducking* de efectos y ambiente. Hace falta el contexto (`unlock`).
   */
  playLoop(make: (ctx: BaseAudioContext) => AudioBuffer): void {
    const { ctx, mix } = this
    if (!ctx || !mix) return
    this.stopLoop()
    const source = ctx.createBufferSource()
    source.buffer = make(ctx)
    source.loop = true
    source.connect(mix.input.music)
    source.start()
    this.loop = source
    mix.setMusicPlaying(true)
    for (const listener of this.musicListeners) listener(true)
  }

  stopLoop(): void {
    if (!this.loop) return
    this.loop.stop()
    this.loop.disconnect()
    this.loop = null
    this.mix?.setMusicPlaying(false)
    for (const listener of this.musicListeners) listener(false)
  }

  /** Dispara un efecto. Sin contexto, en silencio o con `ui.hover` demasiado seguido, no hace nada. */
  play(id: SfxId, options: { xpCombo?: number } = {}): void {
    const { ctx, mix, bank } = this
    if (!ctx || !mix || !bank || this.muted || ctx.state !== 'running') return
    if (id === 'ui.hover') {
      if (ctx.currentTime - this.lastHover < HOVER_MIN_GAP) return
      this.lastHover = ctx.currentTime
    }
    const def =
      id === 'xp.gain' && options.xpCombo ? sfxCatalog(this.key, options.xpCombo)[id] : this.catalog[id]
    playSfx(ctx, mix.input.sfx, bank, def, ctx.currentTime)
  }
}

/** El motor de la app (uno por pestaña). */
export const audio = new AudioEngine()

declare global {
  interface Window {
    /** El motor, para medir su latencia (`tools/shot/latency.mjs`, `RD-SND-05`). Solo en desarrollo. */
    __bbAudio?: AudioEngine
  }
}
if (import.meta.env.DEV && typeof window !== 'undefined') window.__bbAudio = audio
