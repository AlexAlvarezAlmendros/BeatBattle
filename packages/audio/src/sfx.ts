import { DEFAULT_KEY, type Key, midiToHz, pentatonicHz, pentatonicMidi, tonicTriadHz } from './theory'

/**
 * Efectos de sonido como datos (guía §3.7, Anexo D; `RD-SND-02`): capas de ruido, tono o FM con filtro y
 * envolvente, al estilo *sfxr* pero cálidos. Es el modelo `SfxDef` de Orchard con dos datos más por
 * efecto: su **nivel** (dBFS de pico en el bus de efectos al 100 %) y su **duración** nominal del Anexo D.
 * El cliente los sintetiza (`apps/web/src/audio/synth.ts`); aquí no hay Web Audio.
 *
 * Los tonales van en la tonalidad de la semana: el catálogo se construye con una `Key` (§3.7.1).
 */

export interface SfxLayer {
  kind: 'noise' | 'tone' | 'fm'
  noise?: 'white' | 'pink' | 'brown'
  wave?: 'sine' | 'triangle' | 'sawtooth'
  /** Frecuencia inicial y final (Hz) para tonos; se desliza en exponencial. */
  freq?: readonly [number, number]
  /** FM: relación entre moduladora y portadora, y profundidad (× la portadora). */
  harmonicity?: number
  modIndex?: number
  filter?: { type: 'lowpass' | 'highpass' | 'bandpass'; freq: readonly [number, number]; q: number }
  /** Ataque (s) y constante de caída (s; la envolvente baja a ~2 % en `decay`). */
  attack: number
  decay: number
  /** Duración de la capa (s). */
  dur: number
  /**
   * Ganancia relativa de la capa dentro del efecto (lineal). Puede pasar de 1 para compensar un filtro
   * estrecho: el nivel del efecto se mide en el pico de lo que sale (Anexo D).
   */
  gain: number
  /** Retardo de la capa respecto al disparo (s). */
  delay?: number
}

export interface SfxDef {
  layers: readonly SfxLayer[]
  /** Variación aleatoria de tono en cada disparo (semitonos, ±). */
  jitter: number
  /** Nivel de pico (dBFS) en el bus de efectos al 100 % (Anexo D). */
  levelDb: number
  /** Duración nominal (s, Anexo D). */
  duration: number
}

/** Los efectos de la tarea 1.4 (el resto del Anexo D llega con sus pantallas). */
export const SFX_IDS = [
  'ui.enter',
  'ui.hover',
  'ui.press',
  'star.hover.1',
  'star.hover.2',
  'star.hover.3',
  'star.hover.4',
  'star.hover.5',
  'star.vote.1',
  'star.vote.2',
  'star.vote.3',
  'star.vote.4',
  'star.vote.5',
  'vote.locked',
  'xp.gain',
  'level.up',
] as const

export type SfxId = (typeof SFX_IDS)[number]

const noise = (layer: Omit<SfxLayer, 'kind'>): SfxLayer => ({ kind: 'noise', noise: 'pink', ...layer })
const tone = (layer: Omit<SfxLayer, 'kind'>): SfxLayer => ({ kind: 'tone', wave: 'sine', ...layer })
const fm = (layer: Omit<SfxLayer, 'kind'>): SfxLayer => ({ kind: 'fm', wave: 'sine', ...layer })

const at = (hz: number) => [hz, hz] as const

/** «La nota + su octava» de las estrellas que votan 1–4 (Anexo D). */
function starVote(hz: number): SfxLayer[] {
  return [
    fm({ freq: at(hz), harmonicity: 2, modIndex: 0.6, attack: 0.004, decay: 0.2, dur: 0.25, gain: 1 }),
    tone({ freq: at(hz * 2), attack: 0.004, decay: 0.16, dur: 0.22, gain: 0.5, delay: 0.03 }),
  ]
}

/**
 * Catálogo de la tarea 1.4 en la tonalidad `key`. Diseño, duración, nivel y variación del Anexo D;
 * `xpCombo` sube el blip de `xp.gain` un grado de la pentatónica por combo.
 */
