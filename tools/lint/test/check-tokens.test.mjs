import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  applyTemporaryExceptions,
  checkSource,
  checkTokens,
  DEFAULT_ROOT,
  FORBIDDEN_COMPONENTS,
  parseTokenNames,
  TEMPORARY_EXCEPTIONS,
  TOKENS_FILE,
} from '../check-tokens.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
/** @param {string} name */
const fixture = (name) => path.join(here, 'fixtures', name)
const script = path.join(here, '..', 'check-tokens.mjs')

/** Reglas que salen al comprobar un fragmento. @param {string} file @param {string} source */
const rulesIn = (file, source) => checkSource(file, source).map((v) => v.rule)
/** @param {string} body una declaración CSS */
const css = (body) => rulesIn('apps/web/src/x.css', `.x {\n  ${body}\n}\n`)
/** @param {string} source */
const tsx = (source) => rulesIn('apps/web/src/X.tsx', source)

describe('RD-VIS-01: check-tokens en CSS', () => {
  const failing = [
    ['color: #fff;', 'color-hex'],
    ['color: #FF003C;', 'color-hex'],
    ['background: #2b2b2bce;', 'color-hex'],
    ['background: rgba(0, 0, 0, 0.5);', 'color-function'],
    ['color: rgb(255 0 60);', 'color-function'],
    ['color: hsl(0 100% 50%);', 'color-function'],
    ['color: hsla(0, 100%, 50%, 0.5);', 'color-function'],
    ['color: oklch(60% 0.2 20);', 'color-function'],
    ['border: 1px solid white;', 'color-named'],
    ['outline-color: red;', 'color-named'],
    ['background-image: linear-gradient(white, var(--bb-black));', 'color-named'],
    ['mask-image: linear-gradient(black, transparent);', 'color-named'],
    ['border-image: linear-gradient(red, var(--bb-red)) 1;', 'color-named'],
    ['background-image: repeating-radial-gradient(circle, var(--bb-red), gold 10%);', 'color-named'],
    // Color relativo: los canales y el alfa no pueden ser literales (fabricarían un color nuevo).
    ['color: rgb(from var(--bb-black) 255 0 0);', 'color-relative'],
    ['color: hsl(from var(--bb-red) 120 100% 50%);', 'color-relative'],
    ['color: rgb(from var(--bb-red) b g r);', 'color-relative'],
    ['color: oklch(from var(--bb-red) calc(l - 10%) c h);', 'color-relative'],
    ['border-color: rgb(from var(--bb-red) r g b / 50%);', 'color-relative'],
    ['border-color: rgb(from var(--bb-red) r g b / calc(alpha * 0.5));', 'color-relative'],
    ['color: rgb(from var(--bb-red, white) r g b);', 'color-relative'],
    ['color: rgb(from currentcolor r g b / var(--a));', 'color-relative'],
    ['color: color(from var(--bb-red) srgb 1 g b);', 'color-relative'],
    ['color: rgb(from #fff r g b);', 'color-hex'],
    ['transition: opacity 150ms;', 'duration-literal'],
    ['transition: opacity var(--bb-dur-fast) ease-out;', 'easing-literal'],
    ['transition-duration: .3s;', 'duration-literal'],
    ['animation: pulse 1.2s var(--bb-ease-out) infinite;', 'duration-literal'],
    ['animation-delay: 80ms;', 'duration-literal'],
    ['animation-timing-function: cubic-bezier(0.2, 0, 0, 1);', 'easing-literal'],
    ['--local-delay: 2s;', 'duration-literal'],
    ['border-radius: 12px;', 'radius-literal'],
    ['border-radius: var(--bb-radius-md) 4px;', 'radius-literal'],
    ['border-top-left-radius: 1rem;', 'radius-literal'],
    ['border-radius: calc(var(--bb-radius-md) - 2px);', 'radius-literal'],
    // La arena no tiene radios: ni siquiera por variable (solo 0 y 50 %).
    ['border-radius: var(--bb-radius-pill);', 'radius-literal'],
    ['border-radius: calc(var(--bb-cut) * 2);', 'radius-literal'],
    ['border-top-left-radius: 999px;', 'radius-literal'],
    // Chaflanes y paralelogramos: nada de longitudes sueltas en polygon().
    ['clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%);', 'chamfer-literal'],
    ['clip-path: polygon(calc(var(--bb-cut) + 6px) 0, 100% 0, 100% 100%, 0 100%);', 'chamfer-literal'],
    ['-webkit-clip-path: polygon(0.5rem 0, 100% 0, 100% 100%, 0 100%);', 'chamfer-literal'],
    ['--frame-cut: 10px;', 'chamfer-literal'],
    ['--plate-slant: 18px;', 'chamfer-literal'],
    // Inclinaciones: solo por token (0 y los cuartos de vuelta son orientaciones).
    ['transform: rotate(-7deg);', 'tilt-literal'],
    ['transform: translateX(4px) skewX(-14deg);', 'tilt-literal'],
    ['transform: rotate(calc(var(--bb-tilt-card) * 2 + 1deg));', 'tilt-literal'],
    ['rotate: 3deg;', 'tilt-literal'],
    ['transform: rotate(0.1rad);', 'tilt-literal'],
    ['--stamp-tilt: 9deg;', 'tilt-literal'],
    // Trazos: solo por token.
    ['border: 1px solid var(--bb-line);', 'stroke-literal'],
    ['border-bottom-width: 2px;', 'stroke-literal'],
    ['outline: 3px solid var(--bb-white);', 'stroke-literal'],
    ['outline-offset: 4px;', 'stroke-literal'],
    ['-webkit-text-stroke: 2px var(--bb-white);', 'stroke-literal'],
    ['border-width: thin;', 'stroke-literal'],
    ['--frame-stroke: 2px;', 'stroke-literal'],
    // Fuentes del sello.
    ['font-family: "Montserrat", sans-serif;', 'forbidden-font'],
    ["font: 500 1rem/1 'JetBrains Mono', monospace;", 'forbidden-font'],
    ['box-shadow: 0 8px 24px var(--bb-black);', 'shadow-literal'],
    ['box-shadow: var(--bb-shadow-card), 0 0 0 1px var(--bb-line);', 'shadow-literal'],
    ['text-shadow: 0 2px 8px var(--bb-black);', 'shadow-literal'],
    ['filter: drop-shadow(0 4px 20px var(--bb-red-glow));', 'shadow-literal'],
  ]
  for (const [declaration, rule] of failing) {
    it(`falla con «${declaration}» (${rule})`, () => {
      assert.ok(css(declaration).includes(rule), `esperaba ${rule} en ${declaration}`)
    })
  }

  const passing = [
    'color: var(--bb-text);',
    'background: transparent;',
    'fill: currentcolor;',
    'color: inherit;',
    'border: var(--bb-stroke-hair) solid var(--bb-line);',
    'border-color: rgb(from var(--bb-red) r g b / var(--veil-alpha));',
    'color: oklch(from var(--bb-red) l c h / alpha);',
    'color: hsl(from var(--bb-red) h s l);',
    'color: color(from var(--bb-red) display-p3 r g b / calc(alpha * var(--fade)));',
    'background-image: linear-gradient(to right, var(--bb-red), transparent);',
    'mask-image: linear-gradient(to bottom, var(--bb-black), transparent);',
    'background-image: conic-gradient(from var(--bb-holo-angle), var(--bb-rarity-epic-stops));',
    'background: color-mix(in srgb, var(--bb-red) 30%, transparent);',
    'transition: transform var(--bb-dur-fast) var(--bb-ease-out);',
    'transition: none;',
    'transition-delay: 0s;',
    'animation: marquee var(--bb-dur-slow) linear infinite;',
    'animation: blink var(--bb-dur-fast) steps(2) infinite;',
    'animation-name: ease-pulse;',
    'border-radius: 0;',
    'border-radius: 50%;',
    'border-radius: 0 0 50% 50%;',
    'border-radius: inherit;',
    'clip-path: polygon(var(--bb-cut) 0, 100% 0, 100% calc(100% - var(--bb-cut)), 0 100%);',
    'clip-path: polygon(evenodd, var(--o) 0, 100% 0, calc(100% - var(--o) * 0.586) 100%, 0 100%);',
    'clip-path: inset(50%);',
    'transform: rotate(var(--bb-tilt-sticker));',
    'transform: rotate(calc(-1 * var(--bb-tilt-stamp))) scale(0.97);',
    'transform: rotate(180deg) translateY(-50%);',
    'transform: rotate(1turn);',
    'transform: skewX(calc(-1 * var(--bb-split-angle)));',
    'rotate: 90deg;',
    'background: linear-gradient(100deg, var(--bb-red), transparent);',
    'border: var(--bb-stroke) solid var(--bb-red);',
    'border: 0;',
    'border: none;',
    'outline: var(--bb-stroke-cursor) solid var(--bb-white);',
    'outline-offset: var(--bb-cursor-gap);',
    'outline: none;',
    '--frame-cut: var(--bb-cut-md);',
    '--frame-cut-inner: calc(var(--frame-cut) - var(--frame-stroke) * 0.586);',
    '--cursor-reach: calc(var(--bb-cursor-gap) + var(--bb-stroke-cursor));',
    '--card-gap: 10px;',
    'box-shadow: none;',
    'box-shadow: var(--bb-focus-halo), var(--bb-shadow-hard);',
    'box-shadow: inset var(--bb-shadow-hard-sm);',
    'filter: drop-shadow(var(--bb-shadow-drop));',
    'background-image: url("./a#fff.svg");',
    'content: "#fff";',
    '--nav-h: 69px;',
    '--card-glow: var(--bb-red-cta);',
    'font-family: var(--bb-font-ui);',
  ]
  for (const declaration of passing) {
    it(`acepta «${declaration}»`, () => {
      assert.deepEqual(css(declaration), [])
    })
  }

  it('no mira los selectores (#id) ni los comentarios', () => {
    const source =
      '/* rojo: #ff003c, 150ms */\n#add,\n.a:hover,\n@media (max-width: 600px) {\n  #bad {\n    color: var(--bb-red);\n  }\n}\n'
    assert.deepEqual(rulesIn('apps/web/src/x.css', source), [])
  })

  it('informa de línea y columna', () => {
    const [violation] = checkSource('apps/web/src/x.css', '.x {\n  color: #fff;\n}\n')
    assert.equal(violation.line, 2)
    assert.equal(violation.column, 10)
    assert.equal(violation.match, '#fff')
  })
})

