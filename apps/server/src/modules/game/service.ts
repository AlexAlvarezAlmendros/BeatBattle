import {
  ACHIEVEMENT_IDS,
  type AchievementEvent,
  type AchievementId,
  achievementById,
  evaluate,
  isAchievementId,
  levelOf,
  type StreakState,
  XP_VOTE_MAX_VOTES_PER_WEEK,
  xpFor,
} from '@beatbattle/rules'
import type { GameDelta } from '@beatbattle/shared'
import type { BatchStatement } from '../../db/batch'
import type { Db } from '../../db/client'
import type { XpEventKind } from '../../db/schema'
import {
  existingRefs,
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
 * El módulo `game` (guía §2.10, §4.11; tarea 7.8): prepara las sentencias de la capa de juego de un hecho para que
 * quien lo provoca (el voto, la entrada que pasa a `active`, el sellado…) las meta en **su** `batch`, como la cola de
 * email. Todas son idempotentes (`ON CONFLICT DO NOTHING`): repetir el hecho, re-ejecutar el sellado o reprocesar no
 * cambia el XP de nadie (`RF-GAME-01`). Cada plan acaba con `level_20` (si el XP lo cruza) y con la caché
 * `producer_profile.xp` recalculada como la suma del libro.
 *
 * Los importes y las condiciones son de `@beatbattle/rules` (`xpFor`, `evaluate`); aquí solo se cuenta lo que ya hay
 * en el libro. Nada de esto toca la clasificación (`RF-GAME-10`).
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
  now: number
}

/** Las sentencias para el `batch` del hecho y lo que gana la cuenta (para `game` en la respuesta, 7.9). */
export interface GamePlan {
  statements: BatchStatement[]
  delta: GameDelta
}

/** La primera entrada de la semana es una para toda la batalla: su referencia se mira en todas las cuentas. */
const GLOBAL_KINDS: ReadonlySet<XpEventKind> = new Set(['first_entry_of_week'])

const catalogOrder = (a: AchievementId, b: AchievementId) =>
  ACHIEVEMENT_IDS.indexOf(a) - ACHIEVEMENT_IDS.indexOf(b)

/** XP de un logro: el de su rareza, sin racha ni semana dorada (Anexo B). */
const achievementXp = (id: AchievementId) =>
  xpFor({ kind: 'achievement', rarity: achievementById(id).rarity }, { goldenWeek: false, streakWeeks: 0 })

export function createGameService(deps: GameDeps) {
  const { db } = deps

  async function unlocked(userId: string): Promise<Set<AchievementId>> {
    return new Set([...(await unlockedIds(db, userId))].filter(isAchievementId))
  }

  return {
    /** Los logros que ya tiene la cuenta (el contexto de `evaluate`). */
    unlocked,

    /** El XP del libro de la cuenta. */
    xp: (userId: string) => ledgerXp(db, userId),

    /** La racha guardada (para la racha en juego de `xpFor` y para `advanceStreak` al sellar). */
    streak: (userId: string): Promise<StreakState> => streakOfAccount(db, userId),

    /** La sentencia que guarda la racha tras aplicar una semana sellada. */
    streakStatement: (userId: string, state: StreakState) => streakStatement(db, userId, state),

    /**
     * El XP de un voto (Anexo B, `RF-GAME-03`), contado en el libro: solo el primer voto a cada entrada (quitarlo y volver
     * a votar no suma) y como mucho 40 con XP por semana (también los quitados o anulados, que conservan su fila). El tope
     * va además en la sentencia, por si llegan dos votos a la vez.
     */
    async voteGrant(
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
    },

    /**
     * Prepara la capa de juego de un hecho de una cuenta: los movimientos de XP (sin los de 0), los logros que
     * desbloquean sus eventos (y los ya decididos) con su XP, `level_20` si el total lo cruza y la caché recalculada.
     * Lo que gana (`delta`) es una vista previa con lo que ya hay en el libro; la verdad es el `batch`, que nunca suma
     * dos veces.
     */
    async plan(userId: string, input: GamePlanInput): Promise<GamePlan> {
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
          xpMovementStatement(db, { id: deps.newId(), userId, ...grant, now: input.now }, grant.weeklyCap),
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

      // Los logros: los que dicen sus eventos (sin repetir los que ya tiene) y los ya decididos.
      const wanted: AchievementGrant[] = [...decided]
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
        ...level20Statements(db, {
          userId,
          weekId: weekOfFact,
          now: input.now,
          xpId: deps.newId(),
          amount: level20Xp,
        }),
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
    },
  }
}

export type GameService = ReturnType<typeof createGameService>