export function sfxCatalog(key: Key = DEFAULT_KEY, xpCombo = 0): Record<SfxId, SfxDef> {
  const star = (degree: number) => pentatonicHz(key, degree, 5)
  const triad = tonicTriadHz(key, 5)
  const [root = 440, third = 554, fifth = 659] = triad
  const xpDegree = 3 + Math.max(0, Math.min(xpCombo, 7))
  const fanfare = [1, 2, 3, 4, 5, 6].map((degree) => pentatonicHz(key, degree, 5))
  const starHover = (degree: number): SfxDef => ({
    jitter: 0,
    levelDb: -26,
    duration: 0.12,
    layers: [
      fm({
        freq: at(star(degree)),
        harmonicity: 1,
        modIndex: 0.35,
        attack: 0.006,
        decay: 0.09,
        dur: 0.12,
        gain: 1,
      }),
    ],
  })
  const vote = (degree: number): SfxDef => ({
    jitter: 0,
    levelDb: -14,
    duration: 0.25,
    layers: starVote(star(degree)),
  })

  return {
    'ui.enter': {
      jitter: 0,
      levelDb: -6,
      duration: 1.2,
      layers: [
        tone({ freq: [55, 40], attack: 0.003, decay: 0.55, dur: 0.7, gain: 1 }),
        noise({
          filter: { type: 'lowpass', freq: [200, 8000], q: 0.7 },
          attack: 0.6,
          decay: 0.5,
          dur: 1.2,
          gain: 0.35,
        }),
      ],
    },
    'ui.hover': {
      jitter: 1,
      levelDb: -30,
      duration: 0.025,
      layers: [
        noise({
          noise: 'white',
          filter: { type: 'bandpass', freq: at(3000), q: 8 },
          attack: 0.001,
          decay: 0.02,
          dur: 0.025,
          gain: 18,
        }),
      ],
    },
    'ui.press': {
      jitter: 1,
      levelDb: -18,
      duration: 0.04,
      layers: [
        noise({
          noise: 'white',
          filter: { type: 'highpass', freq: at(1500), q: 0.7 },
          attack: 0.001,
          decay: 0.02,
          dur: 0.03,
          gain: 0.6,
        }),
        tone({ freq: at(1200), attack: 0.001, decay: 0.03, dur: 0.04, gain: 0.7 }),
      ],
    },
    'star.hover.1': starHover(1),
    'star.hover.2': starHover(2),
    'star.hover.3': starHover(3),
    'star.hover.4': starHover(4),
    'star.hover.5': starHover(5),
    'star.vote.1': vote(1),
    'star.vote.2': vote(2),
    'star.vote.3': vote(3),
    'star.vote.4': vote(4),
    'star.vote.5': {
      jitter: 0,
      levelDb: -10,
      duration: 0.6,
      layers: [
        ...[root, third, fifth, root * 2].map((hz, index) =>
          fm({
            freq: at(hz),
            harmonicity: 2,
            modIndex: 0.5,
            attack: 0.004,
            decay: 0.4,
            dur: 0.6 - index * 0.04,
            gain: 0.5,
            delay: index * 0.04,
          }),
        ),
        noise({
          noise: 'white',
          filter: { type: 'highpass', freq: [6000, 9000], q: 0.7 },
          attack: 0.01,
          decay: 0.3,
          dur: 0.45,
          gain: 0.25,
          delay: 0.12,
        }),
      ],
    },
    'vote.locked': {
      jitter: 0.5,
      levelDb: -12,
      duration: 0.12,
      layers: [
        tone({ freq: [90, 70], attack: 0.002, decay: 0.09, dur: 0.12, gain: 1.4 }),
        noise({
          noise: 'brown',
          filter: { type: 'lowpass', freq: at(900), q: 0.7 },
          attack: 0.002,
          decay: 0.07,
          dur: 0.1,
          gain: 0.85,
        }),
      ],
    },
    'xp.gain': {
      jitter: 0,
      levelDb: -22,
      duration: 0.09,
      layers: [
        tone({
          wave: 'triangle',
          freq: [pentatonicHz(key, xpDegree, 5), midiToHz(pentatonicMidi(key, xpDegree + 1, 5))],
          attack: 0.003,
          decay: 0.07,
          dur: 0.09,
          gain: 1,
        }),
      ],
    },
    'level.up': {
      jitter: 0,
      levelDb: -8,
      duration: 1.6,
      layers: [
        ...fanfare.map((hz, index) =>
          fm({
            freq: at(hz),
            harmonicity: 3,
            modIndex: 1.2,
            attack: 0.004,
            decay: 0.18,
            dur: 0.22,
            gain: 0.43,
            delay: index * 0.09,
          }),
        ),
        ...[root, third, fifth, root * 2].map((hz) =>
          fm({
            freq: at(hz),
            harmonicity: 2,
            modIndex: 0.9,
            attack: 0.01,
            decay: 0.85,
            dur: 1.05,
            gain: 0.27,
            delay: 0.55,
          }),
        ),
      ],
    },
  }
}
