import { advanceStreak, STREAK_START, type StreakState } from '@beatbattle/rules'

/**
 * Los récords del salón de la fama (guía §2.9; tarea 7.12, `RF-ARC-02`), como funciones puras de lo que dicen los
 * snapshots vigentes de las semanas selladas: más victorias, racha más larga, mejor puntuación de la historia y más
 * votos emitidos. Con un empate en la cifra, el récord es de quien llegó antes a ella (la semana de número más bajo en
 * la que la alcanzó) y, si también empatan en eso, del id menor (solo para que sea estable).
 */

/** Una semana sellada con su snapshot vigente. */
export interface RecordWeek {
  id: string
  number: number
  seasonId: string
  /** Sus entradas en el snapshot vigente (`position` `null` = sin clasificar). */
  rows: readonly { userId: string; entryId: string; position: number | null; scoreMilli: number }[]
  /** Votos válidos de la semana por cuenta (los que contó su snapshot). */
  votesByVoter: ReadonlyMap<string, number>
}

/** Un récord: de quién, la cifra y la semana (por número) en la que la alcanzó. */
export interface HallRecord {
  userId: string
  value: number
  reachedAt: number
}

/** El mejor récord: la cifra más alta y, empatados, el que llegó antes; `null` si nadie tiene nada. */
function best(candidates: Iterable<HallRecord>): HallRecord | null {
  let top: HallRecord | null = null
  for (const c of candidates) {
    if (c.value <= 0) continue
    if (
      top === null ||
      c.value > top.value ||
      (c.value === top.value &&
        (c.reachedAt < top.reachedAt || (c.reachedAt === top.reachedAt && c.userId < top.userId)))
    )
      top = c
  }
  return top
}

/** Una cuenta (o un productor eliminado) con su cifra y cuándo la alcanzó. */
function tally(map: Map<string, HallRecord>, userId: string, value: number, at: number) {
  const current = map.get(userId)
  if (!current || value > current.value) map.set(userId, { userId, value, reachedAt: at })
}

/** Ordena las semanas por número (los récords se recorren en el orden del calendario). */
const inOrder = (weeks: readonly RecordWeek[]) => [...weeks].sort((a, b) => a.number - b.number)

/** Más victorias: semanas en 1.ª posición (ex aequo incluidos). */
export function mostWins(weeks: readonly RecordWeek[]): HallRecord | null {
  const wins = new Map<string, number>()
  const out = new Map<string, HallRecord>()
  for (const w of inOrder(weeks))
    for (const row of w.rows)
      if (row.position === 1) {
        const n = (wins.get(row.userId) ?? 0) + 1
        wins.set(row.userId, n)
        tally(out, row.userId, n, w.number)
      }
  return best(out.values())
}

/**
 * La racha más larga (§2.10): la mejor racha de cada productor con las semanas selladas en orden de número (fallar es
 * sellar una semana sin entrada clasificada, con el comodín de su temporada). Una semana sin sellar en medio se salta,
 * como un hueco del calendario.
 */
export function longestStreak(weeks: readonly RecordWeek[]): HallRecord | null {
  const ordered = inOrder(weeks)
  const people = new Set(ordered.flatMap((w) => w.rows.map((row) => row.userId)))
  const out = new Map<string, HallRecord>()
  for (const userId of people) {
    let state: StreakState = STREAK_START
    for (const w of ordered) {
      const last = state.lastWeekNumber
      if (last !== null && w.number > last + 1) state = { ...state, lastWeekNumber: w.number - 1 }
      const qualified = w.rows.some((row) => row.userId === userId && row.position !== null)
      state = advanceStreak(state, { number: w.number, seasonId: w.seasonId, qualified })
      tally(out, userId, state.best, w.number)
    }
  }
  return best(out.values())
}

/** La mejor puntuación de la historia: la de una entrada clasificada, exacta (× 1000). */
export function bestScore(
  weeks: readonly RecordWeek[],
): { userId: string; scoreMilli: number; weekId: string; entryId: string } | null {
  let top: { userId: string; scoreMilli: number; weekId: string; entryId: string; number: number } | null =
    null
  for (const w of inOrder(weeks))
    for (const row of w.rows) {
      if (row.position === null) continue
      if (
        top === null ||
        row.scoreMilli > top.scoreMilli ||
        (row.scoreMilli === top.scoreMilli && w.number === top.number && row.entryId < top.entryId)
      )
        top = {
          userId: row.userId,
          scoreMilli: row.scoreMilli,
          weekId: w.id,
          entryId: row.entryId,
          number: w.number,
        }
    }
  if (top === null) return null
  const { number: _, ...out } = top
  return out
}

/** Más votos emitidos: los votos válidos de cada cuenta en las semanas selladas. */
export function mostVotesCast(weeks: readonly RecordWeek[]): HallRecord | null {
  const total = new Map<string, number>()
  const out = new Map<string, HallRecord>()
  for (const w of inOrder(weeks))
    for (const [voterId, n] of w.votesByVoter) {
      const sum = (total.get(voterId) ?? 0) + n
      total.set(voterId, sum)
      tally(out, voterId, sum, w.number)
    }
  return best(out.values())
}
