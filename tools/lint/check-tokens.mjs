#!/usr/bin/env node
/**
 * Lint de tokens — guía §3.2 y §3.10 (`RD-VIS-01`): ningún color, radio, sombra o duración literal
 * fuera de `apps/web/src/styles/tokens.css`.
 *
 * Recorre `apps/web/src/**\/*.{css,ts,tsx}` y falla (código de salida 1) si encuentra:
 *
 * | Regla              | Qué prohíbe                                                                  |
 * |--------------------|------------------------------------------------------------------------------|
 * | `color-hex`        | `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`                                       |
 * | `color-function`   | `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`,  |
 * |                    | `oklch()`, `color()`; se permite el color relativo `rgb(from var(--…) …)`    |
 * | `color-named`      | Nombres de color (`white`, `red`…) en propiedades de color                   |
 * | `duration-literal` | Tiempos (`150ms`, `.3s`) en `transition*`, `animation*` y variables CSS      |
 * | `easing-literal`   | `cubic-bezier()`, `linear()` y `ease*` en `transition*` y `animation*`       |
 * | `radius-literal`   | Longitudes en `border-radius` y sus variantes, salvo `0` y `50%`             |
 * | `shadow-literal`   | Cualquier cosa que no sea `var(…)` o `none` en `box-shadow`, `text-shadow`   |
 * |                    | y `drop-shadow()`                                                             |
 *
 * En CSS se miran los valores de las declaraciones (los selectores como `#contenido` no cuentan); en
 * TS/TSX, el contenido de las cadenas y las propiedades de estilo en línea (`borderRadius: 8`).
 *
 * Excepciones, siempre razonadas:
 * - Ficheros: ver `EXCLUDED_FILES` (cada uno con su motivo).
 * - `apps/web/index.html` queda fuera del escaneo por construcción (no está en `apps/web/src`): pinta
 *   el negro de fondo antes de que cargue ningún CSS, así que no puede usar variables.
 * - Una línea concreta: comentario `lint-tokens-allow: <motivo>` en esa línea o en la anterior. Sin
 *   motivo, la propia excepción es un error (`allow-without-reason`).
 *
 * Límites conocidos: no sigue variables locales (`--r: 8px` fuera de tokens.css sí se detecta como
 * duración o color, pero no como radio) ni las duraciones numéricas de Motion
 * (`transition={{ duration: 0.3 }}`): esas salen de `@beatbattle/shared/tokens` por revisión.
 *
 * Uso: `node tools/lint/check-tokens.mjs [--root <dir>]` (por defecto, la raíz del repo).
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Raíz del repo: `tools/lint/` → `../..`. */
export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Carpeta que se escanea, relativa a la raíz. */
export const SCAN_DIR = 'apps/web/src'

/** Extensiones que se escanean. */
export const EXTENSIONS = ['.css', '.ts', '.tsx']

/**
 * Ficheros fuera del lint, con su motivo. `test` recibe la ruta relativa a la raíz con `/`.
 * @type {ReadonlyArray<{ test: (relPath: string) => boolean, reason: string }>}
 */
