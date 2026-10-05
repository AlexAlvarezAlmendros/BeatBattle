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

type ContextConstructor = new () => AudioContext

function contextConstructor(): ContextConstructor | null {
  if (typeof window === 'undefined') return null
  const legacy = (window as Window & { webkitAudioContext?: ContextConstructor }).webkitAudioContext
  return window.AudioContext ?? legacy ?? null
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private mix: Mix | null = null
  private bank: NoiseBank | null = null
  private key: Key = DEFAULT_KEY
  private catalog: Record<SfxId, SfxDef> = sfxCatalog(DEFAULT_KEY)
  private muted = false
  private lastHover = Number.NEGATIVE_INFINITY

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
      this.ctx = new Context()
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
