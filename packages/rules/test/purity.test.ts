// Guardia de pureza de packages/rules (guía §4.5): sin relojes reales, azar sin semilla ni hora
// local de la máquina. Complementa packages/rules/biome.json, que prohíbe imports (UI, render,
// audio, servidor, BD, `node:*`) y globales (DOM, `process`, `fetch`, `crypto`, temporizadores):
// este test busca lo que Biome no ve, como `Date.now()`, `new Date()` o `Math.random()`, y además
// comprueba que Biome aplica de verdad esas prohibiciones (lint de un fichero de prueba).
//
// Los tests corren en Node y leen ficheros, así que test/ tiene su propio tsconfig con tipos de
// Node; el de src no los tiene (`types: []`), y `tsc` falla si src usa una API de Node.

import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const REPO_DIR = join(PACKAGE_DIR, '..', '..')
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

const biomeConfig = JSON.parse(readFileSync(join(PACKAGE_DIR, 'biome.json'), 'utf8')) as {
  root?: boolean
  extends?: string
  overrides?: RestrictionOverride[]
}
const purityRules = biomeConfig.overrides?.find((o) => o.includes?.includes('src/**'))?.linter?.rules
const restrictedPaths = Object.keys(purityRules?.style?.noRestrictedImports?.options?.paths ?? {})
const restrictedPatterns = (purityRules?.style?.noRestrictedImports?.options?.patterns ?? []).flatMap(
  (p) => p.group ?? [],
)
const deniedGlobals = Object.keys(purityRules?.style?.noRestrictedGlobals?.options?.deniedGlobals ?? {})

/** ¿Algún patrón `x/**` de biome.json cubre los subpaths de `specifier` (`specifier/…`)? */
function subpathsCovered(specifier: string): boolean {
  return restrictedPatterns.some(
    (glob) => glob.endsWith('/**') && `${specifier}/`.startsWith(glob.slice(0, -2)),
  )
}

