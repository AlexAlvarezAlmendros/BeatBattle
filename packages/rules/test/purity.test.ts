// Guardia de pureza de packages/rules (guía §4.5): sin relojes reales, azar sin semilla ni hora
// local de la máquina. Complementa packages/rules/biome.json, que prohíbe imports (UI, render,
// audio, servidor, BD, `node:*`) y globales (DOM, `process`, `fetch`, `crypto`, temporizadores):
// este test busca lo que Biome no ve, como `Date.now()`, `new Date()` o `Math.random()`.
//
// Los tests corren en Node y leen ficheros, así que test/ tiene su propio tsconfig con tipos de
// Node; el de src no los tiene (`types: []`), y `tsc` falla si src usa una API de Node.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const SRC_DIR = join(PACKAGE_DIR, 'src')

interface ForbiddenPattern {
  readonly pattern: RegExp
  readonly reason: string
}

const FORBIDDEN: readonly ForbiddenPattern[] = [
  { pattern: /\bDate\s*\.\s*now\b/g, reason: 'Date.now: el instante entra como argumento' },
  { pattern: /\bnew\s+Date\s*\(\s*\)/g, reason: 'new Date() sin argumentos lee el reloj' },
  { pattern: /\bnew\s+Date\b(?!\s*\()/g, reason: 'new Date sin paréntesis lee el reloj' },
  { pattern: /(?<![\w$.]|\bnew\s+)Date\s*\(/g, reason: 'Date() como función devuelve la hora actual' },
  { pattern: /\bMath\s*\.\s*random\b/g, reason: 'Math.random: usa el PRNG con semilla (prng.ts)' },
  { pattern: /\bperformance\s*\./g, reason: 'performance: reloj real' },
  { pattern: /\bcrypto\s*\./g, reason: 'crypto: azar real; usa el PRNG con semilla (prng.ts)' },
  // La hora local depende de la zona de la máquina: las fronteras se calculan con Intl y una zona
  // explícita (guía §4.12), y los métodos UTC (`getUTCHours`, `Date.UTC`) siguen permitidos.
  {
    pattern: /\.(?:get|set)(?:FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)\s*\(/g,
    reason: 'getter/setter de hora local: usa los métodos UTC',
  },
  { pattern: /\.getTimezoneOffset\s*\(/g, reason: 'getTimezoneOffset depende de la zona de la máquina' },
  { pattern: /\.toLocale(?:Date|Time)?String\s*\(/g, reason: 'toLocale*String: usa Intl con zona explícita' },
  { pattern: /\bDate\s*\.\s*parse\b/g, reason: 'Date.parse interpreta cadenas en hora local' },
  { pattern: /\bnew\s+Date\s*\([^()]*,/g, reason: 'new Date(año, mes, …) usa la hora local: usa Date.UTC' },
  { pattern: /\bfrom\s+['"]node:|\bimport\s*\(\s*['"]node:/g, reason: 'import de una API de Node' },
]

/** Sustituye los comentarios por espacios conservando los saltos de línea (y así los números de línea). */
function blankComments(code: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, ' ')
  return code.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank)
}

/** Usos prohibidos en un fragmento de código, como `línea: motivo`. */
function findViolations(code: string): string[] {
  const clean = blankComments(code)
  const found: string[] = []
  for (const { pattern, reason } of FORBIDDEN) {
    for (const match of clean.matchAll(pattern)) {
      const line = clean.slice(0, match.index).split('\n').length
      found.push(`${line}: ${reason}`)
    }
  }
  return found
}

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .sort()
}

describe('pureza: el detector', () => {
  it.each([
    'const t = Date.UTC(2026, 9, 5, 22)',
    'const d = new Date(nowMs)',
    'const d = new Date(Date.UTC(2026, 0, 1))',
    'const h = d.getUTCHours() + d.getUTCDay()',
    'const label = isoDate(weekStartMs)',
    'const rng = createRng(seed); rng.next()',
    '// Date.now() en un comentario de línea',
    '/* Math.random() en un comentario\n de bloque */',
  ])('acepta %j', (code) => {
    expect(findViolations(code)).toEqual([])
  })

  it.each([
    'const now = Date.now()',
    'const clock = Date.now',
    'const d = new Date()',
    'const d = new Date',
    'const s = Date()',
    'const x = Math.random()',
    'const t = performance.now()',
    'const id = crypto.randomUUID()',
    'crypto.getRandomValues(buffer)',
    'const h = d.getHours()',
    'd.setDate(1)',
    'const off = d.getTimezoneOffset()',
    "const s = d.toLocaleDateString('es-ES')",
    "const t = Date.parse('2026-10-05T00:00')",
    'const d = new Date(2026, 9, 5)',
    "import { readFileSync } from 'node:fs'",
  ])('rechaza %j', (code) => {
    expect(findViolations(code)).not.toEqual([])
  })

  it('indica la línea del uso prohibido', () => {
    expect(findViolations('const a = 1\n/* x\n y */\nconst b = Math.random()')).toEqual([
      '4: Math.random: usa el PRNG con semilla (prng.ts)',
    ])
  })
})

describe('pureza: src', () => {
  const files = sourceFiles()

  it('tiene ficheros fuente', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s no lee el reloj, el azar real ni la hora local', (file) => {
    const code = readFileSync(join(SRC_DIR, file), 'utf8')
    expect(findViolations(code)).toEqual([])
  })
})

describe('pureza: biome.json', () => {
  interface RestrictionOverride {
    includes?: string[]
    linter?: {
      rules?: {
        correctness?: { noNodejsModules?: { level?: string } }
        style?: {
          noRestrictedImports?: {
            level?: string
            options?: { paths?: Record<string, string>; patterns?: { group?: string[] }[] }
          }
          noRestrictedGlobals?: { level?: string; options?: { deniedGlobals?: Record<string, string> } }
        }
      }
    }
  }
  const config = JSON.parse(readFileSync(join(PACKAGE_DIR, 'biome.json'), 'utf8')) as {
    root?: boolean
    extends?: string
    overrides?: RestrictionOverride[]
  }
  const override = config.overrides?.find((o) => o.includes?.includes('src/**'))
  const rules = override?.linter?.rules

  it('es una configuración anidada que hereda la raíz', () => {
    expect(config.root).toBe(false)
    expect(config.extends).toBe('//')
  })

  it('prohíbe los imports de UI, render, audio, servidor, BD y Node en src', () => {
    const imports = rules?.style?.noRestrictedImports
    expect(imports?.level).toBe('error')
    expect(Object.keys(imports?.options?.paths ?? {})).toEqual(
      expect.arrayContaining([
        'react',
        'react-dom',
        'three',
        'zustand',
        'tone',
        'motion',
        'fastify',
        'drizzle-orm',
        '@libsql/client',
      ]),
    )
    expect(imports?.options?.patterns?.flatMap((p) => p.group ?? [])).toEqual(
      expect.arrayContaining(['@react-three/**', 'node:*']),
    )
    expect(Object.keys(imports?.options?.paths ?? {})).not.toContain('zod')
    expect(rules?.correctness?.noNodejsModules?.level).toBe('error')
  })

  it('prohíbe los globales del entorno en src', () => {
    const globals = rules?.style?.noRestrictedGlobals
    expect(globals?.level).toBe('error')
    expect(Object.keys(globals?.options?.deniedGlobals ?? {})).toEqual(
      expect.arrayContaining([
        'window',
        'document',
        'localStorage',
        'performance',
        'process',
        'fetch',
        'crypto',
        'setTimeout',
        'setInterval',
      ]),
    )
  })
})
