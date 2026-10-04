/**
 * Espejo tipado de los tokens de diseño de la arena (guía v0.6 §3.2 y §3.6) para lo que no puede leer
 * variables CSS: los generadores de texturas (trama, rayos, logo, vinilo-sol, portadas), el canvas del
 * Escenario, los shaders, Motion y las imágenes generadas en servidor.
 *
 * La fuente de verdad es `apps/web/src/styles/tokens.css`. El test `test/tokens.test.ts` lee ese
 * fichero y comprueba que cada valor de aquí coincide con su variable y que no falta ninguno de los
 * grupos espejados: si cambias uno, cambia los dos. Los nombres se derivan con `cssVarName`
 * (`color.panelVeil` ↔ `--bb-panel-veil`, `length.cutMd` ↔ `--bb-cut-md`, `duration.slam` ↔
 * `--bb-dur-slam`, `texture.halftoneCell` ↔ `--bb-tex-halftone-cell`).
 *
 * Se importa como `@beatbattle/shared/tokens`.
 */

/** Colores con el mismo valor que en `tokens.css` (hex en minúsculas o `rgba()`). */
export const color = {
  // Paleta del sello
  black: '#000000',
  red: '#ff003c',
  white: '#ffffff',
  wine: '#4a0d1c',
  // Derivados
  redCta: '#e6003a',
  redPress: '#cc0030',
  redShade: '#7a001f',
  wine2: '#2b0711',
  wine3: '#160308',
  panel: '#0e0e10',
  panel2: '#141416',
  panelVeil: 'rgba(6, 6, 8, 0.94)',
  ink3: '#1c1c1f',
  ink4: '#2a2a2d',
  waveIdle: '#3a3a3e',
  waveHalo: 'rgba(255, 255, 255, 0.22)',
  // Caras del logo (mezclas de la paleta en hex, para que el degradado se interpole en sRGB)
  faceWhiteShade: '#d1d1d1',
  faceWhiteTint: '#f2f2f2',
  faceRedTint: '#ff4a75',
  faceRedMid: '#ff1a50',
  faceRedShade: '#d40032',
  text: '#ffffff',
  text2: '#d4d4d4',
  text3: '#a3a3a3',
  text4: '#757575',
  line: 'rgba(255, 255, 255, 0.16)',
  lineStrong: 'rgba(255, 255, 255, 0.32)',
  scrim: 'rgba(0, 0, 0, 0.78)',
  // Tintas de las texturas
  texScanInk: 'rgba(0, 0, 0, 0.3)',
  texRayInk: 'rgba(255, 255, 255, 0.045)',
  texVignetteInk: 'rgba(0, 0, 0, 0.75)',
  texGiantInk: 'rgba(255, 255, 255, 0.07)',
} as const

export type ColorToken = keyof typeof color

/** Medallas (§3.2 «Medallas»): 1.º disco de oro, 2.º de platino, 3.º de diamante, en la paleta. */
export const medal = {
  1: 'red',
  2: 'white',
  3: 'wine',
} as const satisfies Record<1 | 2 | 3, ColorToken>

/** Familias tipográficas (`--bb-font-*`), tal cual las escribe `tokens.css`. */
export const font = {
  display: '"Anybody", system-ui, sans-serif',
  ui: '"Chakra Petch", system-ui, sans-serif',
  num: '"Oxanium", "Chakra Petch", ui-monospace, monospace',
} as const

/**
 * Medidas de forma y trazo en píxeles CSS (§3.2 «Forma» y «Trazos»): chaflanes, paralelogramos,
 * diagonal y trazos. En móvil, `--bb-slant` baja a 12 px (`lengthMobile`).
 */
export const length = {
  cutXs: 5,
  cutSm: 7,
  cutMd: 10,
  cut: 14,
  cutLg: 22,
  slant: 18,
  slantSm: 6,
  splitBand: 12,
  splitRule: 3,
  splitGap: 14,
  strokeHair: 1,
  stroke: 2,
  strokeCursor: 3,
  cursorGap: 4,
  strokeStamp: 3,
  strokeStampSm: 2,
} as const

export type LengthToken = keyof typeof length

/** Lo que cambia por debajo de 720 px de ancho. */
export const lengthMobile = {
  slant: 12,
} as const satisfies Partial<Record<LengthToken, number>>

/** Ángulos en grados: diagonal (respecto a la vertical) e inclinaciones. */
export const angle = {
  splitAngle: 17,
  tiltSticker: -7,
  tiltCard: -3,
  tiltAnn: -6,
  /** Giro máximo de un sello de goma: entre −9° y +9°. */
  tiltStamp: 9,
} as const

export type AngleToken = keyof typeof angle

/**
 * Parámetros de las texturas generadas por código (§3.2 «Texturas»), en píxeles CSS, grados o
 * proporciones. Sus tintas están en `color` (`texScanInk`, `texRayInk`…).
 */
export const texture = {
  /** Celda de la trama halftone en fondos (8–12 px; 9 en móvil). */
  halftoneCell: 11,
  /** Celda de la trama en piezas. */
  halftoneCellPiece: 8,
  /** Ángulo de la trama en fondos. */
  halftoneAngle: 30,
  /** Ángulo de la trama en piezas. */
  halftoneAnglePiece: 45,
  /** Radio máximo del punto como fracción de la celda. */
  halftoneMax: 0.74,
  /** Trama de relleno: un punto cada 8 px… */
  fillCell: 8,
  /** …de radio 2,3 px. */
  fillDot: 2.3,
  /** Líneas de barrido: 1 px… */
  scanLine: 1,
  /** …cada 3 px. */
  scanPeriod: 3,
  /** Estallido de rayos: rayo de 1,2°… */
  rayWidth: 1.2,
  /** …cada 6°. */
  rayStep: 6,
  /** Número gigante de la cuña, en px. */
  giantSize: 560,
  /** Ruido de sello: máscara de 180 px… */
  noiseSize: 180,
  /** …con 520 huecos. */
  noiseHoles: 520,
} as const

