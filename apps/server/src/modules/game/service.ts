import {
  ACHIEVEMENT_IDS,
  type AchievementEvent,
  type AchievementId,
  evaluate,
  isAchievementId,
  isJuryComplete,
  levelOf,
  nightOwlWindow,
  type StreakState,
  streakInPlay,
  streakOf,
  XP_VOTE_MAX_VOTES_PER_WEEK,
  xpFor,
} from '@beatbattle/rules'
import type { BrowserAchievement, GameDelta } from '@beatbattle/shared'
import { and, count, eq, gte, lt, ne, sql } from 'drizzle-orm'
import type { BatchStatement } from '../../db/batch'
import type { Db } from '../../db/client'
import { entry, vote, week, type XpEventKind } from '../../db/schema'
import { sealDueWeeks } from '../weeks/seal'
import {
  achievementXp,
  existingRefs,
  type Guard,
  kindCount,
  LEVEL_20_XP,
  ledgerXp,
  level20Statements,
  refreshXpStatement,
  streakOfAccount,
  streakStatement,
  unlockedIds,
  unlockStatements,
  weeklyCount,
  xpMovementStatement,
} from './repo'

/**
 * El módulo `game` (guía §2.10, §4.11; tareas 7.8 y 7.9): prepara las sentencias de la capa de juego de un hecho para
 * que quien lo provoca (el voto, la entrada que pasa a `active`, la descarga, el perfil…) las meta en **su** `batch`,
 * como la cola de email. Todas son idempotentes (`ON CONFLICT DO NOTHING`): repetir el hecho, re-ejecutar el sellado o
 * reprocesar no cambia el XP de nadie (`RF-GAME-01`). Cada plan acaba con `level_20` (si el XP lo cruza) y con la
 * caché `producer_profile.xp` recalculada como la suma del libro.
 *
 * Los importes y las condiciones son de `@beatbattle/rules` (`xpFor`, `evaluate`); aquí solo se cuenta lo que ya hay
 * en la base de datos. Nada de esto toca la clasificación (`RF-GAME-10`). El sellado tiene su propio módulo
 * (`sealing.ts`, tarea 7.10).
 */

export interface GameDeps {
  db: Db
  newId: () => string
}

/** Un movimiento de XP de un hecho (los del Anexo B; los de los logros los pone el plan). */
export interface XpGrant {
  kind: Exclude<XpEventKind, 'achievement'>
  /** La referencia de su tipo (§4.11): la semana, la entrada… */
  ref: string
  weekId: string | null
  /** El importe de `xpFor`; 0 no deja fila. */
  amount: number
  /** Tope semanal de movimientos de este tipo (40 votos con XP, `RF-GAME-03`), contado en la sentencia. */
  weeklyCap?: number
}

/** Un logro que el hecho desbloquea, con lo que lo desbloqueó y su semana. */
export interface AchievementGrant {
  id: AchievementId
  ref: string | null
  weekId: string | null
  /** Condición propia del logro dentro del `batch` (además de la del hecho): `early_bird`, si la primera entrada es suya. */
  guard?: Guard
}

/** Un evento que puede desbloquear logros (`evaluate`), con su referencia y su semana. */
export interface AchievementTrigger {
  event: AchievementEvent
  ref: string | null
  weekId: string | null
}

export interface GamePlanInput {
  xp?: readonly XpGrant[]
  /** Eventos que se evalúan contra los logros que ya tiene la cuenta. */
  events?: readonly AchievementTrigger[]
  /** Logros ya decididos. */
  achievements?: readonly AchievementGrant[]
  /** Condición del hecho: nada se escribe si no se cumple dentro del `batch` (el voto guardado, la entrada activa). */
  guard?: Guard
  now: number
}

/** Las sentencias para el `batch` del hecho y lo que gana la cuenta (`game` en la respuesta, 7.9). */
export interface GamePlan {
  statements: BatchStatement[]
  delta: GameDelta
}

/** La semana de un hecho, con lo que la capa de juego necesita de ella. */
export interface GameWeek {
  id: string
  number: number
  golden: boolean
  submitEndsAt: number
}

/** La primera entrada de la semana es una para toda la batalla: su referencia se mira en todas las cuentas. */
const GLOBAL_KINDS: ReadonlySet<XpEventKind> = new Set(['first_entry_of_week'])

const catalogOrder = (a: AchievementId, b: AchievementId) =>
  ACHIEVEMENT_IDS.indexOf(a) - ACHIEVEMENT_IDS.indexOf(b)

const and2 = (a: Guard, b: Guard): Guard => (a && b ? sql`(${a}) AND (${b})` : (a ?? b))