describe('RD-VIS-01: check-tokens en TS/TSX', () => {
  it('falla con colores literales dentro de cadenas', () => {
    assert.deepEqual(tsx("const a = '#ff003c'\n"), ['color-hex'])
    assert.deepEqual(tsx('const a = "rgba(255, 0, 60, 0.4)"\n'), ['color-function'])
    assert.deepEqual(tsx('const a = `hsl(0 100% 50%)`\n'), ['color-function'])
  })

  it('falla con colores relativos que no son «el token con otro alfa por token»', () => {
    assert.deepEqual(tsx("const a = 'rgb(from var(--bb-black) 255 0 0)'\n"), ['color-relative'])
    assert.deepEqual(tsx("const a = 'rgb(from var(--bb-red) r g b / var(--veil-alpha))'\n"), [])
  })

  it('falla con nombres de color en degradados, en cualquier cadena o propiedad', () => {
    assert.deepEqual(tsx("const s = { backgroundImage: 'linear-gradient(white, black)' }\n"), [
      'color-named',
      'color-named',
    ])
    assert.deepEqual(tsx("const g = 'radial-gradient(circle, var(--bb-red), gold)'\n"), ['color-named'])
  })

  it('falla con nombres de color en el canvas 2D', () => {
    assert.deepEqual(tsx("ctx.fillStyle = 'red'\n"), ['color-named'])
    assert.deepEqual(tsx('ctx.strokeStyle = "white"\n'), ['color-named'])
    assert.deepEqual(tsx("this.ctx.shadowColor = 'black'\n"), ['color-named'])
    assert.deepEqual(tsx("gradient.addColorStop(0.5, 'gold')\n"), ['color-named'])
    assert.deepEqual(tsx("ctx.fillStyle = '#ff003c'\n"), ['color-hex'])
    assert.deepEqual(tsx('ctx.fillStyle = color.red\ngradient.addColorStop(0, color.gold)\n'), [])
  })

  it('un atributo o una variable `color` con un nombre de color es un dato, no un estilo', () => {
    assert.deepEqual(tsx('const el = <Medal place={1} color="gold" />\n'), [])
    assert.deepEqual(tsx("const color = 'gold'\n"), [])
    // Límite documentado: en un objeto, `color` se mira como estilo en línea. Los datos usan otra clave.
    assert.deepEqual(tsx("const medal = { place: 1, color: 'gold' }\n"), ['color-named'])
    assert.deepEqual(tsx("const medal = { place: 1, metal: 'gold' }\n"), [])
  })

  it('falla con estilos en línea literales', () => {
    assert.deepEqual(tsx('const s = { borderRadius: 8 }\n'), ['radius-literal'])
    assert.deepEqual(tsx("const s = { borderTopLeftRadius: '4px' }\n"), ['radius-literal'])
    assert.deepEqual(tsx("const s = { boxShadow: '0 0 4px var(--bb-red)' }\n"), ['shadow-literal'])
    assert.deepEqual(tsx("const s = { transition: 'opacity 200ms' }\n"), ['duration-literal'])
    assert.deepEqual(tsx("const s = { animationTimingFunction: 'ease-in' }\n"), ['easing-literal'])
    assert.deepEqual(tsx("const s = { color: 'white' }\n"), ['color-named'])
    assert.deepEqual(tsx('const el = <rect fill="white" />\n'), ['color-named'])
    assert.deepEqual(tsx('const el = <stop stopColor="gold" />\n'), ['color-named'])
  })

  it('falla con inclinaciones, trazos y chaflanes literales en estilos en línea', () => {
    assert.deepEqual(tsx("const s = { transform: 'rotate(-7deg)' }\n"), ['tilt-literal'])
    assert.deepEqual(tsx("const s = { border: '2px solid var(--bb-red)' }\n"), ['stroke-literal'])
    assert.deepEqual(tsx('const s = { borderWidth: 2 }\n'), ['stroke-literal'])
    assert.deepEqual(tsx('const s = { outlineOffset: 4 }\n'), ['stroke-literal'])
    assert.deepEqual(tsx("const s = { clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 0 100%)' }\n"), [
      'chamfer-literal',
    ])
    assert.deepEqual(tsx("const s = { '--frame-cut': '10px' }\n"), ['chamfer-literal'])
    // El grosor de un icono SVG es dibujo, no un trazo de la interfaz.
    assert.deepEqual(tsx('const el = <path strokeWidth="2.2" />\n'), [])
    assert.deepEqual(tsx("const s = { transform: 'rotate(var(--bb-tilt-card))', borderWidth: 0 }\n"), [])
  })

  it('acepta tokens, anclas, campos privados, comentarios y cadenas normales', () => {
    const source = [
      "// El rojo de marca es '#ff003c'; aquí se usa por token.",
      '/* rgba(0, 0, 0, 0.5) en un comentario */',
      'class A {',
      '  #fade = 1',
      '  get fade() {',
      '    return this.#fade',
      '  }',
      '}',
      "const href = '#contenido'",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: es código fuente de ejemplo para el analizador
      "const s = { color: 'var(--bb-red)', borderRadius: 0, transition: `opacity ${'var(--bb-dur-fast)'}` }",
      "const label = 'Rojo, blanco y negro'",
      'const el = <rect fill="currentColor" />',
      "const url = 'https://www.otherpeople.es/#beats'",
    ].join('\n')
    assert.deepEqual(tsx(source), [])
  })

  it('distingue cadenas dentro de plantillas', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: es código fuente de ejemplo para el analizador
    assert.deepEqual(tsx('const a = `${x ? "#fff" : "var(--bb-text)"}`\n'), ['color-hex'])
    // biome-ignore lint/suspicious/noTemplateCurlyInString: es código fuente de ejemplo para el analizador
    assert.deepEqual(tsx('const a = `${x ? "var(--bb-text)" : "var(--bb-text-2)"}`\n'), [])
  })
})

