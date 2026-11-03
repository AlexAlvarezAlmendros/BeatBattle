import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { STAGE_CATALOGUE } from './catalogue'

/** Los `.tsx` del Escenario (sin los tests). */
function stageSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return stageSources(path)
    return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [path] : []
  })
}

/** Elementos de JSX en minúscula que son piezas de three (`<mesh>` → `Mesh`); los de HTML no lo son. */
function threeElements(source: string): string[] {
  const tags = [...source.matchAll(/<([a-z][A-Za-z0-9]*)\b/g)].map((match) => match[1] as string)
  return tags
    .map((tag) => `${tag[0]?.toUpperCase()}${tag.slice(1)}`)
    .filter((name) => typeof (THREE as Record<string, unknown>)[name] === 'function')
}

/** Lo que pintan por dentro las piezas de fuera que usa el Escenario: la `View` de drei, un `<group>`. */
const FROM_DEPENDENCIES = ['Group']

describe('RNF-PERF-01 / §4.17: el catálogo del Escenario', () => {
  it('RNF-PERF-01: cada pieza de three que el Escenario pinta en JSX está en el catálogo (y nada más)', () => {
    const used = new Set(FROM_DEPENDENCIES)
    for (const file of stageSources(join(import.meta.dirname))) {
      for (const name of threeElements(readFileSync(file, 'utf8'))) used.add(name)
    }
    expect([...used].sort()).toEqual(Object.keys(STAGE_CATALOGUE).sort())
    for (const [name, value] of Object.entries(STAGE_CATALOGUE))
      expect(value).toBe((THREE as Record<string, unknown>)[name])
  })
})
