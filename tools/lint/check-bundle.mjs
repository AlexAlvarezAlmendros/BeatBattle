#!/usr/bin/env node
/**
 * Presupuestos de los trozos de la web (guía §4.17, `RNF-PERF-01` y `RNF-PERF-04`; tarea 7.34), sobre una build de
 * producción (`pnpm build`, o la carpeta que se le pase). Falla (código 1) si:
 *
 * - el trozo del **Escenario** (`Stage-*.js`: three, R3F y las vistas) llega a 250 kB gz, o
 * - el Escenario o el **pase de la carta** (`PassView-*.js`, con Rapier) se precargan en `index.html` o los importa de
 *   forma estática la entrada: tienen que llegar después de la primera pintura.
 *
 * Además dice el **JS inicial** (la entrada y el cierre de sus importaciones estáticas) y la **1.ª pintura de la home**
 * (todo lo que `index.html` carga o precarga, con la página de la home de `routePreload`), contra los 200 kB gz de la
 * tabla. Esos dos se pasan desde antes de la Fase 7 (201,4 y 278,0 kB gz al empezarla; 211,8 y 289,6 el 2026-11-03): el aviso queda escrito y su
 * arreglo es de la auditoría de rendimiento de la Fase 10 (Lighthouse CI); cuando bajen, pasan a fallar aquí también.
 *
 * El gzip es el de Node (`zlib`, nivel 9): ~1 % por debajo de la cifra que escribe `vite build` (otro compresor), que es
 * la que apunta la guía.
 *
 * Uso: node tools/lint/check-bundle.mjs [carpeta=apps/web/dist]
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const dist = process.argv[2] ?? 'apps/web/dist'
const KB = 1000
const STAGE_BUDGET = 250 * KB
const INITIAL_BUDGET = 200 * KB
/** Trozos que llegan después de la primera pintura (`RNF-PERF-04`). */
const DEFERRED = [/^Stage-/, /^PassView-/]

/** @param {string} file */
const assetPath = (file) => join(dist, 'assets', file)
/** @param {string} file */
const gz = (file) => gzipSync(readFileSync(assetPath(file)), { level: 9 }).length
/** @param {string[]} files */
const sum = (files) => files.reduce((total, file) => total + gz(file), 0)
/** @param {number} bytes */
const kb = (bytes) => `${(bytes / KB).toFixed(2)} kB`

const html = readFileSync(join(dist, 'index.html'), 'utf8')
const entry = html.match(/<script type="module"[^>]*src="\/assets\/([^"]+\.js)"/)?.[1]
const preloaded = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((match) => match[1])
const assets = readdirSync(join(dist, 'assets')).filter((file) => file.endsWith('.js'))
const stage = assets.find((file) => /^Stage-/.test(file))
const pass = assets.find((file) => /^PassView-/.test(file))

/** La entrada y lo que importa de forma estática, con lo que eso importa (las `import()` no cuentan). */
/**
 * @param {string | undefined} start
 * @returns {string[]}
 */
function staticClosure(start) {
  /** @type {Set<string>} */
  const seen = new Set()
  /** @param {string} file */
  const visit = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    const code = readFileSync(assetPath(file), 'utf8')
    for (const match of code.matchAll(
      /(?:^|[;\n}])\s*import\s*(?:[^'"()]*?from\s*)?["']\.\/([^"']+\.js)["']/g,
    ))
      visit(match[1])
  }
  if (start) visit(start)
  return [...seen]
}

const failures = []
const warnings = []
if (!entry) failures.push('index.html no tiene la entrada: ¿es una build de la web?')
const initial = staticClosure(entry)
const initialGz = sum(initial)
const firstPaintGz = sum(preloaded)
const stageGz = stage ? gz(stage) : 0
if (!stage) failures.push('no hay trozo del Escenario (`Stage-*.js`)')
if (stageGz >= STAGE_BUDGET) failures.push(`Escenario: ${kb(stageGz)} gz (presupuesto < ${kb(STAGE_BUDGET)})`)
for (const file of new Set([...preloaded, ...initial]))
  if (DEFERRED.some((pattern) => pattern.test(file)))
    failures.push(`${file} llega con la primera pintura: tiene que pedirse después (RNF-PERF-04)`)
if (initialGz >= INITIAL_BUDGET)
  warnings.push(`JS inicial: ${kb(initialGz)} gz (presupuesto < ${kb(INITIAL_BUDGET)})`)
if (firstPaintGz >= INITIAL_BUDGET)
  warnings.push(`1.ª pintura de la home: ${kb(firstPaintGz)} gz (presupuesto < ${kb(INITIAL_BUDGET)})`)

console.log(`JS inicial (${initial.length} trozos): ${kb(initialGz)} gz`)
console.log(`1.ª pintura de la home (${preloaded.length} trozos): ${kb(firstPaintGz)} gz`)
if (stage) console.log(`Escenario (${stage}): ${kb(stageGz)} gz · presupuesto < ${kb(STAGE_BUDGET)}`)
if (pass) console.log(`Pase de la carta (${pass}): ${kb(gz(pass))} gz · sin presupuesto propio, diferido`)
for (const warning of warnings) console.warn(`⚠ ${warning}: pendiente de la auditoría de la Fase 10`)
if (failures.length) {
  for (const failure of failures) console.error(`✗ ${failure}`)
  process.exit(1)
}
console.log('✓ el Escenario cabe en su presupuesto y lo diferido llega después de la primera pintura')
