import { type ColorToken, color, type Rgba01, toRgba01 } from '@beatbattle/shared/tokens'

/** Luminancia relativa de WCAG 2.x de un color opaco (canales en 0–1). */
export function relativeLuminance([r, g, b]: Rgba01): number {
  const linear = (channel: number) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** Mezcla un color con transparencia sobre un fondo opaco. */
export function compositeOver(foreground: Rgba01, background: Rgba01): Rgba01 {
  const [r, g, b, a] = foreground
  const [br, bg, bb] = background
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1]
}

/**
 * Contraste WCAG de `foreground` sobre `background` (los dos como en los tokens: hex o `rgba()`). Si el
 * primer plano tiene transparencia, se mezcla antes con el fondo, que se toma como opaco.
 */
export function contrastRatio(foreground: string, background: string): number {
  const bg = toRgba01(background)
  const opaqueBg: Rgba01 = [bg[0], bg[1], bg[2], 1]
  const fg = compositeOver(toRgba01(foreground), opaqueBg)
  const a = relativeLuminance(fg)
  const b = relativeLuminance(opaqueBg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export type ContrastLevel = 'aa' | 'aaLarge' | 'fail'

/** AA para texto normal (≥ 4,5:1), AA solo para texto grande e iconos (≥ 3:1) o nada. */
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 4.5) return 'aa'
  if (ratio >= 3) return 'aaLarge'
  return 'fail'
}

/** Para qué vale un par de colores según §3.2 «Reglas de contraste». */
export type ContrastUse = 'anyText' | 'largeText' | 'unused' | 'pressed' | 'disabled'

export interface ContrastRule {
  /** Texto y fondo, como claves de `color` de `@beatbattle/shared/tokens`. */
  text: ColorToken
  surface: ColorToken
  /** El ratio que da la tabla de la guía (redondeado a dos decimales). */
  expected: number
  use: ContrastUse
}

/**
 * La tabla de contraste de la guía §3.2 (WCAG 2.2 AA), par a par. La galería la enseña con el ratio
 * calculado sobre los tokens y el test comprueba que coincide con la guía y que cada uso es coherente
 * (texto de cualquier tamaño ≥ 4,5:1; texto grande ≥ 3:1). «`#ff003c` sobre `#18181a` o más claro» se
 * enseña con `--bb-ink-3` (`#1c1c1f`, el primer fondo de la paleta que ya no admite rojo pequeño).
 */
export const CONTRAST_RULES: readonly ContrastRule[] = [
  { text: 'black', surface: 'red', expected: 5.32, use: 'anyText' },
  { text: 'white', surface: 'redCta', expected: 4.75, use: 'anyText' },
  { text: 'white', surface: 'red', expected: 3.95, use: 'largeText' },
  { text: 'black', surface: 'redCta', expected: 4.43, use: 'unused' },
  { text: 'white', surface: 'redPress', expected: 5.82, use: 'pressed' },
  { text: 'red', surface: 'black', expected: 5.32, use: 'anyText' },
  { text: 'red', surface: 'panel', expected: 4.88, use: 'anyText' },
  { text: 'red', surface: 'panel2', expected: 4.66, use: 'anyText' },
  { text: 'red', surface: 'wine2', expected: 4.66, use: 'anyText' },
  { text: 'red', surface: 'ink3', expected: 4.3, use: 'largeText' },
  { text: 'red', surface: 'wine', expected: 3.89, use: 'largeText' },
  { text: 'text3', surface: 'black', expected: 8.33, use: 'anyText' },
  { text: 'text3', surface: 'wine', expected: 6.1, use: 'anyText' },
  { text: 'text2', surface: 'black', expected: 14.17, use: 'anyText' },
  { text: 'text2', surface: 'wine', expected: 10.38, use: 'anyText' },
  { text: 'white', surface: 'wine', expected: 15.38, use: 'anyText' },
  { text: 'white', surface: 'wine2', expected: 18.4, use: 'anyText' },
  { text: 'text4', surface: 'black', expected: 4.56, use: 'disabled' },
]

/** Ratio de un par de la tabla, calculado sobre los valores de los tokens. */
export function ruleRatio(rule: ContrastRule): number {
  return contrastRatio(color[rule.text], color[rule.surface])
}
