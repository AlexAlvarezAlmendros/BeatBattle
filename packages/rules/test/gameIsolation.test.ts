// Guarda de `RF-GAME-10` en las reglas (guía §1.3, §2.10): el XP, los niveles, los logros y el oído de oro nunca
// influyen en la clasificación ni en el peso de un voto.
//
// - Estático: `ranking` y `scoring`, y todo lo que importan (el cierre transitivo dentro de src), no importan
//   `levels`, `xp`, `achievements` ni `goldenEar`.
// - Dinámico: `rank` solo recibe de cada voto la entrada y las estrellas; dos votantes de nivel 1 y 20 pesan igual.
//
// Es la base del test de `RF-SURP-02` (las sorpresas, Fase 8) y de `RF-OTP-05` (la Elección del sello, Fase 9).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { levelOf, rankTitle } from '../src/levels'
import { type RankEntry, type RankVote, rank } from '../src/ranking'

const SRC_DIR = join(import.meta.dirname, '..', 'src')

/** Módulos de la clasificación (lo que congela el sellado). */
const RANKING_MODULES = ['ranking', 'scoring'] as const
/** Módulos de la capa de juego. */
const GAME_MODULES = ['levels', 'xp', 'achievements', 'goldenEar', 'replay'] as const

/** Los módulos de src que importa (o reexporta) un módulo, por su nombre relativo a src y sin extensión. */
function importsOf(module: string): string[] {
  const code = readFileSync(join(SRC_DIR, `${module}.ts`), 'utf8')
  const specifiers = [
    ...code.matchAll(/^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gm),
    ...code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
    ...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1] as string)
  return specifiers
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => join(module, '..', specifier).replace(/\\/g, '/').replace(/\.ts$/, ''))
}

/** El cierre transitivo de los imports de `roots` dentro de src. */
function closure(roots: readonly string[]): Set<string> {
  const seen = new Set<string>()
  const pending = [...roots]
  while (pending.length > 0) {
    const module = pending.pop() as string
    if (seen.has(module)) continue
    seen.add(module)
    pending.push(...importsOf(module))
  }
  return seen
}

describe('RF-GAME-10: la clasificación no depende de la capa de juego', () => {
  it('el lector de imports ve los de verdad (y los de la capa de juego cuando están)', () => {
    expect(importsOf('ranking').sort()).toEqual(['balance', 'scoring', 'season'])
    expect(importsOf('scoring').sort()).toEqual(['balance', 'internal/guards'])
    expect(importsOf('achievements')).toEqual(expect.arrayContaining(['levels', 'xp', 'calendar']))
    expect([...closure(['achievements'])]).toEqual(
      expect.arrayContaining(['levels', 'xp', 'balance', 'internal/guards']),
    )
  })

  it('RF-GAME-10: ranking y scoring no importan levels, xp, achievements ni goldenEar (ni por el camino)', () => {
    const reachable = closure(RANKING_MODULES)
    for (const module of RANKING_MODULES) expect(reachable.has(module)).toBe(true)
    for (const game of GAME_MODULES)
      expect(reachable.has(game), `${game} entra en la clasificación`).toBe(false)
  })

  it('RF-GAME-10: rank solo recibe de cada voto la entrada y las estrellas, nada de la cuenta que vota', () => {
    // Si alguien añade un campo a `RankVote` (un nivel, un XP, un peso), este objeto deja de compilar.
    const fields: Record<keyof RankVote, true> = { entryId: true, stars: true }
    expect(Object.keys(fields).sort()).toEqual(['entryId', 'stars'])
    // Y la firma no tiene sitio para nada más que las entradas, los votos y el peso del previo de la semana.
    expect(rank.length).toBeLessThanOrEqual(3)
  })

  it('RF-GAME-10: dos votantes de nivel 1 y 20 pesan igual', () => {
    expect(rankTitle(levelOf(0))).toBe('crateDigger')
    expect(levelOf(16_700)).toBe(20)
    const entries: RankEntry[] = [
      { id: 'a', submittedAt: 1 },
      { id: 'b', submittedAt: 2 },
    ]
    // El de nivel 1 prefiere A y el de nivel 20, B; un tercero da 3 a las dos.
    const votes = [
      { entryId: 'a', stars: 5, voterLevel: 1, voterXp: 0 },
      { entryId: 'b', stars: 1, voterLevel: 1, voterXp: 0 },
      { entryId: 'a', stars: 1, voterLevel: 20, voterXp: 16_700 },
      { entryId: 'b', stars: 5, voterLevel: 20, voterXp: 16_700 },
      { entryId: 'a', stars: 3, voterLevel: 7, voterXp: 2_650 },
      { entryId: 'b', stars: 3, voterLevel: 7, voterXp: 2_650 },
    ]
    const [first, second] = rank(entries, votes)
    // Empate exacto: misma puntuación, mismos votos, misma mediana y mismos cincos → ex aequo en la 1.ª.
    expect(first?.position).toBe(1)
    expect(second?.position).toBe(1)
    expect(first?.scoreMilli).toBe(second?.scoreMilli)
  })

  it('RF-GAME-10: lo que se sepa de la cuenta que vota (nivel, XP, logros) no cambia la clasificación', () => {
    const entryIds = ['a', 'b', 'c', 'd', 'e']
    const entries: RankEntry[] = entryIds.map((id, i) => ({ id, submittedAt: i }))
    const account = fc.record({
      level: fc.integer({ min: 1, max: 20 }),
      xp: fc.nat(40_000),
      achievements: fc.array(fc.string(), { maxLength: 5 }),
    })
    const vote = fc.record({ entryId: fc.constantFrom(...entryIds), stars: fc.integer({ min: 1, max: 5 }) })
    fc.assert(
      fc.property(fc.array(fc.tuple(vote, account, account), { maxLength: 40 }), (list) => {
        const bare: RankVote[] = list.map(([v]) => v)
        const withAccount = list.map(([v, a]) => ({ ...v, ...a }))
        const withOtherAccount = list.map(([v, , b]) => ({ ...v, ...b }))
        const expected = rank(entries, bare)
        expect(rank(entries, withAccount)).toEqual(expected)
        expect(rank(entries, withOtherAccount)).toEqual(expected)
      }),
    )
  })
})
