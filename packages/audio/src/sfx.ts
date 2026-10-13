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

/**
 * Los efectos de la tarea 1.4, `vote.unlocked` de la 1.5 y los de la interfaz de la 2.27 (`ui.move`,
 * `ui.toggle`, `ui.open`/`ui.close`, `ui.error`, `ui.success`, `nav.page`). El resto del Anexo D llega con
 * sus pantallas.
 */
export const SFX_IDS = [
  'ui.enter',
  'ui.hover',
  'ui.press',
  'ui.move',
  'ui.toggle',
  'ui.open',
  'ui.close',
  'ui.error',
  'ui.success',
  'nav.page',
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
  'vote.unlocked',
  'xp.gain',
  'level.up',
  'drop.needle',
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
  // Los de la interfaz que tienen nota van en la tonalidad (§3.7.1): la tónica en la 6.ª octava para los
  // clics, en la 3.ª para el error.
  const [clickRoot = 1047] = tonicTriadHz(key, 6)
  const [lowRoot = 131] = tonicTriadHz(key, 3)
  const semitone = 2 ** (1 / 12)
  const fifthUp = 2 ** (7 / 12)
  const majorThird = 2 ** (4 / 12)
  // `gain` compensa lo que el paso banda se come (medido en el render offline, Anexo D).
  const blow = (from: number, to: number, gain: number): SfxDef => ({
    jitter: 0,
    levelDb: -20,
    duration: 0.22,
    layers: [
      noise({
        filter: { type: 'bandpass', freq: [from, to], q: 1.4 },
        attack: 0.06,
        decay: 0.12,
        dur: 0.22,
        gain,
      }),
    ],
  })
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
    // Tic del cursor de juego (máx. 12 por segundo, en el motor).
    'ui.move': {
      jitter: 0,
      levelDb: -28,
      duration: 0.02,
      layers: [
        noise({
          noise: 'white',
          filter: { type: 'bandpass', freq: at(4500), q: 6 },
          attack: 0.001,
          decay: 0.012,
          dur: 0.02,
          gain: 7.2,
        }),
      ],
    },
    // Dos clics a una quinta (pestañas, chips, conmutadores).
    'ui.toggle': {
      jitter: 0,
      levelDb: -20,
      duration: 0.06,
      layers: [
        tone({ wave: 'triangle', freq: at(clickRoot), attack: 0.001, decay: 0.012, dur: 0.025, gain: 1 }),
        tone({
          wave: 'triangle',
          freq: at(clickRoot * fifthUp),
          attack: 0.001,
          decay: 0.012,
          dur: 0.025,
          gain: 1,
          delay: 0.035,
        }),
      ],
    },
    // Soplo de ruido filtrado: ascendente al abrir una ventana, descendente al cerrarla.
    'ui.open': blow(400, 3200, 6.6),
    'ui.close': blow(3200, 400, 7.9),
    // Dos notas graves en segunda menor, triangular con filtro.
    'ui.error': {
      jitter: 0,
      levelDb: -14,
      duration: 0.28,
      layers: [lowRoot, lowRoot * semitone].map((hz, index) =>
        tone({
          wave: 'triangle',
          freq: at(hz),
          filter: { type: 'lowpass', freq: at(1400), q: 0.7 },
          attack: 0.004,
          decay: 0.1,
          dur: 0.14,
          gain: 1,
          delay: index * 0.14,
        }),
      ),
    },
    // Tercera mayor ascendente, campanita FM.
    'ui.success': {
      jitter: 0,
      levelDb: -16,
      duration: 0.3,
      layers: [root, root * majorThird].map((hz, index) =>
        fm({
          freq: at(hz),
          harmonicity: 3.5,
          modIndex: 0.8,
          attack: 0.003,
          decay: 0.14,
          dur: 0.18,
          gain: 1,
          delay: index * 0.12,
        }),
      ),
    },
    // El barrido de la diagonal al cambiar de página: ruido paso banda que sube.
    'nav.page': {
      jitter: 0,
      levelDb: -24,
      duration: 0.24,
      layers: [
        noise({
          filter: { type: 'bandpass', freq: [300, 5000], q: 2 },
          attack: 0.04,
          decay: 0.12,
          dur: 0.24,
          gain: 11.7,
        }),
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
    // La aguja cae (revelación del drop, §3.8.2): un clic seco y un crujido corto de vinilo, chasquidos
    // sueltos sobre un siseo filtrado. No es tonal: no cambia con la tonalidad de la semana.
    'drop.needle': {
      jitter: 0,
      levelDb: -12,
      duration: 1,
      layers: [
        noise({
          noise: 'white',
          filter: { type: 'highpass', freq: at(2500), q: 0.7 },
          attack: 0.001,
          decay: 0.02,
          dur: 0.03,
          gain: 0.85,
        }),
        tone({ freq: [1800, 500], attack: 0.001, decay: 0.03, dur: 0.05, gain: 0.5 }),
        noise({
          noise: 'pink',
          filter: { type: 'bandpass', freq: at(2400), q: 0.8 },
          attack: 0.05,
          decay: 0.7,
          dur: 0.92,
          gain: 0.2,
          delay: 0.04,
        }),
        ...[0.13, 0.26, 0.4, 0.55, 0.63, 0.79].map((delay) =>
          noise({
            noise: 'white',
            filter: { type: 'highpass', freq: at(4000), q: 0.7 },
            attack: 0.001,
            decay: 0.006,
            dur: 0.012,
            gain: 0.55,
            delay,
          }),
        ),
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
    // Las estrellas despiertan (1.5): barrido ascendente con tres notas de la escala (grados 1, 3 y 5).
    'vote.unlocked': {
      jitter: 0,
      levelDb: -16,
      duration: 0.45,
      layers: [1, 3, 5].map((degree, index) =>
        tone({
          wave: 'triangle',
          freq: [star(degree), star(degree) * 1.02],
          attack: 0.006,
          decay: 0.22,
          dur: 0.3,
          gain: 1,
          delay: index * 0.07,
        }),
      ),
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