export function createGameService(deps: GameDeps) {
  const { db } = deps

  async function unlocked(userId: string): Promise<Set<AchievementId>> {
    return new Set([...(await unlockedIds(db, userId))].filter(isAchievementId))
  }

  /**
   * El XP de un voto (Anexo B, `RF-GAME-03`), contado en el libro: solo el primer voto a cada entrada (quitarlo y volver
   * a votar no suma) y como mucho 40 con XP por semana (también los quitados o anulados, que conservan su fila). El tope
   * va además en la sentencia, por si llegan dos votos a la vez.
   */
  async function voteGrant(
    userId: string,
    input: { entryId: string; weekId: string; goldenWeek: boolean },
  ): Promise<XpGrant> {
    const voted = await existingRefs(db, userId, 'vote', [input.entryId])
    const votesWithXpThisWeek = await weeklyCount(db, userId, 'vote', input.weekId)
    const amount = xpFor(
      { kind: 'vote', firstVoteToEntry: !voted.has(input.entryId), votesWithXpThisWeek },
      { goldenWeek: input.goldenWeek, streakWeeks: 0 },
    )
    return {
      kind: 'vote',
      ref: input.entryId,
      weekId: input.weekId,
      amount,
      weeklyCap: XP_VOTE_MAX_VOTES_PER_WEEK,
    }
  }

  /**
   * Prepara la capa de juego de un hecho de una cuenta: los movimientos de XP (sin los de 0), los logros que
   * desbloquean sus eventos (y los ya decididos) con su XP, `level_20` si el total lo cruza y la caché recalculada.
   * Lo que gana (`delta`) es una vista previa con lo que ya hay en el libro; la verdad es el `batch`, que nunca suma
   * dos veces ni escribe nada si el hecho no ocurre (`guard`).
   */
  async function plan(userId: string, input: GamePlanInput): Promise<GamePlan> {
    const grants = (input.xp ?? []).filter((grant) => {
      if (!Number.isSafeInteger(grant.amount) || grant.amount < 0)
        throw new RangeError(`XP de ${grant.kind}:${grant.ref} no es un entero ≥ 0`)
      return grant.amount > 0
    })
    const triggers = input.events ?? []
    const decided = input.achievements ?? []
    const before = await ledgerXp(db, userId)
    if (grants.length === 0 && triggers.length === 0 && decided.length === 0)
      return { statements: [], delta: { xp: 0, achievements: [], level: levelOf(before) } }

    const owned = await unlocked(userId)
    const known = new Set(owned)
    const statements: BatchStatement[] = []
    let gained = 0

    // Los movimientos del hecho, y en la vista previa solo los que aún no están (ni pasan el tope).
    const present = new Map<XpEventKind, Set<string>>()
    for (const kind of new Set(grants.map((grant) => grant.kind))) {
      const refs = grants.filter((grant) => grant.kind === kind).map((grant) => grant.ref)
      present.set(kind, await existingRefs(db, GLOBAL_KINDS.has(kind) ? null : userId, kind, refs))
    }
    const weekly = new Map<string, number>()
    for (const grant of grants) {
      statements.push(
        xpMovementStatement(
          db,
          { id: deps.newId(), userId, ...grant, now: input.now },
          grant.weeklyCap,
          input.guard,
        ),
      )
      const seen = present.get(grant.kind) as Set<string>
      if (seen.has(grant.ref)) continue
      if (grant.weeklyCap !== undefined && grant.weekId !== null) {
        const key = `${grant.kind}:${grant.weekId}`
        const done = weekly.get(key) ?? (await weeklyCount(db, userId, grant.kind, grant.weekId))
        if (done >= grant.weeklyCap) continue
        weekly.set(key, done + 1)
      }
      seen.add(grant.ref)
      gained += grant.amount
    }

    // Los logros: los ya decididos y los que dicen sus eventos (sin repetir los que ya tiene).
    const wanted: AchievementGrant[] = [...decided]
    for (const grant of decided) known.add(grant.id)
    for (const trigger of triggers)
      for (const id of evaluate(trigger.event, { unlocked: known })) {
        wanted.push({ id, ref: trigger.ref, weekId: trigger.weekId })
        known.add(id)
      }
    const fresh: AchievementId[] = []
    for (const grant of wanted) {
      const amount = achievementXp(grant.id)
      statements.push(
        ...unlockStatements(
          db,
          { userId, achievementId: grant.id, ref: grant.ref, weekId: grant.weekId, now: input.now },
          { id: deps.newId(), amount },
          and2(input.guard, grant.guard),
        ),
      )
      if (owned.has(grant.id) || fresh.includes(grant.id)) continue
      fresh.push(grant.id)
      gained += amount
    }

    // `level_20`, con todo lo anterior ya en el libro; y la caché, la última.
    const weekOfFact = grants.find((g) => g.weekId)?.weekId ?? wanted.find((g) => g.weekId)?.weekId ?? null
    const level20Xp = achievementXp('level_20')
    statements.push(
      ...level20Statements(
        db,
        { userId, weekId: weekOfFact, now: input.now, xpId: deps.newId(), amount: level20Xp },
        input.guard,
      ),
      refreshXpStatement(db, userId),
    )
    if (!owned.has('level_20') && !fresh.includes('level_20') && before + gained >= LEVEL_20_XP) {
      fresh.push('level_20')
      gained += level20Xp
    }
    return {
      statements,
      delta: { xp: gained, achievements: fresh.sort(catalogOrder), level: levelOf(before + gained) },
    }
  }

  /**
   * La racha que dejan las semanas selladas antes de la semana `number` (§2.10): semanas consecutivas por su número con
   * entrada clasificada en la revisión vigente del snapshot. Antes sella, de forma perezosa, lo que haya cerrado: la
   * semana anterior a una en juego siempre ha cerrado ya, y tiene que contar.
   */
  async function streakBefore(userId: string, number: number, now: number): Promise<StreakState> {
    await sealDueWeeks(db, { now, holder: deps.newId(), newId: deps.newId })
    // Con los nombres de las tablas escritos: dentro de la subconsulta, Drizzle no cualifica las columnas de `week`.
    const qualified = sql<number>`EXISTS (
      SELECT 1 FROM result INNER JOIN entry ON entry.id = result.entry_id
      WHERE result.week_id = week.id AND result.revision = week.result_revision
        AND entry.user_id = ${userId} AND result.position IS NOT NULL
    )`
    const rows = await db
      .select({ number: week.number, seasonId: week.seasonId, qualified })
      .from(week)
      .where(and(sql`${week.sealedAt} IS NOT NULL`, lt(week.number, number)))
      .orderBy(week.number)
    return streakOf(rows.map((row) => ({ ...row, qualified: Boolean(row.qualified) })))
  }

  return {
    /** Los logros que ya tiene la cuenta (el contexto de `evaluate`). */
    unlocked,

    /** El XP del libro de la cuenta. */
    xp: (userId: string) => ledgerXp(db, userId),

    /** La racha guardada (la caché de `streak_state`, que escribe el sellado). */
    streak: (userId: string): Promise<StreakState> => streakOfAccount(db, userId),

    /** La sentencia que guarda la racha tras aplicar una semana sellada. */
    streakStatement: (userId: string, state: StreakState) => streakStatement(db, userId, state),

    voteGrant,
    plan,
    streakBefore,

    /** Nada que ganar: lo que dice la respuesta de un hecho que no da XP (una entrada que queda en `processing`). */
    async idle(userId: string): Promise<GameDelta> {
      return { xp: 0, achievements: [], level: levelOf(await ledgerXp(db, userId)) }
    },

    /**
     * La entrada que pasa a `active` (§2.10, §4.8.4 paso 4; tarea 7.9): el XP de subir con la racha en juego (una vez
     * por semana), la primera entrada de la semana (la que gana su fila del libro, con `early_bird`), y los logros de
     * subir (`first_entry`, `entries_10/50`, `last_minute`, `golden_week`). Nada si la entrada no queda activa.
     */
    async entryActivated(
      userId: string,
      input: { entryId: string; week: GameWeek; submittedAt: number; now: number },
    ): Promise<GamePlan> {
      const { entryId, week: w, now } = input
      const streak = await streakBefore(userId, w.number, now)
      const context = { goldenWeek: w.golden, streakWeeks: streakInPlay(streak) }
      const firstTaken = await existingRefs(db, null, 'first_entry_of_week', [w.id])
      const firstMine = await existingRefs(db, userId, 'first_entry_of_week', [w.id])
      const firstOfWeek = firstTaken.size === 0 || firstMine.size > 0
      const already = await existingRefs(db, userId, 'entry', [w.id])
      // «Entradas» son las semanas con una entrada que llegó a `active` (Anexo C): las filas `entry` del libro.
      const entriesTotal = (await kindCount(db, userId, 'entry')) + (already.size > 0 ? 0 : 1)
      const isFirstMine = sql`EXISTS (
        SELECT 1 FROM xp_event
        WHERE xp_event.kind = 'first_entry_of_week' AND xp_event.ref = ${w.id} AND xp_event.user_id = ${userId}
      )`
      return plan(userId, {
        xp: [
          { kind: 'entry', ref: w.id, weekId: w.id, amount: xpFor({ kind: 'entry' }, context) },
          {
            kind: 'first_entry_of_week',
            ref: w.id,
            weekId: w.id,
            amount: xpFor({ kind: 'firstEntryOfWeek' }, context),
          },
        ],
        events: [
          {
            event: {
              kind: 'entryActivated',
              entriesTotal,
              // `early_bird` va aparte, atado a la fila de la primera entrada (dos a la vez no lo ganan las dos).
              firstOfWeek: false,
              submittedAt: input.submittedAt,
              submitEndsAt: w.submitEndsAt,
              goldenWeek: w.golden,
            },
            ref: entryId,
            weekId: w.id,
          },
        ],
        achievements: firstOfWeek
          ? [{ id: 'early_bird', ref: entryId, weekId: w.id, guard: isFirstMine }]
          : [],
        guard: sql`EXISTS (SELECT 1 FROM entry WHERE entry.id = ${entryId} AND entry.status = 'active')`,
        now,
      })
    },

    /**
     * El voto (§2.7, §2.10; tarea 7.9): 5 XP si es el primero a esa entrada y no pasa el tope, el jurado completo al
     * votar la última de las activas ajenas (50 XP una vez por semana y `jury_full`) y los logros de votar
     * (`first_vote`, `votes_100/1000`, `night_owl`). Nada si el voto no queda guardado en el `batch`.
     */
    async voteCast(
      userId: string,
      input: { entryId: string; weekId: string; golden: boolean; isNew: boolean; now: number },
    ): Promise<GamePlan> {
      const { entryId, weekId, isNew, now } = input
      const added = isNew ? 1 : 0
      const [mine] = await db.select({ n: count() }).from(vote).where(eq(vote.userId, userId))
      // Votos nuevos (no cambios) a entradas distintas en la franja de `night_owl` de esta noche, este incluido.
      const window = nightOwlWindow(now)
      const [night] = window
        ? await db
            .select({ n: count() })
            .from(vote)
            .where(
              and(
                eq(vote.userId, userId),
                gte(vote.createdAt, window.startsAt),
                lt(vote.createdAt, window.endsAt),
              ),
            )
        : []
      const nightVotes = window ? (night?.n ?? 0) + added : 0
      const others = and(eq(entry.weekId, weekId), eq(entry.status, 'active'), ne(entry.userId, userId))
      const [votable] = await db.select({ n: count() }).from(entry).where(others)
      const [voted] = await db
        .select({ n: count() })
        .from(vote)
        .innerJoin(entry, eq(entry.id, vote.entryId))
        .where(and(eq(vote.userId, userId), others))
      const votableEntries = votable?.n ?? 0
      const votedEntries = Math.min(votableEntries, (voted?.n ?? 0) + added)
      const context = { goldenWeek: input.golden, streakWeeks: 0 }
      return plan(userId, {
        xp: [
          await voteGrant(userId, { entryId, weekId, goldenWeek: input.golden }),
          {
            kind: 'jury_complete',
            ref: weekId,
            weekId,
            amount: isJuryComplete(votedEntries, votableEntries)
              ? xpFor({ kind: 'juryComplete', votedEntries, votableEntries }, context)
              : 0,
          },
        ],
        events: [
          {
            event: {
              kind: 'voteCast',
              votesTotal: (mine?.n ?? 0) + added,
              castAt: now,
              nightVotes,
              votedEntries,
              votableEntries,
            },
            ref: entryId,
            weekId,
          },
        ],
        guard: sql`EXISTS (
          SELECT 1 FROM vote
          WHERE vote.user_id = ${userId} AND vote.entry_id = ${entryId} AND vote.updated_at = ${now}
        )`,
        now,
      })
    },

    /** La descarga del sample (`first_drop`; tarea 7.9). */
    sampleDownloaded(userId: string, input: { weekId: string; now: number }): Promise<GamePlan> {
      return plan(userId, {
        events: [{ event: { kind: 'sampleDownloaded' }, ref: input.weekId, weekId: input.weekId }],
        now: input.now,
      })
    },

    /**
     * Un logro que declara el navegador (tarea 7.14): solo los de la lista blanca, y solo su logro (sin XP de ningún
     * evento del Anexo B). `share_card` es «compartir una tarjeta» (`cardShared`).
     */
    declared(userId: string, input: { achievement: BrowserAchievement; now: number }): Promise<GamePlan> {
      const events: Record<BrowserAchievement, AchievementEvent> = { share_card: { kind: 'cardShared' } }
      return plan(userId, {
        events: [{ event: events[input.achievement], ref: null, weekId: null }],
        now: input.now,
      })
    },

    /** El perfil guardado, con lo que queda en él (`profile_done`: avatar, bio y un enlace; tarea 7.9). */
    profileUpdated(
      userId: string,
      input: { hasAvatar: boolean; hasBio: boolean; links: number; now: number },
    ): Promise<GamePlan> {
      const { now, ...profile } = input
      return plan(userId, {
        events: [{ event: { kind: 'profileUpdated', ...profile }, ref: null, weekId: null }],
        now,
      })
    },
  }
}

export type GameService = ReturnType<typeof createGameService>
