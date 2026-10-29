import {
  type AccountHistory,
  type AchievementId,
  GOLDEN_EAR_MIN_VOTES,
  goldenEar,
  type HistoryEntry,
  type HistorySealedWeek,
  type ReplayedMovement,
  type ReplayedUnlock,
  replayAccount,
  type SealedEntry,
  type StreakState,
  seasonEndsAt,
  XP_VOTE_MAX_VOTES_PER_WEEK,
} from '@beatbattle/rules'
import { and, eq, isNotNull, min, ne, sql } from 'drizzle-orm'
import { type BatchStatement, runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import {
  achievementUnlock,
  entry,
  jobState,
  producerProfile,
  result,
  sampleDownload,
  streakState,
  user,
  vote,
  week,
  type XpEventKind,
  xpEvent,
} from '../../db/schema'
import { withLease } from '../../lib/lease'
import { parseLinks } from '../profile/service'
import { computeSnapshot } from '../results/snapshot'
import { championsBySeason } from '../seasons/repo'
import { sealDueWeeks } from '../weeks/seal'
import {
  achievementXp,
  type Guard,
  LEVEL_20_XP,
  level20Statements,
  refreshXpStatement,
  streakStatement,
  unlockStatements,
  xpMovementStatement,
} from './repo'

/**
 * El reprocesado de la capa de juego (guía §2.10, §4.11; tarea 7.16): reparte el XP y los logros de lo que ya pasó
 * —descargas, entradas, votos, semanas selladas y temporadas cerradas, en orden de calendario— a las cuentas que
 * jugaron antes de que existiera la capa de juego. Es idempotente (`RF-GAME-01`): solo **añade lo que falta**, con
 * `INSERT … ON CONFLICT DO NOTHING`, así que reprocesar dos veces, o sobre una base en la que los ganchos en vivo ya
 * escribieron, no cambia nada. Nunca resta ni retira: corregir es cosa del re-sellado (§2.8).
 *
 * - **El corte** (`cutoff`): lo anterior a ese instante es del reprocesado y lo de después, de los ganchos en vivo. Es
 *   el primer movimiento o logro que había en el libro la primera vez que se reprocesa (la capa de juego ya escribía
 *   desde entonces) o, con el libro vacío, el instante de esa primera vez; se guarda en `job_state`
 *   (`gameReprocess`) **antes** de escribir nada, así que las pasadas siguientes usan el mismo. Con él, un hecho que
 *   ya vio la capa de juego en vivo nunca se vuelve a contar con otra cuenta (el tope de votos de una semana partida,
 *   el oído de oro de una semana sellada en vivo, el jurado completo).
 * - **Lo que da**: la historia de cada cuenta re-jugada con `replayAccount` (`@beatbattle/rules`); de ella, los
 *   movimientos de hechos anteriores al corte que no están en el libro (el tope semanal de votos va además dentro del
 *   `INSERT`) y los logros que la cuenta no tiene (`jury_full`, solo si el voto que completa el jurado es anterior al
 *   corte); `level_20` si el libro, con lo nuevo, lo cruza; la racha si cambia; y la caché `producer_profile.xp`.
 * - **El instante de cada fila es el de su hecho** (el del voto, el de la entrada, el del sellado, el del cierre de la
 *   temporada), nunca el de ahora: lo pasado no cuenta como de hoy y no encola `game.progress` (7.29). Y no se anuncia:
 *   los logros entran ya vistos (`seen_at` = el instante de su hecho). El nivel visto no cambia: la subida de nivel sale
 *   una vez, con el nivel alcanzado.
 * - Un `batch` por cuenta, con la condición de que la cuenta exista (lo de una cuenta borrada no vuelve). Antes, sella
 *   lo que ya cerró (el sellado perezoso). Sin `apply` no escribe nada: dice lo que haría.
 *
 * Lo que la base ya no guarda no se puede re-jugar: los votos a entradas retiradas (se borran con ellas) y los quitados;
 * la hora a la que una entrada en `processing` pasó a `active` (se usa la de registro, `submitted_at`); cuándo se
 * completó un perfil (`profile_done` lleva la fecha de alta del perfil); y lo que pasa en el navegador (`share_card`).
 */

/** Lo que el reprocesado guarda en `job_state`. */
const STATE = 'gameReprocess'
/** Lo que puede durar un reprocesado antes de que otro lo dé por perdido. */
const LEASE_MS = 10 * 60 * 1000

export interface ReprocessDeps {
  db: Db
  now: number
  newId: () => string
  /** Escribe; sin él, solo cuenta lo que haría (y no sella ni guarda el corte). */
  apply: boolean
}

export interface ReprocessSummary {
  /** Lo anterior a este instante es del reprocesado; lo de después, de los ganchos en vivo. */
  cutoff: number
  applied: boolean
  /** Semanas que ha sellado antes (el sellado perezoso; solo con `apply`). */
  sealed: string[]
  /** Cuentas con algo nuevo. */
  accounts: number
  /** Movimientos nuevos por tipo (con los de los logros). */
  movements: Partial<Record<XpEventKind, number>>
  /** Logros nuevos por id. */
  achievements: Partial<Record<AchievementId, number>>
  /** XP que suma, entre todas las cuentas. */
  xp: number
  /** Rachas guardadas que cambian. */
  streaks: number
}

interface CutoffState {
  before: number
  doneAt?: number
}

async function readState(db: Db): Promise<CutoffState | null> {
  const [row] = await db.select({ value: jobState.value }).from(jobState).where(eq(jobState.name, STATE))
  if (!row) return null
  try {
    const value = JSON.parse(row.value) as Partial<CutoffState>
    return typeof value.before === 'number' && Number.isFinite(value.before)
      ? { before: value.before, ...(typeof value.doneAt === 'number' ? { doneAt: value.doneAt } : {}) }
      : null
  } catch {
    return null
  }
}

function writeState(db: Db, state: CutoffState, now: number): BatchStatement {
  const value = JSON.stringify(state)
  return db
    .insert(jobState)
    .values({ name: STATE, value, updatedAt: now })
    .onConflictDoUpdate({ target: jobState.name, set: { value, updatedAt: now } })
}

/** ¿Ha terminado ya un reprocesado con `apply`? (el paso opcional del `tick` solo corre una vez). */
export async function reprocessDone(db: Db): Promise<boolean> {
  return (await readState(db))?.doneAt !== undefined
}

/** El corte: el guardado o, la primera vez, el primer movimiento o logro del libro (o `now` si está vacío). */
async function cutoffOf(db: Db, now: number): Promise<{ cutoff: number; stored: boolean }> {
  const state = await readState(db)
  if (state) return { cutoff: state.before, stored: true }
  const [ledger] = await db.select({ at: min(xpEvent.createdAt) }).from(xpEvent)
  const [unlocks] = await db.select({ at: min(achievementUnlock.unlockedAt) }).from(achievementUnlock)
  const firsts = [ledger?.at, unlocks?.at].filter((at): at is number => typeof at === 'number')
  return { cutoff: firsts.length > 0 ? Math.min(...firsts) : now, stored: false }
}

/** Suma de estrellas a partir del histograma `[n1..n5]`. */
const starsOf = (histogram: readonly number[]) => histogram.reduce((total, n, i) => total + n * (i + 1), 0)

const sameStreak = (a: StreakState, b: StreakState) =>
  a.current === b.current && a.best === b.best && a.jokerSeason === b.jokerSeason

const count = <K extends string>(into: Partial<Record<K, number>>, key: K) => {
  into[key] = (into[key] ?? 0) + 1
}

/** Lo que hay que saber de toda la base para re-jugar cada cuenta. */
async function loadWorld(db: Db, cutoff: number) {
  const weeks = await db
    .select({
      id: week.id,
      number: week.number,
      seasonId: week.seasonId,
      golden: week.golden,
      challenge: week.challenge,
      submitEndsAt: week.submitEndsAt,
      sealedAt: week.sealedAt,
      resultRevision: week.resultRevision,
    })
    .from(week)
    .orderBy(week.number)
  const accounts = new Set((await db.select({ id: user.id }).from(user)).map((row) => row.id))
  // Las entradas que llegaron a `active`: medidas (con onda) y fuera de `processing`, aunque después se retiraran o
  // descalificaran (el XP de subir no se retira, §2.10).
  const activated = await db
    .select({
      id: entry.id,
      weekId: entry.weekId,
      userId: entry.userId,
      submittedAt: entry.submittedAt,
      status: entry.status,
    })
    .from(entry)
    .where(and(isNotNull(entry.peaks), ne(entry.status, 'processing')))
  const votes = await db
    .select({ userId: vote.userId, entryId: vote.entryId, weekId: vote.weekId, at: vote.createdAt })
    .from(vote)
  const downloads = await db
    .select({ userId: sampleDownload.userId, weekId: sampleDownload.weekId, at: min(sampleDownload.firstAt) })
    .from(sampleDownload)
    .groupBy(sampleDownload.userId, sampleDownload.weekId)
  const results = await db
    .select({
      weekId: result.weekId,
      position: result.position,
      votes: result.votes,
      histogram: result.histogram,
      userId: entry.userId,
      challengeClaimed: entry.challengeClaimed,
    })
    .from(result)
    .innerJoin(week, and(eq(week.id, result.weekId), eq(week.resultRevision, result.revision)))
    .innerJoin(entry, eq(entry.id, result.entryId))
    .where(isNotNull(week.sealedAt))
  const profiles = await db
    .select({
      userId: producerProfile.userId,
      avatarPublicId: producerProfile.avatarPublicId,
      bio: producerProfile.bio,
      links: producerProfile.links,
      createdAt: producerProfile.createdAt,
    })
    .from(producerProfile)
  const ledger = await db
    .select({
      userId: xpEvent.userId,
      kind: xpEvent.kind,
      ref: xpEvent.ref,
      weekId: xpEvent.weekId,
      amount: xpEvent.amount,
      createdAt: xpEvent.createdAt,
    })
    .from(xpEvent)
  const unlocks = await db
    .select({ userId: achievementUnlock.userId, id: achievementUnlock.achievementId })
    .from(achievementUnlock)
  const streaks = await db.select().from(streakState)

  // El oído de oro de las semanas selladas antes del corte (después, el del libro: lo decidió el sellado en vivo).
  const earWinners = new Map<string, Set<string>>()
  for (const w of weeks) {
    if (w.sealedAt === null || w.sealedAt >= cutoff) continue
    const snapshot = await computeSnapshot(db, w.id)
    const perVoter = new Map<string, number>()
    for (const v of snapshot.votes) perVoter.set(v.voterId, (perVoter.get(v.voterId) ?? 0) + 1)
    const winners = [...perVoter]
      .filter(([voterId, n]) => n >= GOLDEN_EAR_MIN_VOTES && accounts.has(voterId))
      .map(([voterId]) => voterId)
      .filter((voterId) => goldenEar(voterId, snapshot.votes).won)
    earWinners.set(w.id, new Set(winners))
  }
  return {
    weeks,
    accounts,
    activated,
    votes,
    downloads,
    results,
    profiles,
    ledger,
    unlocks,
    streaks,
    earWinners,
  }
}

type World = Awaited<ReturnType<typeof loadWorld>>

/** Las temporadas cerradas con sus campeones, su última semana y cuándo se cerraron. */
async function championships(db: Db, world: World, now: number) {
  const bySeason = await championsBySeason(db, now)
  const out = new Map<string, { seasonId: string; lastWeekId: string; at: number }[]>()
  for (const [seasonId, champions] of bySeason) {
    const own = world.weeks.filter((w) => w.seasonId === seasonId)
    const last = own.at(-1)
    if (!last) continue
    // Se cerró al acabar el trimestre o al sellarse la última semana que faltaba, lo que llegara después.
    const at = Math.max(seasonEndsAt(seasonId), ...own.map((w) => w.sealedAt ?? 0))
    for (const userId of champions)
      out.set(userId, [...(out.get(userId) ?? []), { seasonId, lastWeekId: last.id, at }])
  }
  return out
}

/** La primera entrada de cada semana: la del libro si ya la hay, o la que antes llegó a `active` antes del corte. */
function firstEntries(world: World, cutoff: number): Map<string, { userId: string; entryId: string | null }> {
  const out = new Map<string, { userId: string; entryId: string | null }>()
  for (const row of world.ledger)
    if (row.kind === 'first_entry_of_week') out.set(row.ref, { userId: row.userId, entryId: null })
  const sorted = [...world.activated].sort(
    (a, b) => a.submittedAt - b.submittedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  for (const row of sorted) {
    if (out.has(row.weekId) || row.submittedAt >= cutoff || !world.accounts.has(row.userId)) continue
    out.set(row.weekId, { userId: row.userId, entryId: row.id })
  }
  return out
}

/** La historia de una cuenta, para `replayAccount`. */
function historyOf(
  userId: string,
  world: World,
  firsts: ReturnType<typeof firstEntries>,
  champs: Awaited<ReturnType<typeof championships>>,
  cutoff: number,
): AccountHistory {
  const mine = world.activated
    .filter((row) => row.userId === userId)
    .sort((a, b) => a.submittedAt - b.submittedAt || (a.id < b.id ? -1 : 1))
  const firstMine = new Set<string>()
  const entries: HistoryEntry[] = mine.map((row) => {
    const first = firsts.get(row.weekId)
    // Si la fila del libro ya es suya, su primera entrada de esa semana es la que lleva `early_bird`.
    const isFirst =
      first?.userId === userId &&
      (first.entryId === null ? !firstMine.has(row.weekId) : first.entryId === row.id)
    if (isFirst) firstMine.add(row.weekId)
    return { entryId: row.id, weekId: row.weekId, at: row.submittedAt, firstOfWeek: isFirst }
  })
  const votes = world.votes.filter((row) => row.userId === userId)
  const votedWeeks = new Set(votes.map((row) => row.weekId))
  const votable: Record<string, string[]> = {}
  for (const weekId of votedWeeks)
    votable[weekId] = world.activated
      .filter((row) => row.weekId === weekId && row.status === 'active' && row.userId !== userId)
      .map((row) => row.id)

  const qualified = new Map<string, number>()
  const own = new Map<string, SealedEntry>()
  for (const row of world.results) {
    if (row.position !== null) qualified.set(row.weekId, (qualified.get(row.weekId) ?? 0) + 1)
    if (row.userId !== userId) continue
    const w = world.weeks.find((x) => x.id === row.weekId)
    own.set(row.weekId, {
      position: row.position,
      votes: row.votes,
      starsSum: starsOf(JSON.parse(row.histogram) as number[]),
      challengeClaimed: row.challengeClaimed && w?.challenge != null,
    })
  }
  // El oído de oro que ya dice el libro (la suma de la semana, con sus ajustes).
  const earSums = new Map<string, number>()
  for (const row of world.ledger)
    if (row.userId === userId && row.kind === 'golden_ear' && row.weekId !== null)
      earSums.set(row.weekId, (earSums.get(row.weekId) ?? 0) + row.amount)
  const earInLedger = new Set([...earSums].filter(([, amount]) => amount > 0).map(([weekId]) => weekId))
  const sealed: HistorySealedWeek[] = world.weeks
    .filter((w) => w.sealedAt !== null)
    .map((w) => ({
      weekId: w.id,
      number: w.number,
      seasonId: w.seasonId,
      golden: w.golden,
      qualifiedEntries: qualified.get(w.id) ?? 0,
      entry: own.get(w.id) ?? null,
      goldenEar:
        earInLedger.has(w.id) ||
        ((w.sealedAt as number) < cutoff && world.earWinners.get(w.id)?.has(userId) === true),
      sealedAt: w.sealedAt as number,
    }))
  const profile = world.profiles.find((row) => row.userId === userId)
  return {
    weeks: world.weeks.map((w) => ({
      weekId: w.id,
      number: w.number,
      seasonId: w.seasonId,
      golden: w.golden,
      submitEndsAt: w.submitEndsAt,
    })),
    downloads: world.downloads
      .filter((row) => row.userId === userId && typeof row.at === 'number')
      .map((row) => ({ weekId: row.weekId, at: row.at as number })),
    entries,
    votes: votes.map((row) => ({ entryId: row.entryId, weekId: row.weekId, at: row.at })),
    votable,
    sealed,
    championships: champs.get(userId) ?? [],
    profile: profile
      ? {
          hasAvatar: profile.avatarPublicId !== null,
          hasBio: (profile.bio ?? '').trim().length > 0,
          links: Object.keys(parseLinks(profile.links)).length,
          at: profile.createdAt,
        }
      : null,
  }
}

/** Lo que el reprocesado escribe para una cuenta, y lo que suma. */
interface AccountPlan {
  statements: BatchStatement[]
  movements: ReplayedMovement[]
  achievements: ReplayedUnlock[]
  level20: boolean
  xp: number
  streak: boolean
}

function planAccount(
  db: Db,
  userId: string,
  world: World,
  history: AccountHistory,
  firsts: ReturnType<typeof firstEntries>,
  cutoff: number,
  newId: () => string,
): AccountPlan {
  const replayed = replayAccount(history)
  const existing = world.ledger.filter((row) => row.userId === userId)
  const has = new Set(existing.map((row) => `${row.kind}|${row.ref}`))
  const weekKinds = new Set(existing.map((row) => `${row.kind}|${row.weekId}`))
  const sealedAt = new Map(world.weeks.map((w) => [w.id, w.sealedAt]))
  const votesInWeek = new Map<string, number>()
  for (const row of existing)
    if (row.kind === 'vote' && row.weekId !== null)
      votesInWeek.set(row.weekId, (votesInWeek.get(row.weekId) ?? 0) + 1)

  const movements = replayed.movements.filter((m) => {
    switch (m.kind) {
      case 'result':
      case 'golden_ear': {
        const at = sealedAt.get(m.weekId)
        return at != null && at < cutoff && !weekKinds.has(`${m.kind}|${m.weekId}`)
      }
      case 'first_entry_of_week':
        return m.at < cutoff && firsts.get(m.ref)?.userId === userId && !has.has(`${m.kind}|${m.ref}`)
      case 'vote': {
        if (m.at >= cutoff || has.has(`vote|${m.ref}`)) return false
        // El tope de la semana, con lo que ya hay en el libro (también lo escrito en vivo después del corte).
        const done = votesInWeek.get(m.weekId) ?? 0
        if (done >= XP_VOTE_MAX_VOTES_PER_WEEK) return false
        votesInWeek.set(m.weekId, done + 1)
        return true
      }
      default:
        return m.at < cutoff && !has.has(`${m.kind}|${m.ref}`)
    }
  })
  const owned = new Set(world.unlocks.filter((row) => row.userId === userId).map((row) => row.id))
  const achievements = replayed.achievements.filter(
    (a) => !owned.has(a.id) && (a.id !== 'jury_full' || a.at < cutoff),
  )

  // `level_20`: el primer instante en el que el libro, con lo nuevo, llega al nivel 20.
  let level20: { at: number; weekId: string | null } | null = null
  if (!owned.has('level_20')) {
    const timeline = [
      ...existing.map((row) => ({ at: row.createdAt, amount: row.amount, weekId: row.weekId })),
      ...movements.map((m) => ({ at: m.at, amount: m.amount, weekId: m.weekId as string | null })),
      ...achievements.map((a) => ({ at: a.at, amount: achievementXp(a.id), weekId: a.weekId })),
    ].sort((a, b) => a.at - b.at)
    let total = 0
    for (const step of timeline) {
      total += step.amount
      if (total >= LEVEL_20_XP) {
        level20 = { at: step.at, weekId: step.weekId }
        break
      }
    }
  }

  const stored = world.streaks.find((row) => row.userId === userId)
  const streak = stored
    ? !sameStreak(stored, replayed.streak)
    : replayed.streak.best > 0 || replayed.streak.jokerSeason !== null

  // Todo con la condición de que la cuenta exista (si se borra a la vez, no queda nada suyo).
  const guard: Guard = sql`EXISTS (SELECT 1 FROM ${user} WHERE ${user.id} = ${userId})`
  const statements: BatchStatement[] = []
  for (const m of movements)
    statements.push(
      xpMovementStatement(
        db,
        { id: newId(), userId, kind: m.kind, ref: m.ref, weekId: m.weekId, amount: m.amount, now: m.at },
        m.kind === 'vote' ? XP_VOTE_MAX_VOTES_PER_WEEK : undefined,
        guard,
      ),
    )
  for (const a of achievements)
    statements.push(
      ...unlockStatements(
        db,
        { userId, achievementId: a.id, ref: a.ref, weekId: a.weekId, now: a.at, seenAt: a.at },
        { id: newId(), amount: achievementXp(a.id) },
        guard,
      ),
    )
  if (level20)
    statements.push(
      ...level20Statements(
        db,
        { userId, weekId: level20.weekId, now: level20.at, xpId: newId(), amount: achievementXp('level_20') },
        guard,
      ),
      // Ya visto, como el resto de lo pasado.
      db
        .update(achievementUnlock)
        .set({ seenAt: level20.at })
        .where(
          and(
            eq(achievementUnlock.userId, userId),
            eq(achievementUnlock.achievementId, 'level_20'),
            eq(achievementUnlock.unlockedAt, level20.at),
          ),
        ),
    )
  if (streak) statements.push(streakStatement(db, userId, replayed.streak, guard))
  const xp =
    movements.reduce((sum, m) => sum + m.amount, 0) +
    achievements.reduce((sum, a) => sum + achievementXp(a.id), 0) +
    (level20 ? achievementXp('level_20') : 0)
  if (movements.length > 0 || achievements.length > 0 || level20)
    statements.push(refreshXpStatement(db, userId))
  return { statements, movements, achievements, level20: level20 !== null, xp, streak }
}

/**
 * Reprocesa la capa de juego (ver arriba). Con `apply`, toma la *lease* `gameReprocess` (si otro la tiene, devuelve
 * `null` sin hacer nada), guarda el corte, sella lo que ya cerró, escribe un `batch` por cuenta y apunta que ha
 * terminado. Sin `apply`, solo calcula.
 */
export async function reprocessGame(deps: ReprocessDeps): Promise<ReprocessSummary | null> {
  const { db, now, newId, apply } = deps
  const run = async (): Promise<ReprocessSummary> => {
    const { cutoff, stored } = await cutoffOf(db, now)
    // El corte, antes de escribir nada: si esta pasada se corta a medias, la siguiente usa el mismo.
    if (apply && !stored) await runBatch(db, [writeState(db, { before: cutoff }, now)])
    const sealed = apply ? await sealDueWeeks(db, { now, holder: newId(), newId }) : []
    const world = await loadWorld(db, cutoff)
    const firsts = firstEntries(world, cutoff)
    const champs = await championships(db, world, now)
    const people = new Set<string>([
      ...world.activated.map((row) => row.userId),
      ...world.votes.map((row) => row.userId),
      ...world.downloads.map((row) => row.userId),
      ...world.results.map((row) => row.userId),
      ...world.profiles.map((row) => row.userId),
      ...world.streaks.map((row) => row.userId),
      ...champs.keys(),
    ])
    const summary: ReprocessSummary = {
      cutoff,
      applied: apply,
      sealed,
      accounts: 0,
      movements: {},
      achievements: {},
      xp: 0,
      streaks: 0,
    }
    for (const userId of [...people].filter((id) => world.accounts.has(id)).sort()) {
      const history = historyOf(userId, world, firsts, champs, cutoff)
      const plan = planAccount(db, userId, world, history, firsts, cutoff, newId)
      if (plan.statements.length === 0) continue
      if (apply) await runBatch(db, plan.statements)
      if (plan.movements.length > 0 || plan.achievements.length > 0 || plan.level20) summary.accounts += 1
      for (const m of plan.movements) count(summary.movements, m.kind)
      for (const a of plan.achievements) {
        count(summary.movements, 'achievement')
        count(summary.achievements, a.id)
      }
      if (plan.level20) {
        count(summary.movements, 'achievement')
        count(summary.achievements, 'level_20')
      }
      if (plan.streak) summary.streaks += 1
      summary.xp += plan.xp
    }
    if (apply) await runBatch(db, [writeState(db, { before: cutoff, doneAt: now }, now)])
    return summary
  }
  if (!apply) return run()
  return withLease(db, { name: STATE, holder: newId(), ttlMs: LEASE_MS, now }, run)
}
