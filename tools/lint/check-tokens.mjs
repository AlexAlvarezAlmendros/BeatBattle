#!/usr/bin/env node
/**
 * Lint de tokens y de piezas prohibidas — guía v0.6 §3.1, §3.2 y §3.10 (`RD-VIS-01` y `RD-VIS-02` c):
 * ningún color, chaflán, inclinación, trazo, radio, sombra, duración o curva literal fuera de
 * `apps/web/src/styles/tokens.css`, ningún token que no exista y ninguna pieza copiada del sello.
 *
 * Recorre `apps/web/src/**\/*.{css,ts,tsx}` y falla (código de salida 1) si encuentra:
 *
 * | Regla                 | Qué prohíbe                                                                |
 * |-----------------------|----------------------------------------------------------------------------|
 * | `color-hex`           | `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`                                     |
 * | `color-function`      | `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`, |
 * |                       | `oklch()`, `color()`                                                        |
 * | `color-relative`      | Color relativo que no sea solo «el token con otro alfa por token»: canales |
 * |                       | distintos de sus palabras (`r g b`, `h s l`…) o alfa literal                |
 * | `color-named`         | Nombres de color (`white`, `red`…) en propiedades de color, dentro de      |
 * |                       | cualquier `*-gradient()` y en el canvas (`fillStyle`, `addColorStop`…)      |
 * | `duration-literal`    | Tiempos (`150ms`, `.3s`) en `transition*`, `animation*` y variables CSS    |
 * | `easing-literal`      | `cubic-bezier()`, `linear()` y `ease*` en `transition*` y `animation*`     |
 * | `radius-literal`      | En `border-radius` y sus variantes, cualquier cosa que no sea `0` o `50%`  |
 * |                       | (no hay tokens de radio: la arena usa chaflanes, §3.2 «Forma»)             |
 * | `chamfer-literal`     | Longitudes literales dentro de `clip-path: polygon(…)` (los porcentajes y  |
 * |                       | el 0 valen; los chaflanes y paralelogramos salen de `--bb-cut*`/`--bb-slant*`)|
 * | `tilt-literal`        | Ángulos literales en `rotate()`, `skew*()` y la propiedad `rotate`, salvo  |
 * |                       | 0 y múltiplos de un cuarto de vuelta (orientaciones, no inclinaciones)     |
 * | `stroke-literal`      | Anchos literales en `border*`, `outline*`, `-webkit-text-stroke*` y        |
 * |                       | `stroke-width` (salvo 0): los trazos salen de `--bb-stroke*`/`--bb-cursor-gap`|
 * | `shadow-literal`      | Cualquier cosa que no sea `var(…)` o `none` en `box-shadow`, `text-shadow` |
 * |                       | y `drop-shadow()`                                                           |
 * | `token-unknown`       | `var(--bb-…)` o `var(--nav-…)` que no declara `tokens.css` (ni el propio   |
 * |                       | fichero): tokens retirados en la v0.6 o mal escritos                        |
 * | `forbidden-component` | Importar o pintar `GlassSurface`, `MarqueeBand`, `AmbientOrbs` o la isla   |
 * |                       | `SiteHeader` (§3.1 «Lo que nunca se imita», `RD-VIS-02` c)                  |
 * | `forbidden-font`      | Montserrat o JetBrains Mono: sus paquetes `@fontsource*` o su nombre de     |
 * |                       | familia (§3.1, §3.2 «Tipografía»)                                           |
 *
 * En CSS se miran los valores de las declaraciones (los selectores como `#contenido` no cuentan); en
 * TS/TSX, el contenido de las cadenas, las propiedades de estilo en línea (`borderRadius: 8`), las
 * de color del canvas 2D (`ctx.fillStyle = …`, `gradient.addColorStop(0, …)`) y las importaciones.
 *
 * Variables locales: una variable CSS propia cuyo nombre habla de forma (`--cut`, `--slant`,
 * `--tilt`, `--skew`, `--stroke`…) no puede llevar una longitud o un ángulo literal: se mira como el
 * chaflán, la inclinación o el trazo que es (`--c: 10px` no se detecta; `--frame-cut: 10px`, sí).
 *
 * Color relativo (CSS Color 5): solo se admite para cambiar el alfa de un token, con los canales
 * como sus propias palabras y en su orden, y el alfa como `alpha`, `var(--…)` o `calc()` solo con
 * variables y `alpha`: `rgb(from var(--bb-red) r g b / var(--…))`. `color-mix()` entre tokens se
 * admite (no introduce canales literales); si una mezcla se repite, que pase a tokens.css.
 *
 * Excepciones, siempre razonadas:
 * - Ficheros: ver `EXCLUDED_FILES` (cada uno con su motivo).
 * - Excepciones temporales de la dirección «Arena»: `TEMPORARY_EXCEPTIONS`, ficheros viejos que aún
 *   usan tokens retirados o piezas prohibidas mientras se rehacen (0.23–0.26) y se retiran (0.27). Sus
 *   infracciones se cuentan aparte y no fallan; una entrada que ya no hace falta hace fallar el test
 *   del lint, así que la lista solo puede encoger.
 * - `apps/web/index.html` queda fuera del escaneo por construcción (no está en `apps/web/src`): pinta
 *   el negro de fondo antes de que cargue ningún CSS, así que no puede usar variables.
 * - Una línea concreta: comentario `lint-tokens-allow: <motivo>` en esa línea o en la anterior. Sin
 *   motivo, la propia excepción es un error (`allow-without-reason`).
 *
 * Límites conocidos:
 * - No sigue variables locales sin nombre de forma (`--c: 10px` en una pieza) ni las duraciones
 *   numéricas de Motion (`transition={{ duration: 0.3 }}`): esas salen de `@beatbattle/shared/tokens`
 *   por revisión.
 * - En TS/TSX, `color-named` mira los objetos (`{ color: 'white' }`, que suelen ser estilos en
 *   línea), los atributos de pintura de SVG (`fill`, `stroke`, `stopColor`, `floodColor`,
 *   `lightingColor`) y el canvas. No mira otros atributos JSX ni asignaciones (`<Medal color="gold">`
 *   o `const color = 'gold'` son datos, no estilos). Un objeto de datos con una clave `color` y un
 *   valor que es un nombre de color (`{ place: 1, color: 'gold' }`) da un falso positivo: se usa
 *   otra clave (`metal: 'gold'`) o `lint-tokens-allow` con su motivo.
 * - `strokeWidth` de los iconos SVG (unidades del dibujo, no trazos de la interfaz) no se mira.
 *
 * Uso: `node tools/lint/check-tokens.mjs [--root <dir>]` (por defecto, la raíz del repo).
 */
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Raíz del repo: `tools/lint/` → `../..`. */
export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Carpeta que se escanea, relativa a la raíz. */
export const SCAN_DIR = 'apps/web/src'