describe('RD-VIS-01: tokens desconocidos', () => {
  const known = new Set(['--bb-red', '--bb-cut', '--bb-stroke'])
  /** @param {string} file @param {string} source */
  const withTokens = (file, source) => checkSource(file, source, { knownTokens: known }).map((v) => v.rule)

  it('falla con un token que no declara tokens.css (los retirados del sello, una errata)', () => {
    assert.deepEqual(withTokens('apps/web/src/x.css', '.x {\n  color: var(--bb-red-text);\n}\n'), [
      'token-unknown',
    ])
    assert.deepEqual(withTokens('apps/web/src/x.css', '.x {\n  top: var(--nav-gap);\n}\n'), ['token-unknown'])
    assert.deepEqual(withTokens('apps/web/src/X.tsx', "const s = { color: 'var(--bb-glass-card)' }\n"), [
      'token-unknown',
    ])
  })

  it('acepta los declarados, los locales del propio fichero y las variables que no son del sistema', () => {
    assert.deepEqual(
      withTokens('apps/web/src/x.css', '.x {\n  color: var(--bb-red);\n  --frame-cut: var(--bb-cut);\n}\n'),
      [],
    )
    assert.deepEqual(
      withTokens(
        'apps/web/src/x.css',
        '.x {\n  --bb-local-angle: 0deg;\n  rotate: var(--bb-local-angle);\n}\n',
      ),
      [],
    )
    assert.deepEqual(withTokens('apps/web/src/x.css', '.x {\n  inset: var(--frame-stroke);\n}\n'), [])
    // Sin la lista de tokens (fragmentos sueltos), no se mira.
    assert.deepEqual(rulesIn('apps/web/src/x.css', '.x {\n  color: var(--bb-nada);\n}\n'), [])
  })

  it('parseTokenNames lee las variables de todos los bloques y las registradas con @property', () => {
    const names = parseTokenNames(
      ':root {\n  --bb-a: 1px;\n}\n@media (x) {\n  :root { --bb-b: 2px; }\n}\n@property --bb-c {\n  syntax: "<angle>";\n}\n',
    )
    assert.deepEqual([...names].sort(), ['--bb-a', '--bb-b', '--bb-c'])
  })
})