export type TextureToken = keyof typeof texture

/** Lo que cambia por debajo de 720 px de ancho. */
export const textureMobile = {
  halftoneCell: 9,
} as const satisfies Partial<Record<TextureToken, number>>

/** Logo y rótulos de anunciador: unidades SVG sobre un lienzo de 1040 de ancho (§3.2 «Trazos»). */
export const logo = {
  canvas: 1040,
  outline: 8,
  rim: 3,
  depth: 12,
  stepX: 0.9,
  stepY: 1.1,
} as const

/** Duraciones en milisegundos (§3.6). */
export const duration = {
  hitstop: 70,
  instant: 80,
  tick: 90,
  fast: 150,
  base: 240,
  slam: 280,
  slow: 420,
  reward: 900,
  swap: 1200,
} as const

export type DurationToken = keyof typeof duration

/**
 * Duraciones con «reducir movimiento» (RNF-A11Y-03): solo fundidos de 200 ms como mucho; la
 * transición de página (`base`) queda en el fundido de 150 ms de §3.6.
 */
export const reducedDuration = {
  hitstop: 70,
  instant: 80,
  tick: 90,
  fast: 150,
  base: 150,
  slam: 150,
  slow: 200,
  reward: 200,
  swap: 200,
} as const satisfies Record<DurationToken, number>

/**
 * Periodos de los bucles en milisegundos (`--bb-loop-*`). No cambian con «reducir movimiento»: con la
 * preferencia, la pieza quita el bucle o pasa a su variante estática (RNF-A11Y-03, RNF-A11Y-04 y
 * Anexo E). El vinilo-sol no tiene periodo fijo: `loopVinylMs(bpm)`.
 */
export const loop = {
  /** «PULSA PARA EMPEZAR» e «Inserta tu beat»: opacidad 1 ↔ 0,55. */
  breathe: 2000,
  /** Latido del reloj en la última hora (1 Hz). */
  heartbeat: 1000,
  /** Barrido del esqueleto. */
  shimmer: 1500,
  /** Onda de 5 barras del botón que carga. */
  loader: 1000,
  /** Crónica de la arena: un mensaje cada 5 s. */
  chronicle: 5000,
} as const

export type LoopToken = keyof typeof loop

/** Tiempos por compás del vinilo-sol: una vuelta por compás de 4 tiempos (§3.6, Anexo E). */
export const VINYL_BEATS_PER_TURN = 4

/** Periodo de una vuelta del vinilo-sol al BPM del sample: 92 BPM → ≈ 2,6 s. */
export function loopVinylMs(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error(`BPM no válido: ${bpm}`)
  return (60_000 / bpm) * VINYL_BEATS_PER_TURN
}

/** Escalonados en milisegundos (`--bb-stagger-*`): retardo entre piezas de una misma entrada. */
export const stagger = {
  /** Anexo E: barras de la forma de onda al crecer desde el centro. */
  wave: 2,
} as const

/** Tope de cualquier animación con «reducir movimiento», en ms. */
export const REDUCED_MOTION_MAX_MS = 200

/** Curvas de Bézier cúbicas `[x1, y1, x2, y2]`: el formato que aceptan Motion y `cubic-bezier()`. */
export type CubicBezier = readonly [number, number, number, number]

export const ease = {
  /** Cursor y placas (con un poco de rebote). */
  snap: [0.2, 1.4, 0.4, 1],
  /** Por defecto. */
  out: [0.22, 1, 0.36, 1],
  /** Diagonal y transiciones de página. */
  inOut: [0.65, 0, 0.35, 1],
  /** Estampados (con rebote). */
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
  hud: 20,
  controls: 25,
  player: 30,
  modal: 40,
  announcer: 50,
  toast: 55,
  ceremony: 60,
  gate: 70,
} as const

/** Grupos del espejo y el prefijo de su variable CSS. */
const PREFIX = {
  color: '--bb-',
  font: '--bb-font-',
  length: '--bb-',
  angle: '--bb-',
  texture: '--bb-tex-',
  logo: '--bb-logo-',
  duration: '--bb-dur-',
  ease: '--bb-ease-',
  zIndex: '--bb-z-',
  loop: '--bb-loop-',
  stagger: '--bb-stagger-',
} as const

export type TokenGroup = keyof typeof PREFIX

/** Nombre de la variable CSS de un token: `cssVarName('color', 'panelVeil')` → `--bb-panel-veil`. */
export function cssVarName(group: TokenGroup, key: string): string {
  return PREFIX[group] + toKebab(key)
}

/** `var(--bb-…)` de un token, para estilos en línea: `cssVar('length', 'cutMd')` → `var(--bb-cut-md)`. */
export function cssVar(group: TokenGroup, key: string): string {
  return `var(${cssVarName(group, key)})`
}

/** `lineStrong` → `line-strong`, `wine2` → `wine-2`, `text2` → `text-2`, `stepX` → `step-x`. */
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
