/**
 * Espejo tipado de los tokens de diseño (guía §3.2 y §3.6) para lo que no puede leer variables CSS:
 * el canvas del Escenario, los shaders, Motion y las imágenes generadas en servidor.
 *
 * La fuente de verdad es `apps/web/src/styles/tokens.css`. El test `test/tokens.test.ts` lee ese
 * fichero y comprueba que cada color, duración y curva de aquí coincide con su variable
 * (`color.ink950` ↔ `--bb-ink-950`, `duration.fast` ↔ `--bb-dur-fast`, `ease.out` ↔ `--bb-ease-out`)
 * y que no falta ninguno: si cambias uno, cambia los dos.
 *
 * Se importa como `@beatbattle/shared/tokens`.
 */

/** Colores con el mismo valor que en `tokens.css` (hex en minúsculas o `rgba()`). */
export const color = {
  black: '#000000',
  ink950: '#0a0a0a',
  ink900: '#0e0e0e',
  ink800: '#1a1a1a',
  ink700: '#1e1e1e',
  ink600: '#2a2a2a',
  glass: '#2b2b2bce',

  line: 'rgba(255, 255, 255, 0.08)',
  lineStrong: 'rgba(255, 255, 255, 0.18)',
  fillHover: 'rgba(255, 255, 255, 0.06)',
  fillActive: 'rgba(255, 255, 255, 0.1)',
  scrim: 'rgba(0, 0, 0, 0.7)',

  text: '#ffffff',
  text2: '#cccccc',
  text3: '#999999',
  text4: '#666666',

  red: '#ff003c',
  redHover: '#e6003a',
  redPress: '#cc0030',
  redText: '#ff4d6d',
  redGlow: 'rgba(255, 0, 60, 0.4)',
  redWash: 'rgba(255, 0, 60, 0.1)',
  wine: '#4a0d1c',
  waveIdle: '#3a3a3a',

  success: '#22c55e',
  danger: '#ef4444',

  gold: '#f5c542',
  goldGlow: 'rgba(245, 197, 66, 0.4)',
  platinum: '#d9dee5',
  diamond: '#8fe3ff',
} as const

export type ColorToken = keyof typeof color

/** Duraciones en milisegundos (§3.6). */
export const duration = {
  instant: 80,
  fast: 150,
  base: 240,
  slow: 420,
  reward: 900,
} as const

export type DurationToken = keyof typeof duration

/**
 * Duraciones con «reducir movimiento» (RNF-A11Y-03): solo fundidos de 200 ms como mucho; la
 * transición de página (`base`) queda en el fundido de 150 ms de §3.6.
 */
export const reducedDuration = {
  instant: 80,
  fast: 150,
  base: 150,
  slow: 200,
  reward: 200,
} as const satisfies Record<DurationToken, number>

/** Tope de cualquier animación con «reducir movimiento», en ms. */
export const REDUCED_MOTION_MAX_MS = 200

/** Curvas de Bézier cúbicas `[x1, y1, x2, y2]`: el formato que aceptan Motion y `cubic-bezier()`. */
export type CubicBezier = readonly [number, number, number, number]

export const ease = {
  /** Por defecto. */
  out: [0.22, 1, 0.36, 1],
  /** Transiciones de página. */
  inOut: [0.65, 0, 0.35, 1],
  /** Recompensas (con rebote). */
  back: [0.34, 1.56, 0.64, 1],
} as const satisfies Record<string, CubicBezier>

export type EaseToken = keyof typeof ease

/** Muelles de §3.6 para Motion (`transition={{ type: 'spring', ...spring.interaction }}`). */
export const spring = {
  /** Lo que se mueve por interacción. */
  interaction: { stiffness: 400, damping: 28 },
  /** Recompensas. */
  reward: { stiffness: 220, damping: 12 },
} as const

/** Capas (`z-index`) de §3.2, por si una pieza fuera del CSS necesita ordenarse con ellas. */
export const zIndex = {
  stage: 0,
  content: 10,
  island: 15,
  player: 20,
  hud: 30,
  modal: 40,
  toast: 50,
  ceremony: 60,
  gate: 70,
} as const

/** Nombre de la variable CSS de un token: `cssVarName('color', 'ink950')` → `--bb-ink-950`. */
export function cssVarName(group: 'color' | 'duration' | 'ease' | 'zIndex', key: string): string {
  const prefix = { color: '--bb-', duration: '--bb-dur-', ease: '--bb-ease-', zIndex: '--bb-z-' }[group]
  return prefix + toKebab(key)
}

/** `lineStrong` → `line-strong`, `ink950` → `ink-950`, `text2` → `text-2`. */
export function toKebab(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase()
}

/** Color RGBA con canales en 0–1, como lo quieren los uniformes de un shader. */
export type Rgba01 = readonly [r: number, g: number, b: number, a: number]

/**
 * Convierte un color de los tokens (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` o `rgb()`/`rgba()`) a
 * canales en 0–1. Lanza si el formato no es uno de esos.
 */
export function toRgba01(value: string): Rgba01 {
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim())
  if (hex) {
    let digits = hex[1]!
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('')
    const channels = digits.match(/../g)!.map((pair) => Number.parseInt(pair, 16) / 255)
    const [r, g, b, a = 1] = channels as [number, number, number, number?]
    return [r, g, b, a]
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/i.exec(
    value.trim(),
  )
  if (fn) {
    const [, r, g, b, alpha] = fn
    const a = alpha === undefined ? 1 : alpha.endsWith('%') ? Number(alpha.slice(0, -1)) / 100 : Number(alpha)
    return [Number(r) / 255, Number(g) / 255, Number(b) / 255, a]
  }
  throw new Error(`Color con formato no admitido: ${value}`)
}

/** `[x1, y1, x2, y2]` → `cubic-bezier(x1, y1, x2, y2)`. */
export function toCssCubicBezier(curve: CubicBezier): string {
  return `cubic-bezier(${curve.join(', ')})`
}