/** La fuente de verdad de los tokens, relativa a la raíz. */
export const TOKENS_FILE = 'apps/web/src/styles/tokens.css'

/** Extensiones que se escanean. */
export const EXTENSIONS = ['.css', '.ts', '.tsx']

/**
 * Ficheros fuera del lint, con su motivo. `test` recibe la ruta relativa a la raíz con `/`.
 * @type {ReadonlyArray<{ test: (relPath: string) => boolean, reason: string }>}
 */
export const EXCLUDED_FILES = [
  {
    test: (rel) => rel === TOKENS_FILE,
    reason: 'Es la fuente de verdad: el único sitio donde se escriben los valores.',
  },
  {
    test: (rel) => /\.test\.tsx?$/.test(rel) || rel.startsWith('apps/web/src/test/'),
    reason: 'Los tests no pintan nada: comparan contra valores calculados (p. ej. getComputedStyle).',
  },
  {
    test: (rel) => rel.endsWith('.d.ts'),
    reason: 'Declaraciones de tipos: no generan estilos.',
  },
]

/** Componentes del sello que ninguna pantalla puede usar (§3.1 «Lo que nunca se imita»). */
export const FORBIDDEN_COMPONENTS = ['GlassSurface', 'MarqueeBand', 'AmbientOrbs', 'SiteHeader']

/** Familias del sello que no se cargan ni se nombran (§3.2 «Tipografía»). */
const FORBIDDEN_FONT = /montserrat|jetbrains[\s_-]?mono/i

/**
 * Excepciones temporales de la tarea 0.22 (cambio a la dirección «Arena», guía v0.6): ficheros que
 * existían antes y que aún usan tokens retirados, radios, trazos o piezas prohibidas. **No se añaden
 * ficheros nuevos**: cada entrada desaparece cuando su pieza se rehace (0.23 marco de juego, 0.25
 * componentes, 0.26 páginas interiores) o se retira (0.27, que deja la lista vacía). El test
 * «ninguna excepción temporal sobra» falla si una entrada ya no tiene la infracción que excusa.
 *
 * `rules` son las reglas que se excusan en ese fichero; las demás se siguen aplicando.
 * @type {ReadonlyArray<{ file: string, rules: readonly string[], reason: string }>}
 */
export const TEMPORARY_EXCEPTIONS = [
  {
    file: 'apps/web/src/app/placeholder.css',
    rules: ['token-unknown'],
    reason: 'Página provisional con medidas del sello: la rehace la 0.26.',
  },
  {
    file: 'apps/web/src/features/week/hero/hero.css',
    rules: ['stroke-literal', 'token-unknown'],
    reason: 'Hero del sello (pieza prohibida, §3.1): lo sustituye el menú principal (0.24).',
  },
  {
    file: 'apps/web/src/features/week/hero/index.ts',
    rules: ['forbidden-component'],
    reason: 'Reexporta el marquee del sello: lo retira la 0.24.',
  },
  {
    file: 'apps/web/src/features/week/HomePage.tsx',
    rules: ['forbidden-component'],
    reason: 'Home con hero y marquee del sello: la rehace el menú principal (0.24).',
  },
  {
    file: 'apps/web/src/ui/Button/Button.module.css',
    rules: ['radius-literal', 'stroke-literal', 'token-unknown'],
    reason: 'Botón del sello (píldora, cristal): lo rehace la 0.25.',
  },
  {
    file: 'apps/web/src/ui/Button/Button.tsx',
    rules: ['forbidden-component'],
    reason: 'Botón con contorno de cristal: lo rehace la 0.25.',
  },
  {
    file: 'apps/web/src/ui/Card/Card.module.css',
    rules: ['radius-literal', 'stroke-literal', 'tilt-literal', 'token-unknown'],
    reason: 'Tarjeta del sello: la sustituye el marco (0.25).',
  },
  {
    file: 'apps/web/src/ui/Card/Card.tsx',
    rules: ['forbidden-component', 'token-unknown'],
    reason: 'Tarjeta de cristal: la sustituye el marco (0.25).',
  },
  {
    file: 'apps/web/src/ui/Chip/Chip.module.css',
    rules: ['radius-literal', 'stroke-literal', 'token-unknown'],
    reason: 'Chip píldora del sello: lo rehace la 0.25.',
  },
  {
    file: 'apps/web/src/ui/Countdown/Countdown.module.css',
    rules: ['token-unknown'],
    reason: 'Cuenta atrás del sello: la sustituye el reloj de ronda (0.25).',
  },
  {
    file: 'apps/web/src/ui/DataTile/DataTile.module.css',
    rules: ['radius-literal', 'stroke-literal', 'token-unknown'],
    reason: 'Tesela del sello: la rehace la 0.25.',
  },
  {
    file: 'apps/web/src/ui/EntryRow/EntryRow.module.css',
    rules: ['radius-literal', 'stroke-literal', 'token-unknown'],
    reason: 'Fila de entrada del sello: la rehace la 0.25.',
  },
  {
    file: 'apps/web/src/ui/gallery/GalleryPage.module.css',
    rules: ['radius-literal', 'stroke-literal', 'token-unknown'],
    reason: 'Estilos de las secciones viejas de la galería: se van con ellas (0.25 y 0.27).',
  },
  {
    file: 'apps/web/src/ui/GlassSurface/GlassSurface.css',
    rules: ['token-unknown'],
    reason: 'Cristal del sello (pieza prohibida, §3.1): la 0.27 lo borra.',
  },
  {
    file: 'apps/web/src/ui/GlassSurface/GlassSurface.tsx',
    rules: ['forbidden-component'],
    reason: 'Cristal del sello (pieza prohibida, §3.1): la 0.27 lo borra.',
  },
  {
    file: 'apps/web/src/ui/GlassSurface/index.ts',
    rules: ['forbidden-component'],
    reason: 'Cristal del sello (pieza prohibida, §3.1): la 0.27 lo borra.',
  },
  {
    file: 'apps/web/src/ui/Modal/Modal.module.css',
    rules: ['radius-literal', 'stroke-literal', 'token-unknown'],
    reason: 'Modal del sello: la rehace la 0.25 (ventana de juego).',
  },
  {
    file: 'apps/web/src/ui/Modal/Modal.tsx',
    rules: ['forbidden-component', 'token-unknown'],
    reason: 'Modal con superficie de cristal: la rehace la 0.25.',
  },
  {
    file: 'apps/web/src/ui/SectionLabel/SectionLabel.module.css',
    rules: ['radius-literal', 'token-unknown'],
    reason: 'Rótulo de sección del sello: lo rehace la 0.25.',
  },
  {
    file: 'apps/web/src/ui/Skeleton/Skeleton.module.css',
    rules: ['radius-literal', 'token-unknown'],
    reason: 'Esqueleto del sello: lo rehace la 0.25.',
  },
  {
    file: 'apps/web/src/ui/Toast/Toast.module.css',
    rules: ['radius-literal', 'stroke-literal', 'token-unknown'],
    reason: 'Aviso del sello: lo rehace la 0.25.',
  },
  {
    file: 'apps/web/src/ui/Toast/ToastViewport.module.css',
    rules: ['radius-literal', 'stroke-literal', 'token-unknown'],
    reason: 'Zona de avisos del sello: la rehace la 0.25.',
  },
  {
    file: 'apps/web/src/ui/Waveform/Waveform.module.css',
    rules: ['radius-literal', 'token-unknown'],
    reason: 'Onda del sello: la rehace la 0.25.',
  },
  {
    file: 'apps/web/src/ui/XpBar/XpBar.module.css',
    rules: ['radius-literal', 'token-unknown'],
    reason: 'Barra de XP del sello: la sustituye el medidor segmentado (0.25).',
  },
]

