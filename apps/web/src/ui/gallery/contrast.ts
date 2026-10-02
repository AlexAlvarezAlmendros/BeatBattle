import { type Rgba01, toRgba01 } from '@beatbattle/shared/tokens'

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
