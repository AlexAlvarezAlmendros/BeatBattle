import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkSource, checkTokens, DEFAULT_ROOT } from '../check-tokens.mjs'

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
    'border: 1px solid var(--bb-line);',
    'border-color: rgb(from var(--bb-red) r g b / 50%);',
    'background: color-mix(in srgb, var(--bb-red) 30%, transparent);',
    'transition: transform var(--bb-dur-fast) var(--bb-ease-out);',
    'transition: none;',
    'transition-delay: 0s;',
    'animation: marquee var(--bb-dur-slow) linear infinite;',
    'animation: blink var(--bb-dur-fast) steps(2) infinite;',
    'animation-name: ease-pulse;',
    'border-radius: 0;',
    'border-radius: 50%;',
    'border-radius: var(--bb-radius-pill);',
    'border-radius: calc(var(--bb-radius-md) * 2);',
    'box-shadow: none;',
    'box-shadow: var(--bb-focus-halo), var(--bb-shadow-glow-red);',
    'box-shadow: inset var(--bb-shadow-card);',
    'filter: drop-shadow(var(--bb-shadow-float));',
    'background-image: url("./a#fff.svg");',
    'content: "#fff";',
    '--nav-h: 69px;',
    '--card-glow: var(--bb-red-glow);',
    'font-family: var(--bb-font-body);',
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

  it('falla con estilos en línea literales', () => {
    assert.deepEqual(tsx('const s = { borderRadius: 8 }\n'), ['radius-literal'])
    assert.deepEqual(tsx("const s = { borderTopLeftRadius: '4px' }\n"), ['radius-literal'])
    assert.deepEqual(tsx("const s = { boxShadow: '0 0 4px var(--bb-red)' }\n"), ['shadow-literal'])
    assert.deepEqual(tsx("const s = { transition: 'opacity 200ms' }\n"), ['duration-literal'])
    assert.deepEqual(tsx("const s = { animationTimingFunction: 'ease-in' }\n"), ['easing-literal'])
    assert.deepEqual(tsx("const s = { color: 'white' }\n"), ['color-named'])
    assert.deepEqual(tsx('const el = <rect fill="white" />\n'), ['color-named'])
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
      'color-named',
      'duration-literal',
      'easing-literal',
      'radius-literal',
      'shadow-literal',
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

  it('el repo real está limpio (lo mismo que `pnpm lint:tokens`)', async () => {
    const { files, violations } = await checkTokens({ root: DEFAULT_ROOT })
    assert.ok(files.length > 0)
    assert.deepEqual(violations, [])
  })
})
