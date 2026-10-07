/**
 * Reactividad al audio (guía §3.5 capa 0, tarea 1.6). Puro: de los datos de un analizador al tamaño de
 * punto de la trama de la arena. Lo único que se mueve con la música es **el tamaño de punto**, como
 * mucho un 15 % y por un paso bajo de 2 Hz como mucho: nunca la luminancia del rojo ni el brillo de un
 * área grande, y nunca un destello (`RNF-A11Y-04`, WCAG 2.3.1).
 */

/** Tamaño de punto máximo sobre el de reposo (§3.5: ≤ 15 %). */
export const REACTIVE_MAX_SCALE = 0.15

/** Corte del paso bajo de la reactividad (Hz; §3.5: ≤ 2 Hz). */
export const REACTIVE_CUTOFF_HZ = 2

/** Banda que mueve la trama: el bombo y el bajo. */
export const REACTIVE_BAND_HZ: readonly [number, number] = [40, 160]

/**
 * Energía media de una banda en `[0, 1]` a partir de `getByteFrequencyData` (cada valor, 0–255, es la
 * magnitud en dB entre `minDecibels` y `maxDecibels` del analizador). Sin bins en la banda, 0.
 */
export function bandEnergy(
  bins: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  [low, high]: readonly [number, number],
): number {
  const binHz = sampleRate / fftSize
  const from = Math.max(0, Math.floor(low / binHz))
  const to = Math.min(bins.length - 1, Math.ceil(high / binHz))
  if (to < from) return 0
  let sum = 0
  for (let i = from; i <= to; i++) sum += bins[i] ?? 0
  return sum / (to - from + 1) / 255
}

/** Coeficiente de un paso bajo de un polo para un paso de `dt` segundos (sin depender de los fps). */
export function lowPassAlpha(cutoffHz: number, dt: number): number {
  if (!(dt > 0) || !(cutoffHz > 0)) return 0
  return 1 - Math.exp(-2 * Math.PI * cutoffHz * dt)
}

/**
 * Puerta de ruido y escala de la energía: por debajo de `floor` (silencio, reverberación) no se mueve
 * nada; a partir de `ceiling`, el máximo.
 */
export function energyLevel(energy: number, floor = 0.35, ceiling = 0.8): number {
  if (!Number.isFinite(energy)) return 0
  return Math.min(1, Math.max(0, (energy - floor) / (ceiling - floor)))
}

export interface Reactivity {
  /** Avanza `dt` segundos con la energía de la banda (`bandEnergy`); devuelve la escala de punto. */
  step(energy: number, dt: number): number
  /** La escala actual (1 en reposo, 1 + `REACTIVE_MAX_SCALE` como mucho). */
  readonly scale: number
  /** Nivel filtrado en `[0, 1]`. */
  readonly level: number
  reset(): void
}

/** Energía → puerta → paso bajo de `cutoffHz` → escala de punto en `[1, 1 + maxScale]`. */
export function createReactivity({
  cutoffHz = REACTIVE_CUTOFF_HZ,
  maxScale = REACTIVE_MAX_SCALE,
}: {
  cutoffHz?: number
  maxScale?: number
} = {}): Reactivity {
  let level = 0
  return {
    step(energy, dt) {
      level += (energyLevel(energy) - level) * lowPassAlpha(cutoffHz, Math.min(dt, 0.25))
      return 1 + maxScale * level
    },
    get scale() {
      return 1 + maxScale * level
    },
    get level() {
      return level
    },
    reset() {
      level = 0
    },
  }
}

/** Luminancia relativa (WCAG) de un color sRGB en `[0, 1]`. */
export function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/**
 * Destellos por segundo como mucho en una serie de luminancias relativas (WCAG 2.3.1, «umbral general de
 * destello»): un destello es un par de cambios opuestos de al menos 0,1 de luminancia relativa cuando la
 * más oscura de las dos está por debajo de 0,80. Se sigue el extremo en curso: cada vez que la señal se
 * da la vuelta 0,1 o más desde él, es un cambio. Devuelve los pares de cambios (la mitad de los cambios)
 * en la ventana de 1 s que más tiene.
 */
export function maxFlashesPerSecond(samples: readonly { t: number; luminance: number }[]): number {
  const first = samples[0]
  if (!first) return 0
  const transitions: number[] = []
  // Sin dirección todavía, lo más alto y lo más bajo visto; después, el extremo de la dirección en curso.
  let low = first.luminance
  let high = first.luminance
  let direction = 0
  const turn = (t: number, to: number, from: number) =>
    Math.abs(to - from) >= 0.1 && Math.min(to, from) < 0.8 ? (transitions.push(t), true) : false
  for (const { t, luminance } of samples.slice(1)) {
    if (direction === 0) {
      if (luminance > low && turn(t, luminance, low)) {
        direction = 1
        high = luminance
      } else if (luminance < high && turn(t, luminance, high)) {
        direction = -1
        low = luminance
      } else {
        low = Math.min(low, luminance)
        high = Math.max(high, luminance)
      }
    } else if (direction > 0) {
      if (luminance >= high) high = luminance
      else if (turn(t, luminance, high)) {
        direction = -1
        low = luminance
      }
    } else if (luminance <= low) low = luminance
    else if (turn(t, luminance, low)) {
      direction = 1
      high = luminance
    }
  }
  let most = 0
  for (const [index, start] of transitions.entries()) {
    let count = 0
    for (const t of transitions.slice(index)) if (t - start < 1) count++
    most = Math.max(most, count)
  }
  return Math.floor(most / 2)
}