describe('pureza: biome.json', () => {
  it('es una configuración anidada que hereda la raíz', () => {
    expect(biomeConfig.root).toBe(false)
    expect(biomeConfig.extends).toBe('//')
  })

  it('prohíbe los imports de UI, render, audio, servidor, BD y Node en src', () => {
    expect(purityRules?.style?.noRestrictedImports?.level).toBe('error')
    expect(restrictedPaths).toEqual(
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
    expect(restrictedPatterns).toEqual(expect.arrayContaining(['@react-three/**', 'node:*']))
    expect(restrictedPaths).not.toContain('zod')
    expect(restrictedPatterns.some((glob) => glob.startsWith('zod'))).toBe(false)
    expect(purityRules?.correctness?.noNodejsModules?.level).toBe('error')
  })

  it('cada paquete prohibido por nombre también lo está con subpath (`paquete/**`)', () => {
    // `paths` solo compara el nombre exacto: sin su `/**`, `zustand/vanilla` pasaría el lint.
    for (const specifier of restrictedPaths) expect(subpathsCovered(specifier), specifier).toBe(true)
  })

  it('prohíbe los globales del entorno en src', () => {
    expect(purityRules?.style?.noRestrictedGlobals?.level).toBe('error')
    expect(deniedGlobals).toEqual(
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

// Prueba de comportamiento: Biome, con las dos configuraciones reales (raíz y anidada), lint de un
// fichero de src con cada import y global prohibidos, uno por línea. Se hace en un directorio
// temporal: el src real no se toca, y Biome no aplica el lint a `--stdin-file-path`.

/** Imports que la guía prohíbe en las reglas (§4.5), con un subpath de cada paquete. */
const SPEC_FORBIDDEN_IMPORTS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'three',
  'three/examples/jsm/controls/OrbitControls.js',
  '@react-three/fiber',
  '@react-three/drei',
  'zustand',
  'zustand/vanilla',
  'zustand/middleware',
  'tone',
  'tone/build/esm/index.js',
  'motion',
  'motion/react',
  'fastify',
  'fastify/types/instance',
  'drizzle-orm',
  'drizzle-orm/sqlite-core',
  '@libsql/client',
  '@libsql/client/web',
  'node:fs',
  'node:crypto',
  'fs',
  'path',
]

/** Globales que la guía prohíbe en las reglas (§4.5). */
const SPEC_DENIED_GLOBALS = [
  'window',
  'document',
  'localStorage',
  'performance',
  'process',
  'fetch',
  'crypto',
  'setTimeout',
  'setInterval',
]

/** Lo de la guía más todo lo que declara biome.json (cada nombre, con y sin subpath). */
const FIXTURE_IMPORTS = [
  ...new Set([
    ...SPEC_FORBIDDEN_IMPORTS,
    ...restrictedPaths.flatMap((specifier) => [specifier, `${specifier}/sub/path.js`]),
    ...restrictedPatterns.map((glob) =>
      glob === 'node:*' ? 'node:path' : glob.replace(/\/\*\*$/, glob.startsWith('@') ? '/pkg' : '/sub'),
    ),
  ]),
]
const FIXTURE_GLOBALS = [...new Set([...SPEC_DENIED_GLOBALS, ...deniedGlobals])]

/** Líneas permitidas: no deben dar ningún diagnóstico de pureza. */
const FIXTURE_ALLOWED = [
  "import { z } from 'zod'",
  "import { hash32 } from './prng'",
  'export const utc = Date.UTC(2026, 0, 1)',
  'export const biggest = Math.max(1, 2)',
  'export const schema = z.number()',
  'export const h = hash32',
]

const FIXTURE_LINES: readonly { code: string; forbidden: boolean }[] = [
  ...FIXTURE_IMPORTS.map((specifier, i) => ({
    code: `import * as m${i} from '${specifier}'`,
    forbidden: true,
  })),
  ...FIXTURE_GLOBALS.map((name, i) => ({ code: `export const g${i} = ${name}`, forbidden: true })),
  ...FIXTURE_ALLOWED.map((code) => ({ code, forbidden: false })),
]
const FIXTURE = `${FIXTURE_LINES.map((line) => line.code).join('\n')}\n`
const FORBIDDEN_LINES = FIXTURE_LINES.flatMap((line, i) => (line.forbidden ? [i + 1] : []))

const PURITY_CATEGORIES = new Set([
  'lint/style/noRestrictedImports',
  'lint/style/noRestrictedGlobals',
  'lint/correctness/noNodejsModules',
])

interface BiomeDiagnostic {
  category?: string
  location?: { path?: string; start?: { line?: number } }
}

describe('pureza: Biome aplica la regla', () => {
  let workDir = ''
  /** Líneas con algún diagnóstico de pureza, por fichero (ruta relativa con `/`). */
  const flaggedLines = new Map<string, number[]>()

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'beatbattle-rules-purity-'))
    const nested = join(workDir, 'packages', 'rules')
    copyFileSync(join(REPO_DIR, 'biome.json'), join(workDir, 'biome.json'))
    mkdirSync(join(nested, 'src', 'internal'), { recursive: true })
    mkdirSync(join(nested, 'test'), { recursive: true })
    copyFileSync(join(PACKAGE_DIR, 'biome.json'), join(nested, 'biome.json'))
    for (const file of ['src/fixture.ts', 'src/internal/fixture.ts', 'test/fixture.ts']) {
      writeFileSync(join(nested, file), FIXTURE)
    }

    // @biomejs/biome es devDependency de la raíz del monorepo, que es donde se ejecuta `pnpm check`.
    const biomeBin = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome')
    // Sin VCS: el directorio temporal no es un repo de git (la raíz pide su .gitignore).
    const run = spawnSync(
      process.execPath,
      [biomeBin, 'lint', '--vcs-enabled=false', '--max-diagnostics=none', '--reporter=json', '.'],
      { cwd: workDir, encoding: 'utf8' },
    )
    let report: { diagnostics?: BiomeDiagnostic[] }
    try {
      report = JSON.parse(run.stdout) as { diagnostics?: BiomeDiagnostic[] }
    } catch {
      throw new Error(`Biome no devolvió JSON (código ${run.status}):\n${run.stdout}\n${run.stderr}`)
    }
    for (const diagnostic of report.diagnostics ?? []) {
      const path = diagnostic.location?.path?.replaceAll('\\', '/')
      const line = diagnostic.location?.start?.line
      if (!PURITY_CATEGORIES.has(diagnostic.category ?? '') || path === undefined || line === undefined)
        continue
      flaggedLines.set(path, [...(flaggedLines.get(path) ?? []), line])
    }
  }, 30_000)

  afterAll(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true })
  })

  const linesOf = (path: string) => [...new Set(flaggedLines.get(path) ?? [])].sort((a, b) => a - b)

  it.each(['packages/rules/src/fixture.ts', 'packages/rules/src/internal/fixture.ts'])(
    'en %s marca cada import y global prohibido, y nada más',
    (path) => {
      const missed = FORBIDDEN_LINES.filter((line) => !linesOf(path).includes(line)).map(
        (line) => FIXTURE_LINES[line - 1]?.code,
      )
      expect(missed, 'líneas prohibidas que Biome deja pasar').toEqual([])
      expect(linesOf(path)).toEqual(FORBIDDEN_LINES)
    },
  )

  it('no se aplica fuera de src (los tests sí leen ficheros con node:fs)', () => {
    expect(linesOf('packages/rules/test/fixture.ts')).toEqual([])
  })

  it('el fichero de prueba cubre lo que pide la guía', () => {
    expect(FIXTURE_IMPORTS).toEqual(expect.arrayContaining(SPEC_FORBIDDEN_IMPORTS))
    expect(FIXTURE_GLOBALS).toEqual(expect.arrayContaining(SPEC_DENIED_GLOBALS))
  })
})