describe('RD-VIS-02 c: piezas prohibidas del sello', () => {
  it('la lista de piezas es la de la guía §3.1 y §3.10', () => {
    assert.deepEqual(FORBIDDEN_COMPONENTS, ['GlassSurface', 'MarqueeBand', 'AmbientOrbs', 'SiteHeader'])
  })

  it('falla al importar o pintar GlassSurface, MarqueeBand, AmbientOrbs o la isla', () => {
    assert.deepEqual(tsx("import { GlassSurface } from '../GlassSurface'\n"), ['forbidden-component'])
    assert.deepEqual(tsx("import { Button, MarqueeBand as Band } from './hero'\n"), ['forbidden-component'])
    assert.deepEqual(tsx("import { AmbientOrbs } from '../../app/layout/AmbientOrbs'\n"), [
      'forbidden-component',
    ])
    assert.deepEqual(tsx("export { SiteHeader } from './SiteHeader'\n"), ['forbidden-component'])
    assert.deepEqual(tsx("export * from './GlassSurface'\n"), ['forbidden-component'])
    assert.deepEqual(tsx("const Glass = lazy(() => import('../GlassSurface/GlassSurface'))\n"), [
      'forbidden-component',
    ])
    assert.deepEqual(tsx("import '../GlassSurface/GlassSurface.css'\n"), ['forbidden-component'])
    assert.deepEqual(tsx('const el = <GlassSurface radius={16} />\n'), ['forbidden-component'])
  })

  it('falla con las fuentes del sello: sus paquetes o su nombre', () => {
    assert.deepEqual(tsx("import '@fontsource-variable/montserrat'\n"), ['forbidden-font'])
    assert.deepEqual(tsx("import '@fontsource-variable/jetbrains-mono/wght.css'\n"), ['forbidden-font'])
    assert.deepEqual(tsx("const s = { fontFamily: 'Montserrat, sans-serif' }\n"), ['forbidden-font'])
    assert.deepEqual(rulesIn('apps/web/src/x.css', '@import "@fontsource-variable/montserrat";\n'), [
      'forbidden-font',
    ])
  })

  it('no confunde piezas con nombres parecidos ni lo que hay en comentarios', () => {
    const source = [
      '// GlassSurface y Montserrat ya no se usan (comentario).',
      "import { Frame } from '../Frame'",
      "import { GlassSurfaceless } from './other'",
      'const el = <Frame />',
      "const label = 'Cristal'",
    ].join('\n')
    assert.deepEqual(tsx(source), [])
  })
})

