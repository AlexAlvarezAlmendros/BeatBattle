#!/usr/bin/env node
/**
 * Retoque del esquema que genera la CLI de Better Auth (`pnpm --filter @beatbattle/server auth:schema`):
 *
 * - **Quita `onDelete: "cascade"`** (guía §4.11): libSQL por HTTP (Turso) no mantiene `foreign_keys`, así
 *   que en producción la cascada no ocurriría, mientras que en local (claves ajenas activadas) sí: los
 *   tests pasarían y en producción quedarían huérfanos. Los borrados son explícitos y en un `batch`.
 * - Añade la cabecera que dice de dónde sale el fichero.
 * - Lo formatea con el Biome del repo.
 */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/db/auth-schema.ts')
const HEADER = `/**
 * Tablas de Better Auth (guía §4.9), **generadas**: no se editan a mano. Se regeneran con
 * \`pnpm --filter @beatbattle/server auth:schema\` (CLI \`auth\` 1.7.7 sobre \`src/auth/schema.cli.ts\`), que
 * además quita las cascadas (§4.11: los borrados son explícitos, en \`batch\`). Después, \`db:generate\`.
 */
`

let source = await readFile(file, 'utf8')
source = source.replace(/^\/\*\*[\s\S]*?\*\/\n/, '')
const before = source
source = source.replace(/,\s*\{\s*onDelete:\s*["']cascade["']\s*\}/g, '')
if (/cascade/i.test(source))
  throw new Error('Queda una cascada en el esquema de Better Auth: revisa el retoque')
await writeFile(file, HEADER + source)
const biome = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome')
execFileSync(process.execPath, [biome, 'format', '--write', file], { stdio: 'inherit' })
console.log(`auth-schema.ts: ${before === source ? 'sin cascadas que quitar' : 'cascadas quitadas'}`)