const ALLOW_DIRECTIVE = /lint-tokens-allow:?(.*?)(?:\*\/|$)/

/** Nombres de color de CSS (CSS Color 4), salvo `transparent` y `currentcolor`. */
const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet ' +
    'brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue ' +
    'darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange ' +
    'darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise ' +
    'darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia ' +
    'gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ' +
    'ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue ' +
    'lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon ' +
    'mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue ' +
    'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin ' +
    'navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen ' +
    'paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red ' +
    'rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue ' +
    'slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen'
  ).split(' '),
)

const HEX = /(?<![\w&.$-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi
const COLOR_FUNCTION = /(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi
const GRADIENT = /(?<![\w-])(?:repeating-)?(?:linear|radial|conic)-gradient\(/gi
const TIME = /(?<![\w.-])(?:\d+\.?\d*|\.\d+)m?s(?![\w-])/gi
const ZERO_TIME = /^0*\.?0*m?s$/i
const EASING = /(?<![\w-])(?:cubic-bezier\(|linear\(|ease(?:-in-out|-in|-out)?(?![\w-(]))/gi
/** Una longitud absoluta o relativa a la letra o a la ventana (sin porcentajes), con su posición. */
const LENGTH_IN_TEXT =
  /(?<![\w.#-])-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|vh|vw|vmin|vmax|svh|lvh|dvh|ch|ex|cqw|cqh|cqi|cqb)(?![\w-])/gi
/** Un ángulo literal, con su posición. */
const ANGLE_IN_TEXT = /(?<![\w.#-])(-?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)(?![\w-])/gi
/** Palabras clave globales de CSS. */
const CSS_WIDE = /^(?:inherit|initial|unset|revert|revert-layer)$/i

/** Palabras de canal de cada función de color, en orden (color relativo de CSS Color 5). */
/** @type {Record<string, string[]>} */
const CHANNELS = {
  rgb: ['r', 'g', 'b'],
  rgba: ['r', 'g', 'b'],
  hsl: ['h', 's', 'l'],
  hsla: ['h', 's', 'l'],
  hwb: ['h', 'w', 'b'],
  lab: ['l', 'a', 'b'],
  oklab: ['l', 'a', 'b'],
  lch: ['l', 'c', 'h'],
  oklch: ['l', 'c', 'h'],
}

/** Palabras de canal de `color(from … <espacio> …)` según el espacio de color. */
/** @type {Record<string, string[]>} */
const COLOR_SPACE_CHANNELS = {
  srgb: ['r', 'g', 'b'],
  'srgb-linear': ['r', 'g', 'b'],
  'display-p3': ['r', 'g', 'b'],
  'a98-rgb': ['r', 'g', 'b'],
  'prophoto-rgb': ['r', 'g', 'b'],
  rec2020: ['r', 'g', 'b'],
  xyz: ['x', 'y', 'z'],
  'xyz-d50': ['x', 'y', 'z'],
  'xyz-d65': ['x', 'y', 'z'],
}

/** Una variable sin valor de respaldo: `var(--bb-red)`. */
const PLAIN_VAR = /^var\(\s*--[\w-]+\s*\)$/i

/** Propiedades CSS cuyos valores son colores (o los contienen). */
const CSS_COLOR_PROPERTY =
  /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?|box-shadow|text-shadow|-webkit-text-stroke(?:-color)?|-webkit-text-fill-color|text-emphasis(?:-color)?|stop-color|flood-color|lighting-color|scrollbar-color)$/i
const CSS_MOTION_PROPERTY = /^(?:transition|animation)(?:-[a-z-]+)?$/i
const CSS_RADIUS_PROPERTY = /^border(?:-[a-z]+)*-radius$/i
const CSS_SHADOW_PROPERTY = /^(?:box-shadow|text-shadow)$/i
const CSS_FILTER_PROPERTY = /^(?:-webkit-)?(?:filter|backdrop-filter)$/i
const CSS_CLIP_PROPERTY = /^(?:-webkit-)?clip-path$/i
const CSS_TRANSFORM_PROPERTY = /^(?:transform|rotate)$/i
/** Propiedades de trazo: anchos de borde, contorno (y su separación) y trazos de texto y SVG. */
const CSS_STROKE_PROPERTY =
  /^(?:border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-width)?|outline(?:-width|-offset)?|-webkit-text-stroke(?:-width)?|stroke-width|column-rule(?:-width)?)$/i
/** Variables locales que hablan de forma: se miran como el chaflán, la inclinación o el trazo que son. */
const LOCAL_SHAPE_VARIABLE =
  /^--(?![\w-]*(?:color|colour|ink|fill)(?![\w]))[\w-]*?(cut|chamfer|slant|tilt|skew|rotate|stroke)/i
/** Atributos JSX de pintura de SVG: con `=` solo estos se miran como color (los demás son props). */
const SVG_PAINT_ATTRIBUTE = /^(?:fill|stroke|stopColor|floodColor|lightingColor)$/

/**
 * @typedef {{ file: string, line: number, column: number, rule: string, match: string, message: string }} Violation
 * @typedef {{ index: number, rule: string, match: string }} Hit
 * @typedef {{ knownTokens?: ReadonlySet<string> }} CheckOptions
 */

/**
 * Sustituye un rango por espacios conservando los saltos de línea, para que los desplazamientos sigan
 * apuntando a la línea y columna originales.
 * @param {string} text
 */
function blank(text) {
  return text.replace(/[^\n]/g, ' ')
}

/** @param {string} source @param {number} offset */
function position(source, offset) {
  const before = source.slice(0, offset)
  const line = before.split('\n').length
  const column = offset - before.lastIndexOf('\n')
  return { line, column }
}

/** Quita `var(...)` (con paréntesis anidados) de un valor. @param {string} value */
function stripVars(value) {
  let previous
  let current = value
  do {
    previous = current
    current = current.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, (m) => blank(m))
  } while (current !== previous)
  return current
}

/**
 * Argumentos de la función cuyo paréntesis abre en `open`, hasta su pareja. Si no se cierra (una
 * plantilla cortada por `${…}`), `undefined`.
 * @param {string} text @param {number} open
 */
function argumentsAt(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')') {
      depth -= 1
      if (depth === 0) return text.slice(open + 1, i)
    }
  }
  return undefined
}

/** Parte unos argumentos por espacios y `/` sin romper los paréntesis anidados. @param {string} args */
function splitArguments(args) {
  /** @type {string[]} */
  const parts = []
  let depth = 0
  let current = ''
  const push = () => {
    if (current) parts.push(current)
    current = ''
  }
  for (const char of args) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (depth === 0 && /\s/.test(char)) push()
    else if (depth === 0 && char === '/') {
      push()
      parts.push('/')
    } else current += char
  }
  push()
  return parts
}

/** Alfa admitido en un color relativo: `alpha`, `var(--…)` o `calc()` solo con variables y `alpha`. */
function isTokenAlpha(/** @type {string} */ alpha) {
  if (alpha.toLowerCase() === 'alpha' || PLAIN_VAR.test(alpha)) return true
  const calc = /^calc\(([\s\S]*)\)$/i.exec(alpha)
  if (!calc) return false
  const rest = calc[1]
    .replace(/var\(\s*--[\w-]+\s*\)/gi, ' ')
    .replace(/(?<![\w-])alpha(?![\w-])/gi, ' ')
    .replace(/[\s()+*/-]/g, '')
  return rest === ''
}

/**
 * ¿Es un color relativo que solo cambia el alfa de un token? `rgb(from var(--bb-red) r g b)`,
 * `oklch(from var(--bb-red) l c h / var(--…))`, `color(from var(--bb-red) srgb r g b / alpha)`.
 * @param {string} fn nombre de la función, en minúsculas
 * @param {string} args lo que hay entre sus paréntesis
 */
function isTokenRelativeColor(fn, args) {
  const parts = splitArguments(args.trim())
  if (parts.shift()?.toLowerCase() !== 'from') return false
  if (!PLAIN_VAR.test(parts.shift() ?? '')) return false
  const channels = fn === 'color' ? COLOR_SPACE_CHANNELS[parts.shift()?.toLowerCase() ?? ''] : CHANNELS[fn]
  if (!channels) return false
  for (const channel of channels) {
    if (parts.shift()?.toLowerCase() !== channel) return false
  }
  if (parts.length === 0) return true
  return parts.length === 2 && parts[0] === '/' && isTokenAlpha(parts[1])
}

/**
 * Colores literales de un texto: hex, funciones de color y colores relativos no admitidos.
 * @param {string} text
 * @returns {Hit[]}
 */
function colorLiteralHits(text) {
  /** @type {Hit[]} */
  const found = []
  for (const m of text.matchAll(HEX)) found.push({ index: m.index, rule: 'color-hex', match: m[0] })
  for (const m of text.matchAll(COLOR_FUNCTION)) {
    const open = m.index + m[0].length - 1
    const args = argumentsAt(text, open)
    const call = (args === undefined ? text.slice(m.index) : `${m[0]}${args})`).replace(/\s+/g, ' ').trim()
    if (/^\s*from(?![\w-])/i.test(args ?? text.slice(open + 1))) {
      if (args === undefined || !isTokenRelativeColor(m[1].toLowerCase(), args)) {
        found.push({ index: m.index, rule: 'color-relative', match: call })
      }
    } else {
      found.push({ index: m.index, rule: 'color-function', match: call })
    }
  }
  return found
}

/**
 * Nombres de color de un texto, fuera de `var()`.
 * @param {string} text
 * @returns {Hit[]}
 */
function namedColorHits(text) {
  const withoutVars = text.replace(/var\([^)]*\)/g, (m) => blank(m))
  /** @type {Hit[]} */
  const found = []
  for (const m of withoutVars.matchAll(/(?<![\w-])[a-z]+(?![\w-(])/gi)) {
    if (NAMED_COLORS.has(m[0].toLowerCase())) found.push({ index: m.index, rule: 'color-named', match: m[0] })
  }
  return found
}

/**
 * Nombres de color dentro de los argumentos de cualquier `*-gradient()` (en cualquier propiedad:
 * `background-image`, `mask-image`, `border-image`…).
 * @param {string} text
 */
function gradientNamedColorHits(text) {
  /** @type {Hit[]} */
  const found = []
  for (const m of text.matchAll(GRADIENT)) {
    const open = m.index + m[0].length - 1
    const args = argumentsAt(text, open) ?? text.slice(open + 1)
    for (const hit of namedColorHits(args)) found.push({ ...hit, index: open + 1 + hit.index })
  }
  return found
}

/** Quita `url(...)` y cadenas entre comillas de un valor CSS. @param {string} value */
function stripUrlsAndStrings(value) {
  return value
    .replace(/url\([^)]*\)/gi, (m) => blank(m))
    .replace(/(["'])(?:\\.|(?!\1).)*\1/g, (m) => blank(m))
}

/** ¿Es una longitud cero (`0`, `0px`, `-0.0rem`)? @param {string} token */
const isZeroLength = (token) => /^-?0*\.?0+(?:[a-z]+)?$/i.test(token)

/**
 * ¿Es una orientación (0 o múltiplo de un cuarto de vuelta) y no una inclinación?
 * @param {number} value @param {string} unit
 */
function isOrientation(value, unit) {
  if (value === 0) return true
  const quarter = { deg: 90, grad: 100, turn: 0.25 }[unit.toLowerCase()]
  if (quarter === undefined) return false
  const steps = value / quarter
  return Math.abs(steps - Math.round(steps)) < 1e-9
}

/**
 * Ángulos literales que inclinan (no orientan) dentro de un texto ya sin `var()`.
 * @param {string} text @param {number} [offset]
 * @returns {Hit[]}
 */
function tiltAngleHits(text, offset = 0) {
  /** @type {Hit[]} */
  const found = []
  for (const m of text.matchAll(ANGLE_IN_TEXT)) {
    if (!isOrientation(Number(m[1]), m[2])) {
      found.push({ index: offset + m.index, rule: 'tilt-literal', match: m[0] })
    }
  }
  return found
}

/**
 * Inclinaciones literales en un valor de `transform` (funciones `rotate*()` y `skew*()`) o de la
 * propiedad `rotate` (`whole`).
 * @param {string} value @param {boolean} whole
 */
function tiltHits(value, whole) {
  const clean = stripVars(value)
  if (whole) return tiltAngleHits(clean)
  /** @type {Hit[]} */
  const found = []
  for (const m of clean.matchAll(/(?<![\w-])(?:rotate[xyz]?|rotate3d|skew[xy]?)\(/gi)) {
    const open = m.index + m[0].length - 1
    const args = argumentsAt(clean, open) ?? clean.slice(open + 1)
    found.push(...tiltAngleHits(args, open + 1))
  }
  return found
}

/** Longitudes literales (no cero) en el texto ya sin `var()`. @param {string} text @param {string} rule */
function lengthHits(text, rule, offset = 0) {
  /** @type {Hit[]} */
  const found = []
  for (const m of text.matchAll(LENGTH_IN_TEXT)) {
    if (!isZeroLength(m[0])) found.push({ index: offset + m.index, rule, match: m[0] })
  }
  return found
}

/** Chaflanes literales: longitudes dentro de `polygon()`. @param {string} value */
function chamferHits(value) {
  const clean = stripVars(value)
  /** @type {Hit[]} */
  const found = []
  for (const m of clean.matchAll(/(?<![\w-])polygon\(/gi)) {
    const open = m.index + m[0].length - 1
    const args = argumentsAt(clean, open) ?? clean.slice(open + 1)
    found.push(...lengthHits(args, 'chamfer-literal', open + 1))
  }
  return found
}

/** Trazos literales: longitudes no cero y `thin`/`medium`/`thick`. @param {string} value */
function strokeHits(value) {
  const clean = stripVars(value)
  const found = lengthHits(clean, 'stroke-literal')
  for (const m of clean.matchAll(/(?<![\w-])(?:thin|medium|thick)(?![\w-])/gi)) {
    found.push({ index: m.index, rule: 'stroke-literal', match: m[0] })
  }
  return found
}

/**
 * Tokens que el valor nombra y que no están declarados.
 * @param {string} value @param {ReadonlySet<string> | undefined} known
 * @returns {Hit[]}
 */
function unknownTokenHits(value, known) {
  if (!known) return []
  /** @type {Hit[]} */
  const found = []
  for (const m of value.matchAll(/var\(\s*(--(?:bb|nav)-[\w-]+)/g)) {
    if (!known.has(m[1])) found.push({ index: m.index, rule: 'token-unknown', match: m[1] })
  }
  return found
}

/**
 * Comprueba un valor y devuelve las coincidencias prohibidas como `{ index, rule, match }`, con
 * `index` relativo al valor.
 * @param {string} property propiedad CSS en minúsculas (o `--custom`)
 * @param {string} value
 * @param {ReadonlySet<string>} [known] tokens declarados (sin ellos no se mira `token-unknown`)
 */
function checkCssValue(property, value, known) {
  /** @type {Hit[]} */
  const found = []
  const clean = stripUrlsAndStrings(value)
  const isCustom = property.startsWith('--')
  const isMotion = CSS_MOTION_PROPERTY.test(property)

  found.push(...colorLiteralHits(clean))
  // En una propiedad de color, cualquier nombre de color; en las demás, los de dentro de un degradado.
  found.push(...(CSS_COLOR_PROPERTY.test(property) ? namedColorHits(clean) : gradientNamedColorHits(clean)))
  found.push(...unknownTokenHits(clean, known))

  if (isMotion || isCustom) {
    for (const m of clean.matchAll(TIME)) {
      if (!ZERO_TIME.test(m[0])) found.push({ index: m.index, rule: 'duration-literal', match: m[0] })
    }
  }
  if (isMotion) {
    for (const m of clean.matchAll(EASING))
      found.push({ index: m.index, rule: 'easing-literal', match: m[0] })
  }

  if (CSS_RADIUS_PROPERTY.test(property)) {
    // Sin tokens de radio: solo 0 y 50 % (vinilos, sello de nivel y medallas), ni siquiera por variable.
    const tokens = clean.split(/[\s/,]+/).filter(Boolean)
    const literal = tokens.find((token) => !isZeroLength(token) && token !== '50%' && !CSS_WIDE.test(token))
    if (literal)
      found.push({ index: Math.max(0, clean.indexOf(literal)), rule: 'radius-literal', match: literal })
  }

  if (CSS_CLIP_PROPERTY.test(property)) found.push(...chamferHits(clean))
  if (CSS_TRANSFORM_PROPERTY.test(property)) found.push(...tiltHits(clean, property === 'rotate'))
  if (CSS_STROKE_PROPERTY.test(property)) found.push(...strokeHits(clean))

  if (isCustom) {
    const shape = LOCAL_SHAPE_VARIABLE.exec(property)?.[1]?.toLowerCase()
    if (shape === 'cut' || shape === 'chamfer' || shape === 'slant') {
      found.push(...lengthHits(stripVars(clean), 'chamfer-literal'), ...chamferHits(clean))
    } else if (shape === 'tilt' || shape === 'skew' || shape === 'rotate') {
      found.push(...tiltAngleHits(stripVars(clean)))
    } else if (shape === 'stroke') {
      found.push(...strokeHits(clean))
    }
    // Una variable local que guarda un `transform` o un `polygon()` también se mira.
    if (shape !== 'tilt' && shape !== 'skew' && shape !== 'rotate') found.push(...tiltHits(clean, false))
    if (shape !== 'cut' && shape !== 'chamfer' && shape !== 'slant') found.push(...chamferHits(clean))
  }

  if (CSS_SHADOW_PROPERTY.test(property)) {
    const rest = stripVars(clean)
      .replace(/(?<![\w-])(?:none|inset|inherit|initial|unset|revert|revert-layer)(?![\w-])/gi, ' ')
      .replace(/[\s,]+/g, '')
    if (rest) found.push({ index: 0, rule: 'shadow-literal', match: value.trim() })
  }
  if (CSS_FILTER_PROPERTY.test(property)) {
    for (const m of clean.matchAll(/drop-shadow\((?!\s*var\([^)]*\)\s*\))/gi)) {
      found.push({ index: m.index, rule: 'shadow-literal', match: m[0] })
    }
  }
  return found
}

/**
 * Variables `--bb-…`/`--nav-…` que declara un fichero (para que `token-unknown` no se queje de una
 * variable local con ese prefijo, como el ángulo de una pieza).
 * @param {string} code
 */
function declaredTokens(code) {
  const names = new Set()
  for (const m of code.matchAll(/(?<![\w-])(--(?:bb|nav)-[\w-]+)\s*['"]?\s*[:,]/g)) names.add(m[1])
  for (const m of code.matchAll(/@property\s+(--[\w-]+)/g)) names.add(m[1])
  return names
}

/** Une los tokens conocidos con los que declara el fichero. @param {CheckOptions} options @param {string} code */
function knownFor(options, code) {
  if (!options.knownTokens) return undefined
  const local = declaredTokens(code)
  if (local.size === 0) return options.knownTokens
  return new Set([...options.knownTokens, ...local])
}

/**
 * Lint de un fichero CSS.
 * @param {string} source
 * @param {CheckOptions} options
 * @returns {{ offset: number, rule: string, match: string }[]}
 */
function scanCss(source, options) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, (m) => blank(m))
  const known = knownFor(options, code)
  /** @type {{ offset: number, rule: string, match: string }[]} */
  const found = []
  // Declaración: `propiedad: valor` terminada en `;` o `}`. Si termina en `{` era un selector
  // (`a:hover {`, `@media (x: y) {`) y no cuenta.
  const declaration = /([-\w]+)\s*:\s*([^;{}]*)(?=[;}{]|$)/g
  for (const m of code.matchAll(declaration)) {
    const end = m.index + m[0].length
    if (code[end] === '{') continue
    const property = m[1].toLowerCase()
    const valueOffset = m.index + m[0].indexOf(m[2], m[1].length)
    for (const hit of checkCssValue(property, m[2], known)) {
      found.push({ offset: valueOffset + hit.index, rule: hit.rule, match: hit.match })
    }
  }
  // Fuentes del sello en cualquier sitio fuera de los comentarios: `@import`, `url()`, `font-family`…
  for (const m of code.matchAll(new RegExp(FORBIDDEN_FONT.source, 'gi'))) {
    found.push({ offset: m.index, rule: 'forbidden-font', match: m[0] })
  }
  return found
}

/**
 * Separa un fuente TS/TSX en código (con comentarios en blanco) y la lista de cadenas literales.
 * Es un analizador léxico mínimo: entiende comentarios, comillas simples y dobles y plantillas con
 * `${…}` anidados. No distingue expresiones regulares, que en código de UI apenas aparecen.
 * @param {string} source
 */
function lexTs(source) {
  let code = ''
  /** @type {{ start: number, text: string }[]} */
  const strings = []
  /** @type {('code' | 'template')[]} */
  const stack = ['code']
  /** @type {number[]} profundidad de llaves dentro de cada `${` abierto */
  const braceDepth = []
  let i = 0
  let stringStart = -1
  /** @type {string | null} */
  let quote = null

  while (i < source.length) {
    const char = source[i]
    const next = source[i + 1]
    const mode = stack[stack.length - 1]

    if (quote) {
      if (char === '\\') {
        code += source.slice(i, i + 2)
        i += 2
        continue
      }
      if (char === quote || char === '\n') {
        strings.push({ start: stringStart, text: source.slice(stringStart, i) })
        quote = null
      }
      code += char
      i += 1
      continue
    }

    if (mode === 'template') {
      if (char === '\\') {
        code += source.slice(i, i + 2)
        i += 2
        continue
      }
      if (char === '`') {
        strings.push({ start: stringStart, text: source.slice(stringStart, i) })
        stack.pop()
        code += char
        i += 1
        continue
      }
      if (char === '$' && next === '{') {
        strings.push({ start: stringStart, text: source.slice(stringStart, i) })
        stack.push('code')
        braceDepth.push(0)
        code += '${'
        i += 2
        continue
      }
      code += char
      i += 1
      continue
    }

    // Modo código.
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      code += blank(source.slice(i, stop))
      i = stop
      continue
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      code += blank(source.slice(i, stop))
      i = stop
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      stringStart = i + 1
      code += char
      i += 1
      continue
    }
    if (char === '`') {
      stack.push('template')
      stringStart = i + 1
      code += char
      i += 1
      continue
    }
    if (braceDepth.length > 0) {
      if (char === '{') braceDepth[braceDepth.length - 1] += 1
      if (char === '}') {
        if (braceDepth[braceDepth.length - 1] === 0) {
          braceDepth.pop()
          stack.pop()
          stringStart = i + 1
          code += char
          i += 1
          continue
        }
        braceDepth[braceDepth.length - 1] -= 1
      }
    }
    code += char
    i += 1
  }
  return { code, strings }
}

/** Propiedades de estilo en línea (camelCase) → propiedad CSS equivalente. @param {string} key */
function cssPropertyFromJs(key) {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^(webkit|moz|ms)-/, '-$1-')
}

/** ¿Una ruta de módulo apunta a una pieza prohibida? Devuelve su nombre. @param {string} specifier */
function forbiddenModule(specifier) {
  const segments = specifier.split('/').map((segment) => segment.replace(/\.(?:tsx?|jsx?|css)$/, ''))
  return FORBIDDEN_COMPONENTS.find((name) => segments.includes(name))
}

/**
 * Importaciones, reexportaciones y usos JSX de piezas prohibidas.
 * @param {string} code fuente con los comentarios en blanco (las cadenas se conservan)
 * @returns {{ offset: number, rule: string, match: string }[]}
 */
function forbiddenComponentHits(code) {
  /** @type {{ offset: number, rule: string, match: string }[]} */
  const found = []
  const names = new RegExp(`(?<![\\w$])(${FORBIDDEN_COMPONENTS.join('|')})(?![\\w$])`, 'g')
  // `import X, { A, B as C } from '…'` y `export { A } from '…'`, `export * from '…'`.
  const fromClause = /\b(import|export)\s+(?:type\s+)?([\s\S]*?)\s*\bfrom\s*(['"])([^'"\n]+)\3/g
  for (const m of code.matchAll(fromClause)) {
    const [, , clause, , specifier] = m
    if (/[;=]|\bfunction\b|\bconst\b/.test(clause)) continue
    const viaPath = forbiddenModule(specifier)
    const clauseStart = m.index + m[0].indexOf(clause)
    let flagged = false
    for (const n of clause.matchAll(names)) {
      found.push({ offset: clauseStart + n.index, rule: 'forbidden-component', match: n[1] })
      flagged = true
    }
    if (viaPath && !flagged) {
      found.push({
        offset: m.index + m[0].lastIndexOf(specifier),
        rule: 'forbidden-component',
        match: specifier,
      })
    }
  }
  // `import('…')` e `import '…'`.
  for (const m of code.matchAll(/\bimport\s*(?:\(\s*)?(['"])([^'"\n]+)\1/g)) {
    if (forbiddenModule(m[2])) {
      found.push({ offset: m.index + m[0].lastIndexOf(m[2]), rule: 'forbidden-component', match: m[2] })
    }
  }
  // `<GlassSurface …>` en JSX.
  for (const m of code.matchAll(new RegExp(`<(${FORBIDDEN_COMPONENTS.join('|')})(?![\\w$])`, 'g'))) {
    found.push({ offset: m.index + 1, rule: 'forbidden-component', match: m[1] })
  }
  // Una misma pieza puede salir por dos caminos en el mismo sitio.
  const seen = new Set()
  return found.filter((hit) => {
    const key = `${hit.offset}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Lint de un fichero TS/TSX.
 * @param {string} source
 * @param {CheckOptions} options
 * @returns {{ offset: number, rule: string, match: string }[]}
 */
function scanTs(source, options) {
  const { code, strings } = lexTs(source)
  const known = knownFor(options, code)
  /** @type {{ offset: number, rule: string, match: string }[]} */
  const found = []
  /** Una misma coincidencia puede salir por dos caminos (la cadena y la propiedad): se cuenta una vez. */
  const seen = new Set()
  /** @param {number} offset @param {Hit[]} hits */
  const add = (offset, hits) => {
    for (const hit of hits) {
      const key = `${offset + hit.index}:${hit.rule}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ offset: offset + hit.index, rule: hit.rule, match: hit.match })
    }
  }

  // En cualquier cadena: colores literales (`'#fff'`, `"rgba(…)"`, `` `hsl(…)` ``), nombres de color
  // dentro de un degradado (`'linear-gradient(white, …)'`), tokens desconocidos y fuentes del sello.
  for (const { start, text } of strings) {
    add(start, colorLiteralHits(text))
    add(start, gradientNamedColorHits(text))
    add(start, unknownTokenHits(text, known))
    for (const m of text.matchAll(new RegExp(FORBIDDEN_FONT.source, 'gi'))) {
      add(start, [{ index: m.index, rule: 'forbidden-font', match: m[0] }])
    }
  }

  // Propiedades de estilo en línea con un valor de cadena: `transition: 'opacity 200ms'`,
  // `color: 'white'`, `boxShadow: '0 0 4px …'`, `fill="white"`, `transform: 'rotate(-7deg)'`.
  const styleString = /(?<![\w$.-])([a-zA-Z]+)\s*([:=])\s*\{?\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3/g
  for (const m of code.matchAll(styleString)) {
    const [, key, operator, , rawValue] = m
    const property = cssPropertyFromJs(key)
    const valueOffset = m.index + m[0].length - rawValue.length - 1
    const value = source.slice(valueOffset, valueOffset + rawValue.length)
    // Con `=` (atributo JSX o asignación) solo los atributos de pintura de SVG son estilos: `color`
    // en `<Medal color="gold" />`, `stroke-width` de un icono o `const color = 'gold'` son datos.
    const dataOnly = operator === '=' && !SVG_PAINT_ATTRIBUTE.test(key)
    add(
      valueOffset,
      checkCssValue(property, value, known).filter(
        (hit) => !(dataOnly && (hit.rule === 'color-named' || hit.rule === 'stroke-literal')),
      ),
    )
  }

  // Variables locales en estilos en línea: `{ '--frame-cut': '10px' }`.
  const customString = /(['"])(--[\w-]+)\1\s*:\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3/g
  for (const m of code.matchAll(customString)) {
    const valueOffset = m.index + m[0].length - m[4].length - 1
    add(valueOffset, checkCssValue(m[2], source.slice(valueOffset, valueOffset + m[4].length), known))
  }

  // Canvas 2D: `ctx.fillStyle = 'red'`, `ctx.shadowColor = 'black'`, `gradient.addColorStop(0, 'gold')`.
  const canvasColor =
    /\.(?:(?:fillStyle|strokeStyle|shadowColor)\s*=|addColorStop\s*\([^,()]*,)\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  for (const m of code.matchAll(canvasColor)) {
    const valueOffset = m.index + m[0].length - m[2].length - 1
    add(valueOffset, namedColorHits(source.slice(valueOffset, valueOffset + m[2].length)))
  }

  // Radios numéricos en estilos en línea: `borderRadius: 8` (React lo lee como px).
  const numericRadius = /(?<![\w$.-])(border(?:[A-Z][a-z]+)*Radius)\s*:\s*(-?\d+\.?\d*)/g
  for (const m of code.matchAll(numericRadius)) {
    if (Number(m[2]) !== 0) {
      found.push({ offset: m.index + m[0].length - m[2].length, rule: 'radius-literal', match: m[2] })
    }
  }
  // Trazos numéricos en estilos en línea: `borderWidth: 2`, `outlineOffset: 4`.
  const numericStroke =
    /(?<![\w$.-])((?:border(?:Top|Right|Bottom|Left|Block|Inline)?(?:Start|End)?Width)|outlineWidth|outlineOffset)\s*:\s*(-?\d+\.?\d*)/g
  for (const m of code.matchAll(numericStroke)) {
    if (Number(m[2]) !== 0) {
      found.push({ offset: m.index + m[0].length - m[2].length, rule: 'stroke-literal', match: m[2] })
    }
  }

  for (const hit of forbiddenComponentHits(code)) {
    const key = `${hit.offset}:${hit.rule}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push(hit)
  }
  return found
}

/**
 * Comprueba el contenido de un fichero y devuelve sus infracciones.
 * @param {string} relPath ruta relativa a la raíz (decide si es CSS o TS)
 * @param {string} source
 * @param {CheckOptions} [options] `knownTokens`: los tokens declarados en tokens.css (sin ellos no se
 *   mira `token-unknown`)
 * @returns {Violation[]}
 */
export function checkSource(relPath, source, options = {}) {
  const raw = relPath.endsWith('.css') ? scanCss(source, options) : scanTs(source, options)
  const lines = source.split('\n')
  /** @type {Violation[]} */
  const violations = []

  // Directivas de excepción sin motivo: son un error en sí mismas.
  lines.forEach((text, index) => {
    const directive = ALLOW_DIRECTIVE.exec(text)
    if (directive && directive[1].replace(/[*/\s]/g, '').length < 3) {
      violations.push({
        file: relPath,
        line: index + 1,
        column: text.indexOf('lint-tokens-allow') + 1,
        rule: 'allow-without-reason',
        match: text.trim(),
        message: 'Toda excepción lleva su motivo: `lint-tokens-allow: <motivo>`.',
      })
    }
  })

  for (const hit of raw) {
    const { line, column } = position(source, hit.offset)
    const allowed = [lines[line - 1], lines[line - 2]].some(
      (text) => text !== undefined && ALLOW_DIRECTIVE.test(text),
    )
    if (allowed) continue
    violations.push({
      file: relPath,
      line,
      column,
      rule: hit.rule,
      match: hit.match,
      message: MESSAGES[hit.rule],
    })
  }
  return violations.sort((a, b) => a.line - b.line || a.column - b.column)
}

/**
 * Nombres de las variables que declara `tokens.css` (en cualquier bloque) y las registradas con
 * `@property`.
 * @param {string} css
 */
export function parseTokenNames(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const names = new Set()
  for (const m of code.matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)) names.add(m[1])
  for (const m of code.matchAll(/@property\s+(--[\w-]+)/g)) names.add(m[1])
  return names
}

/** @type {Record<string, string>} */
const MESSAGES = {
  'color-hex': 'Color literal: usa un token de color (`var(--bb-…)` o `color` de @beatbattle/shared/tokens).',
  'color-function':
    'Color literal: usa un token de color (`var(--bb-…)` o `color` de @beatbattle/shared/tokens).',
  'color-relative':
    'Color relativo con canales o alfa literales: solo `rgb(from var(--bb-…) r g b / var(--…))`; si hace falta un color o un velo nuevo, va a tokens.css.',
  'color-named':
    'Color con nombre: usa un token de color (`var(--bb-…)` o `color` de @beatbattle/shared/tokens).',
  'duration-literal': 'Duración literal: usa `var(--bb-dur-…)` (o `duration` de @beatbattle/shared/tokens).',
  'easing-literal': 'Curva literal: usa `var(--bb-ease-…)` (o `ease` de @beatbattle/shared/tokens).',
  'radius-literal':
    'Radio: la arena no tiene radios (§3.2 «Forma»). Solo `0`, o `50%` para vinilos, sello de nivel y medallas; las esquinas son chaflanes (`--bb-cut*`).',
  'chamfer-literal':
    'Chaflán o paralelogramo literal: usa `var(--bb-cut-…)`, `var(--bb-slant…)` o un `calc()` sobre ellos y los trazos.',
  'tilt-literal':
    'Inclinación literal: usa `var(--bb-tilt-…)` o `var(--bb-split-angle)` (0 y los cuartos de vuelta valen).',
  'stroke-literal': 'Trazo literal: usa `var(--bb-stroke…)` o `var(--bb-cursor-gap)` (§3.2 «Trazos»).',
  'shadow-literal': 'Sombra literal: usa `var(--bb-shadow-…)` o `var(--bb-focus-halo)`.',
  'token-unknown':
    'Token desconocido: no está en tokens.css (¿un token del sello retirado en la v0.6?, guía §3.2).',
  'forbidden-component':
    'Pieza prohibida (§3.1 «Lo que nunca se imita», RD-VIS-02 c): la arena usa el HUD, la barra de controles y marcos propios.',
  'forbidden-font':
    'Fuente del sello prohibida (§3.2): la arena usa Anybody, Chakra Petch y Oxanium (`var(--bb-font-…)`).',
}

/** @param {string} dir @returns {AsyncGenerator<string>} */
async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (EXTENSIONS.includes(path.extname(entry.name))) yield full
  }
}

/** Tokens declarados en el `tokens.css` de `root` (o `undefined` si no existe). @param {string} root */
async function readKnownTokens(root) {
  const file = path.join(root, TOKENS_FILE)
  try {
    await access(file)
  } catch {
    return undefined
  }
  return parseTokenNames(await readFile(file, 'utf8'))
}

/**
 * Separa las infracciones excusadas por `TEMPORARY_EXCEPTIONS` de las que fallan.
 * @param {Violation[]} violations
 * @param {ReadonlyArray<{ file: string, rules: readonly string[] }>} [exceptions]
 */
export function applyTemporaryExceptions(violations, exceptions = TEMPORARY_EXCEPTIONS) {
  /** @type {Violation[]} */
  const failing = []
  /** @type {Violation[]} */
  const deferred = []
  for (const v of violations) {
    const excused = exceptions.some((e) => e.file === v.file && e.rules.includes(v.rule))
    ;(excused ? deferred : failing).push(v)
  }
  return { failing, deferred }
}

/**
 * Escanea `SCAN_DIR` bajo `root`.
 * @param {{ root?: string, exceptions?: ReadonlyArray<{ file: string, rules: readonly string[] }> }} [options]
 * @returns {Promise<{ files: string[], skipped: string[], violations: Violation[], deferred: Violation[], all: Violation[] }>}
 */
export async function checkTokens({ root = DEFAULT_ROOT, exceptions = TEMPORARY_EXCEPTIONS } = {}) {
  /** @type {string[]} */
  const files = []
  /** @type {string[]} */
  const skipped = []
  /** @type {Violation[]} */
  const all = []
  const knownTokens = await readKnownTokens(root)
  for await (const full of walk(path.join(root, SCAN_DIR))) {
    const rel = path.relative(root, full).split(path.sep).join('/')
    if (EXCLUDED_FILES.some((rule) => rule.test(rel))) {
      skipped.push(rel)
      continue
    }
    files.push(rel)
    all.push(...checkSource(rel, await readFile(full, 'utf8'), { knownTokens }))
  }
  const { failing, deferred } = applyTemporaryExceptions(all, exceptions)
  return { files, skipped, violations: failing, deferred, all }
}

/** @param {Violation} v */
export function formatViolation(v) {
  return `${v.file}:${v.line}:${v.column}  ${v.rule}  ${v.match}\n    ${v.message}`
}

async function main() {
  const args = process.argv.slice(2)
  const rootFlag = args.indexOf('--root')
  const root = rootFlag === -1 ? DEFAULT_ROOT : path.resolve(args[rootFlag + 1] ?? '.')
  const { files, violations, deferred, all } = await checkTokens({ root })

  // `--list-temporary`: qué reglas fallan en cada fichero (para revisar `TEMPORARY_EXCEPTIONS`).
  if (args.includes('--list-temporary')) {
    /** @type {Map<string, Set<string>>} */
    const byFile = new Map()
    for (const v of all) {
      if (!byFile.has(v.file)) byFile.set(v.file, new Set())
      byFile.get(v.file)?.add(v.rule)
    }
    for (const [file, rules] of byFile) console.log(JSON.stringify({ file, rules: [...rules].sort() }))
    return
  }

  if (deferred.length > 0) {
    const pending = new Set(deferred.map((v) => v.file)).size
    console.log(
      `lint:tokens — ${deferred.length} infracción(es) excusada(s) en ${pending} fichero(s) de la lista de excepciones temporales (la vacía la 0.27).`,
    )
  }
  if (violations.length > 0) {
    for (const v of violations) console.error(formatViolation(v))
    console.error(
      `\nlint:tokens — ${violations.length} infracción(es) en ${files.length} ficheros (RD-VIS-01, RD-VIS-02 c).`,
    )
    process.exitCode = 1
    return
  }
  console.log(
    `lint:tokens — ${files.length} ficheros sin valores literales, tokens desconocidos ni piezas prohibidas.`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
