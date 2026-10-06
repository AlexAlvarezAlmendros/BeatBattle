import { color } from '@beatbattle/shared/tokens'
import type { Quality } from '../quality'
import type { BurstKind } from '../runtime'

/**
 * Partículas del Escenario (guía §3.5 capa 2, §4.17; tarea 1.3), sin three: cuántas caben, hasta dónde
 * llegan y cómo nace cada una. El *shader* (`shaders/particles.vert.glsl`) las mueve con estas mismas
 * cuentas, así que lo que se prueba aquí es lo que se ve.
 */

/** Partículas vivas a la vez como mucho (§4.17: ≤ 4.000 en alta, ≤ 1.500 en media; baja, el 25 %). */
export const PARTICLE_BUDGET: Record<Quality, number> = {
  alta: 4000,
  media: 1500,
  baja: 1000,
  apagada: 0,
}

/** Partículas de una ráfaga con la calidad alta (las demás calidades las escalan con su presupuesto). */
export const BURST_COUNT: Record<BurstKind, number> = {
  sparks: 160,
  confetti: 360,
}

/** Partículas de una ráfaga: las pedidas (o las de su tipo), escaladas al presupuesto y nunca más que él. */
export function burstCount(kind: BurstKind, quality: Quality, requested?: number): number {
  const budget = PARTICLE_BUDGET[quality]
  const wanted = Math.max(0, Math.round(requested ?? BURST_COUNT[kind]))
  return Math.min(budget, Math.round((wanted * budget) / PARTICLE_BUDGET.alta))
}

/**
 * Radio de una ráfaga (px CSS) para que el círculo que barre ocupe como mucho `area` de la ventana: lo
 * que autoriza el limitador de destellos (≤ 25 %, `RD-MOT-04`). Ninguna partícula sale de él.
 */
export function burstRadius(area: number, width: number, height: number): number {
  const share = Number.isFinite(area) ? Math.min(Math.max(area, 0), 1) : 0
  return Math.sqrt((share * width * height) / Math.PI)
}

/** Una partícula al nacer: lo que el *shader* necesita para moverla sin volver a la CPU. */
export interface ParticleSpawn {
  /** Origen (px CSS). */
  x: number
  y: number
  /** Desplazamiento final hacia fuera (px CSS): dirección × alcance. */
  dx: number
  dy: number
  /** Caída al final de su vida (px CSS, hacia abajo). */
  fall: number
  /** Vida (s). */
  life: number
  /** Lado (px CSS). */
  size: number
  /** Color sRGB en [0, 1]. */
  rgb: [number, number, number]
  /** Opacidad máxima: la que autoriza el limitador (≤ 40 %). */
  alpha: number
  /** 0 chispa (punto redondo), 1 confeti (cuadrado que gira). */
  kind: 0 | 1
  /** Vueltas por segundo del confeti (con signo). */
  spin: number
}

/** `#rrggbb` → sRGB en [0, 1]. */
export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

/** Chispas rojas y blancas; confeti en la paleta (§3.5 capa 2), siempre de los tokens. */
const SPARK_COLORS = [color.red, color.red, color.red, color.white, color.white].map(hexToRgb)
const CONFETTI_COLORS = [color.red, color.white, color.faceRedTint, color.redShade, color.white].map(hexToRgb)

/**
 * Reparto del radio: el alcance hacia fuera más la caída nunca pasa de él (chispas, 0,85 + 0,15; confeti,
 * 0,6 + 0,4), así que la ráfaga se queda en su círculo.
 */
const SPARK_REACH = 0.85
const SPARK_FALL = 0.15
const CONFETTI_REACH = 0.6
const CONFETTI_FALL = 0.4

export interface BurstSpec {
  kind: BurstKind
  x: number
  y: number
  count: number
  /** Radio (px CSS), de `burstRadius`. */
  radius: number
  /** Opacidad autorizada (≤ 0,4). */
  alpha: number
}

const pick = <T>(list: readonly T[], random: () => number): T =>
  list[Math.min(list.length - 1, Math.floor(random() * list.length))] as T

/** Las partículas de una ráfaga, con un generador de números (con semilla en las pruebas). */
export function spawnBurst(spec: BurstSpec, random: () => number): ParticleSpawn[] {
  const sparks = spec.kind === 'sparks'
  const particles: ParticleSpawn[] = []
  for (let i = 0; i < spec.count; i++) {
    const angle = random() * Math.PI * 2
    const reach = spec.radius * (sparks ? SPARK_REACH : CONFETTI_REACH) * (0.35 + 0.65 * random())
    const fall = spec.radius * (sparks ? SPARK_FALL : CONFETTI_FALL) * (0.5 + 0.5 * random())
    particles.push({
      x: spec.x,
      y: spec.y,
      dx: Math.cos(angle) * reach,
      dy: Math.sin(angle) * reach,
      fall,
      life: sparks ? 0.45 + 0.35 * random() : 1 + 0.6 * random(),
      size: sparks ? 2 + 2 * random() : 4 + 3 * random(),
      rgb: pick(sparks ? SPARK_COLORS : CONFETTI_COLORS, random),
      alpha: spec.alpha,
      kind: sparks ? 0 : 1,
      spin: sparks ? 0 : (random() < 0.5 ? -1 : 1) * (0.6 + 1.4 * random()),
    })
  }
  return particles
}

/** Curva del alcance (la del *shader*): sale rápido y se frena. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3

/** Dónde está una partícula a la fracción `t` de su vida (la misma cuenta que el *shader*). */
export function particleAt(particle: ParticleSpawn, t: number): { x: number; y: number } {
  const u = Math.min(Math.max(t, 0), 1)
  const out = easeOut(u)
  return { x: particle.x + particle.dx * out, y: particle.y + particle.dy * out + particle.fall * u * u }
}