describe('RD-VIS-01: excepciones temporales de la arena (0.22 → 0.27)', () => {
  it('cada entrada existe, tiene motivo y solo excusa reglas del lint', () => {
    const rules = new Set([
      'color-hex',
      'color-function',
      'color-relative',
      'color-named',
      'duration-literal',
      'easing-literal',
      'radius-literal',
      'chamfer-literal',
      'tilt-literal',
      'stroke-literal',
      'shadow-literal',
      'token-unknown',
      'forbidden-component',
      'forbidden-font',
    ])
    const files = new Set()
    for (const entry of TEMPORARY_EXCEPTIONS) {
      assert.ok(existsSync(path.join(DEFAULT_ROOT, entry.file)), `${entry.file} no existe: quita la entrada`)
      assert.ok(entry.reason.length > 10, `${entry.file} sin motivo`)
      assert.ok(entry.rules.length > 0, `${entry.file} sin reglas`)
      for (const rule of entry.rules) assert.ok(rules.has(rule), `${entry.file}: regla desconocida ${rule}`)
      assert.ok(!files.has(entry.file), `${entry.file} repetido`)
      files.add(entry.file)
    }
  })

  it('ninguna excepción temporal sobra: cada regla excusada sigue fallando en su fichero', () => {
    const knownTokens = parseTokenNames(readFileSync(path.join(DEFAULT_ROOT, TOKENS_FILE), 'utf8'))
    for (const entry of TEMPORARY_EXCEPTIONS) {
      const source = readFileSync(path.join(DEFAULT_ROOT, entry.file), 'utf8')
      const found = new Set(checkSource(entry.file, source, { knownTokens }).map((v) => v.rule))
      for (const rule of entry.rules) {
        assert.ok(found.has(rule), `${entry.file} ya no incumple ${rule}: quítala de TEMPORARY_EXCEPTIONS`)
      }
    }
  })

  it('las piezas prohibidas que siguen en el repo fallan de verdad (solo las excusa la lista)', async () => {
    const { all } = await checkTokens({ root: DEFAULT_ROOT })
    const forbidden = all.filter((v) => v.rule === 'forbidden-component')
    assert.ok(
      forbidden.length > 0,
      'la regla no encuentra GlassSurface, MarqueeBand, AmbientOrbs ni SiteHeader',
    )
    const { failing } = applyTemporaryExceptions(forbidden, [])
    assert.equal(failing.length, forbidden.length)
  })

  it('applyTemporaryExceptions solo excusa la regla y el fichero de la entrada', () => {
    /** @param {string} file @param {string} rule */
    const v = (file, rule) => ({ file, line: 1, column: 1, rule, match: '', message: '' })
    const exceptions = [{ file: 'a.css', rules: ['token-unknown'] }]
    const { failing, deferred } = applyTemporaryExceptions(
      [v('a.css', 'token-unknown'), v('a.css', 'color-hex'), v('b.css', 'token-unknown')],
      exceptions,
    )
    assert.deepEqual(
      deferred.map((x) => `${x.file}:${x.rule}`),
      ['a.css:token-unknown'],
    )
    assert.deepEqual(
      failing.map((x) => `${x.file}:${x.rule}`),
      ['a.css:color-hex', 'b.css:token-unknown'],
    )
  })
})