export const EXCLUDED_FILES = [
  {
    test: (rel) => rel === 'apps/web/src/styles/tokens.css',
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
const COLOR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?!\s*from\s+var\()/gi
const TIME = /(?<![\w.-])(?:\d+\.?\d*|\.\d+)m?s(?![\w-])/gi
const ZERO_TIME = /^0*\.?0*m?s$/i
const EASING = /(?<![\w-])(?:cubic-bezier\(|linear\(|ease(?:-in-out|-in|-out)?(?![\w-(]))/gi
const LENGTH = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%|vh|vw|vmin|vmax|svh|lvh|dvh|ch|ex|cqw|cqh|cqi|cqb)$/i

/** Propiedades CSS cuyos valores son colores (o los contienen). */
const CSS_COLOR_PROPERTY =
  /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?|box-shadow|text-shadow|-webkit-text-stroke(?:-color)?|-webkit-text-fill-color|text-emphasis(?:-color)?|stop-color|flood-color|lighting-color|scrollbar-color)$/i
const CSS_MOTION_PROPERTY = /^(?:transition|animation)(?:-[a-z-]+)?$/i
const CSS_RADIUS_PROPERTY = /^border(?:-[a-z]+)*-radius$/i
const CSS_SHADOW_PROPERTY = /^(?:box-shadow|text-shadow)$/i
const CSS_FILTER_PROPERTY = /^(?:-webkit-)?(?:filter|backdrop-filter)$/i

/**
 * @typedef {{ file: string, line: number, column: number, rule: string, match: string, message: string }} Violation
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
    current = current.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' ')
  } while (current !== previous)
  return current
}

/** Quita `url(...)` y cadenas entre comillas de un valor CSS. @param {string} value */
function stripUrlsAndStrings(value) {
  return value
    .replace(/url\([^)]*\)/gi, (m) => blank(m))
    .replace(/(["'])(?:\\.|(?!\1).)*\1/g, (m) => blank(m))
}

/**
 * Comprueba un valor y devuelve las coincidencias prohibidas como `{ index, rule, match }`, con
 * `index` relativo al valor.
 * @param {string} property propiedad CSS en minúsculas (o `--custom`)
 * @param {string} value
 */
function checkCssValue(property, value) {
  /** @type {{ index: number, rule: string, match: string }[]} */
  const found = []
  const clean = stripUrlsAndStrings(value)
  const isCustom = property.startsWith('--')
  const isMotion = CSS_MOTION_PROPERTY.test(property)

  for (const m of clean.matchAll(HEX)) found.push({ index: m.index, rule: 'color-hex', match: m[0] })
  for (const m of clean.matchAll(COLOR_FUNCTION))
    found.push({ index: m.index, rule: 'color-function', match: m[0] })

  if (CSS_COLOR_PROPERTY.test(property)) {
    const withoutVars = clean.replace(/var\([^)]*\)/g, (m) => blank(m))
    for (const m of withoutVars.matchAll(/(?<![\w-])[a-z]+(?![\w-(])/gi)) {
      if (NAMED_COLORS.has(m[0].toLowerCase()))
        found.push({ index: m.index, rule: 'color-named', match: m[0] })
    }
  }

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
    const tokens = stripVars(clean)
      .split(/[\s/,()*+]+/)
      .filter(Boolean)
    const literal = tokens.find(
      (token) => LENGTH.test(token) && !/^-?0+(?:\.0+)?(?:px)?$/.test(token) && token !== '50%',
    )
    if (literal)
      found.push({ index: Math.max(0, clean.indexOf(literal)), rule: 'radius-literal', match: literal })
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
 * Lint de un fichero CSS.
 * @param {string} source
 * @returns {{ offset: number, rule: string, match: string }[]}
 */
function scanCss(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, (m) => blank(m))
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
    for (const hit of checkCssValue(property, m[2])) {
      found.push({ offset: valueOffset + hit.index, rule: hit.rule, match: hit.match })
    }
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

/**
 * Lint de un fichero TS/TSX.
 * @param {string} source
 * @returns {{ offset: number, rule: string, match: string }[]}
 */
function scanTs(source) {
  const { code, strings } = lexTs(source)
  /** @type {{ offset: number, rule: string, match: string }[]} */
  const found = []

  // Colores literales en cualquier cadena: `'#fff'`, `"rgba(…)"`, `` `hsl(…)` ``.
  for (const { start, text } of strings) {
    for (const m of text.matchAll(HEX))
      found.push({ offset: start + m.index, rule: 'color-hex', match: m[0] })
    for (const m of text.matchAll(COLOR_FUNCTION)) {
      found.push({ offset: start + m.index, rule: 'color-function', match: m[0] })
    }
  }

  // Propiedades de estilo en línea con un valor de cadena: `transition: 'opacity 200ms'`,
  // `color: 'white'`, `boxShadow: '0 0 4px …'`, `fill="white"`.
  const styleString = /(?<![\w$.-])([a-zA-Z]+)\s*[:=]\s*\{?\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g
  for (const m of code.matchAll(styleString)) {
    const property = cssPropertyFromJs(m[1])
    const valueOffset = m.index + m[0].length - m[3].length - 1
    const value = source.slice(valueOffset, valueOffset + m[3].length)
    for (const hit of checkCssValue(property, value)) {
      if (hit.rule === 'color-hex' || hit.rule === 'color-function') continue // ya contadas arriba
      found.push({ offset: valueOffset + hit.index, rule: hit.rule, match: hit.match })
    }
  }

  // Radios numéricos en estilos en línea: `borderRadius: 8` (React lo lee como px).
  const numericRadius = /(?<![\w$.-])(border(?:[A-Z][a-z]+)*Radius)\s*:\s*(-?\d+\.?\d*)/g
  for (const m of code.matchAll(numericRadius)) {
    if (Number(m[2]) !== 0) {
      found.push({ offset: m.index + m[0].length - m[2].length, rule: 'radius-literal', match: m[2] })
    }
  }
  return found
}

/**
 * Comprueba el contenido de un fichero y devuelve sus infracciones.
 * @param {string} relPath ruta relativa a la raíz (decide si es CSS o TS)
 * @param {string} source
 * @returns {Violation[]}
 */
export function checkSource(relPath, source) {
  const raw = relPath.endsWith('.css') ? scanCss(source) : scanTs(source)
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

/** @type {Record<string, string>} */
const MESSAGES = {
  'color-hex': 'Color literal: usa un token de color (`var(--bb-…)` o `color` de @beatbattle/shared/tokens).',
  'color-function':
    'Color literal: usa un token de color (`var(--bb-…)` o `color` de @beatbattle/shared/tokens).',
  'color-named': 'Color con nombre: usa un token de color (`var(--bb-…)`).',
  'duration-literal': 'Duración literal: usa `var(--bb-dur-…)` (o `duration` de @beatbattle/shared/tokens).',
  'easing-literal': 'Curva literal: usa `var(--bb-ease-…)` (o `ease` de @beatbattle/shared/tokens).',
  'radius-literal': 'Radio literal: usa `var(--bb-radius-…)` (se permiten 0 y 50 %).',
  'shadow-literal': 'Sombra literal: usa `var(--bb-shadow-…)` u otro token de sombra.',
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

/**
 * Escanea `SCAN_DIR` bajo `root`.
 * @param {{ root?: string }} [options]
 * @returns {Promise<{ files: string[], skipped: string[], violations: Violation[] }>}
 */
export async function checkTokens({ root = DEFAULT_ROOT } = {}) {
  /** @type {string[]} */
  const files = []
  /** @type {string[]} */
  const skipped = []
  /** @type {Violation[]} */
  const violations = []
  for await (const full of walk(path.join(root, SCAN_DIR))) {
    const rel = path.relative(root, full).split(path.sep).join('/')
    if (EXCLUDED_FILES.some((rule) => rule.test(rel))) {
      skipped.push(rel)
      continue
    }
    files.push(rel)
    violations.push(...checkSource(rel, await readFile(full, 'utf8')))
  }
  return { files, skipped, violations }
}

/** @param {Violation} v */
export function formatViolation(v) {
  return `${v.file}:${v.line}:${v.column}  ${v.rule}  ${v.match}\n    ${v.message}`
}

async function main() {
  const args = process.argv.slice(2)
  const rootFlag = args.indexOf('--root')
  const root = rootFlag === -1 ? DEFAULT_ROOT : path.resolve(args[rootFlag + 1] ?? '.')
  const { files, violations } = await checkTokens({ root })
  if (violations.length > 0) {
    for (const v of violations) console.error(formatViolation(v))
    console.error(
      `\nlint:tokens — ${violations.length} valor(es) literal(es) fuera de los tokens en ${files.length} ficheros (RD-VIS-01).`,
    )
    process.exitCode = 1
    return
  }
  console.log(`lint:tokens — ${files.length} ficheros sin valores literales fuera de los tokens.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