describe('RD-VIS-01: excepciones', () => {
  it('lint-tokens-allow con motivo deja pasar la línea (en la misma o en la siguiente)', () => {
    const sameLine = '.x {\n  color: #fafafa; /* lint-tokens-allow: logo del sello */\n}\n'
    const nextLine = "const a = 1\n// lint-tokens-allow: color del logo del sello\nconst c = '#fafafa'\n"
    assert.deepEqual(rulesIn('apps/web/src/x.css', sameLine), [])
    assert.deepEqual(tsx(nextLine), [])
  })

  it('lint-tokens-allow sin motivo es un error', () => {
    const source = "// lint-tokens-allow\nconst c = '#fafafa'\n"
    assert.deepEqual(tsx(source), ['allow-without-reason'])
  })
})

describe('RD-VIS-01: escaneo de un repo', () => {
  it('encuentra los literales de los fixtures y salta tokens.css y los tests', async () => {
    const { files, skipped, violations } = await checkTokens({ root: fixture('repo-bad') })
    assert.deepEqual(files, ['apps/web/src/ui/Badge.tsx', 'apps/web/src/ui/card.css'])
    assert.deepEqual(skipped, ['apps/web/src/styles/tokens.css', 'apps/web/src/ui/Badge.test.tsx'])
    const rules = new Set(violations.map((v) => v.rule))
    for (const rule of [
      'color-hex',
      'color-function',
      'color-relative',
      'color-named',
      'duration-literal',
      'easing-literal',
      'radius-literal',
      'chamfer-literal',
      'tilt-literal',
      'stroke-literal',
      'shadow-literal',
      'token-unknown',
      'forbidden-component',
      'forbidden-font',
    ]) {
      assert.ok(rules.has(rule), `falta ${rule}`)
    }
  })

  it('no encuentra nada en el repo de fixtures limpio', async () => {
    const { files, violations } = await checkTokens({ root: fixture('repo-good') })
    assert.equal(files.length, 2)
    assert.deepEqual(violations, [])
  })

  it('la CLI sale con 1 si hay literales y con 0 si no', () => {
    const bad = spawnSync(process.execPath, [script, '--root', fixture('repo-bad')], { encoding: 'utf8' })
    assert.equal(bad.status, 1)
    assert.match(bad.stderr, /apps\/web\/src\/ui\/card\.css:3:10 {2}color-hex {2}#fff/)
    const good = spawnSync(process.execPath, [script, '--root', fixture('repo-good')], { encoding: 'utf8' })
    assert.equal(good.status, 0, good.stderr)
  })

  it('el repo real está limpio fuera de las excepciones temporales (lo mismo que `pnpm lint:tokens`)', async () => {
    const { files, violations } = await checkTokens({ root: DEFAULT_ROOT })
    assert.ok(files.length > 0)
    assert.deepEqual(violations, [])
  })
})
