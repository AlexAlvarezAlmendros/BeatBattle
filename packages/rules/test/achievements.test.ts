import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENTS,
  type AchievementContext,
  type AchievementEvent,
  type AchievementId,
  achievementById,
  evaluate,
  isAchievementId,
  isRevetllaNight,
  nightOwlWindow,
  type PreviousEntry,
  type SealedEntry,
} from '../src/achievements'
import type { AchievementRarity } from '../src/balance'
import { type LocalDate, scheduleWeek, zonedInstant } from '../src/calendar'

// El Anexo C, copiado de la guía: id, rareza y si es oculto (🔒).
const ANNEX_C: readonly [AchievementId, AchievementRarity, boolean][] = [
  ['first_drop', 'common', false],
  ['first_entry', 'common', false],
  ['profile_done', 'common', false],
  ['first_vote', 'common', false],
  ['share_card', 'common', false],
  ['early_bird', 'rare', false],
  ['streak_3', 'rare', false],
  ['entries_10', 'rare', false],
  ['jury_full', 'rare', false],
  ['votes_100', 'rare', false],
  ['podium', 'rare', false],
  ['challenge', 'rare', false],
  ['streak_8', 'epic', false],
  ['entries_50', 'epic', false],
  ['win', 'epic', false],
  ['unanimous', 'epic', false],
  ['votes_1000', 'epic', false],
  ['golden_ear', 'epic', false],
  ['label_pick', 'epic', false],
  ['streak_26', 'legendary', false],
  ['win_3', 'legendary', false],
  ['season_champ', 'legendary', false],
  ['level_20', 'legendary', false],
  ['last_minute', 'rare', true],
  ['night_owl', 'rare', true],
  ['scratch', 'rare', true],
  ['konami', 'rare', true],
  ['pad_404', 'rare', true],
  ['screwed', 'rare', true],
  ['human_metronome', 'epic', true],
  ['detective', 'epic', true],
  ['comeback', 'epic', true],
  ['golden_week', 'epic', true],
  ['double', 'legendary', true],
  ['oracle', 'legendary', true],
  ['revetlla', 'rare', true],
]

const none: AchievementContext = { unlocked: new Set() }
const madrid = (date: LocalDate, hour: number, minute = 0, second = 0) =>
  zonedInstant(date, { hour, minute, second })

const WEEK = scheduleWeek({ year: 2026, month: 11, day: 16 })
const THURSDAY: LocalDate = { year: 2026, month: 11, day: 19 }

const entryActivated = (
  over: Partial<Extract<AchievementEvent, { kind: 'entryActivated' }>> = {},
): AchievementEvent => ({
  kind: 'entryActivated',
  entriesTotal: 2,
  firstOfWeek: false,
  submittedAt: madrid(THURSDAY, 12),
  submitEndsAt: WEEK.submitEndsAt,
  goldenWeek: false,
  ...over,
})
const voteCast = (over: Partial<Extract<AchievementEvent, { kind: 'voteCast' }>> = {}): AchievementEvent => ({
  kind: 'voteCast',
  votesTotal: 2,
  castAt: madrid(THURSDAY, 12),
  nightVotes: 0,
  votedEntries: 2,
  votableEntries: 12,
  ...over,
})
const profile = (hasAvatar: boolean, hasBio: boolean, links: number): AchievementEvent => ({
  kind: 'profileUpdated',
  hasAvatar,
  hasBio,
  links,
})
const entry = (over: Partial<SealedEntry> = {}): SealedEntry => ({
  position: 20,
  votes: 5,
  starsSum: 15,
  challengeClaimed: false,
  ...over,
})
const previous = (position: number | null, qualifiedEntries: number): PreviousEntry => ({
  position,
  qualifiedEntries,
})
const sealed = (over: Partial<Extract<AchievementEvent, { kind: 'weekSealed' }>> = {}): AchievementEvent => ({
  kind: 'weekSealed',
  entry: entry(),
  previousEntry: null,
  winsTotal: 0,
  streak: 1,
  goldenEarStreak: 0,
  ...over,
})
const secret = (evidence: Record<string, unknown> & { secret: string }) =>
  ({ kind: 'secretFound', ...evidence }) as AchievementEvent
const sevenClicks = (spanMs: number) => Array.from({ length: 7 }, (_, i) => 1_000 + (spanMs * i) / 6)
const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
]
const JUNE_23: LocalDate = { year: 2026, month: 6, day: 23 }
const JUNE_24: LocalDate = { year: 2026, month: 6, day: 24 }

/** La condición de cada logro: eventos que lo desbloquean y eventos parecidos que no. */
const CASES: Record<AchievementId, { what: string; yes: AchievementEvent[]; no: AchievementEvent[] }> = {
  first_drop: { what: 'descargar tu primer sample', yes: [{ kind: 'sampleDownloaded' }], no: [voteCast()] },
  first_entry: {
    what: 'subir tu primera entrada',
    yes: [entryActivated({ entriesTotal: 1 }), entryActivated({ entriesTotal: 7 })],
    no: [voteCast(), { kind: 'sampleDownloaded' }],
  },
  profile_done: {
    what: 'perfil con avatar, bio y un enlace',
    yes: [profile(true, true, 1), profile(true, true, 4)],
    no: [profile(false, true, 1), profile(true, false, 1), profile(true, true, 0)],
  },
  first_vote: { what: 'emitir tu primer voto', yes: [voteCast({ votesTotal: 1 })], no: [entryActivated()] },
  share_card: {
    what: 'compartir una tarjeta',
    yes: [{ kind: 'cardShared' }],
    no: [{ kind: 'sampleDownloaded' }],
  },
  early_bird: {
    what: 'la primera entrada de la semana',
    yes: [entryActivated({ firstOfWeek: true })],
    no: [entryActivated({ firstOfWeek: false })],
  },
  streak_3: {
    what: 'racha de 3',
    yes: [sealed({ streak: 3 }), sealed({ streak: 9 })],
    no: [sealed({ streak: 2 })],
  },
  entries_10: {
    what: '10 entradas',
    yes: [entryActivated({ entriesTotal: 10 })],
    no: [entryActivated({ entriesTotal: 9 })],
  },
  jury_full: {
    what: 'votar todas las entradas ajenas de la semana, con 5 o más',
    yes: [
      voteCast({ votedEntries: 5, votableEntries: 5 }),
      voteCast({ votedEntries: 23, votableEntries: 23 }),
    ],
    no: [
      voteCast({ votedEntries: 4, votableEntries: 4 }),
      voteCast({ votedEntries: 22, votableEntries: 23 }),
    ],
  },
  votes_100: { what: '100 votos', yes: [voteCast({ votesTotal: 100 })], no: [voteCast({ votesTotal: 99 })] },
  podium: {
    what: 'top 3 (ex aequo incluidos)',
    yes: [sealed({ entry: entry({ position: 3 }) }), sealed({ entry: entry({ position: 1 }) })],
    no: [
      sealed({ entry: entry({ position: 4 }) }),
      sealed({ entry: entry({ position: null }) }),
      sealed({ entry: null }),
    ],
  },
  challenge: {
    what: 'marcar el reto extra y quedar en el top 10',
    yes: [
      sealed({ entry: entry({ challengeClaimed: true, position: 10 }) }),
      sealed({ entry: entry({ challengeClaimed: true, position: 1 }) }),
    ],
    no: [
      sealed({ entry: entry({ challengeClaimed: true, position: 11 }) }),
      sealed({ entry: entry({ challengeClaimed: true, position: null }) }),
      sealed({ entry: entry({ challengeClaimed: false, position: 1 }) }),
      sealed({ entry: null }),
    ],
  },
  streak_8: { what: 'racha de 8', yes: [sealed({ streak: 8 })], no: [sealed({ streak: 7 })] },
  entries_50: {
    what: '50 entradas',
    yes: [entryActivated({ entriesTotal: 50 })],
    no: [entryActivated({ entriesTotal: 49 })],
  },
  win: {
    what: 'ganar una semana (ex aequo incluido)',
    yes: [sealed({ entry: entry({ position: 1 }), winsTotal: 1 })],
    no: [sealed({ entry: entry({ position: 2 }) }), sealed({ entry: entry({ position: null }) })],
  },
  unanimous: {
    what: 'media ≥ 4,8 con ≥ 10 votos',
    yes: [
      sealed({ entry: entry({ votes: 10, starsSum: 48 }) }),
      sealed({ entry: entry({ votes: 12, starsSum: 58 }) }),
    ],
    no: [
      sealed({ entry: entry({ votes: 10, starsSum: 47 }) }),
      sealed({ entry: entry({ votes: 9, starsSum: 45 }) }),
      sealed({ entry: null }),
    ],
  },
  votes_1000: {
    what: '1.000 votos',
    yes: [voteCast({ votesTotal: 1000 })],
    no: [voteCast({ votesTotal: 999 })],
  },
  golden_ear: {
    what: 'oído de oro en una semana',
    yes: [sealed({ goldenEarStreak: 1 }), sealed({ goldenEarStreak: 4 })],
    no: [sealed({ goldenEarStreak: 0 })],
  },
  label_pick: {
    what: 'recibir la Elección del sello',
    yes: [{ kind: 'labelPicked' }],
    no: [{ kind: 'cardShared' }],
  },
  streak_26: { what: 'racha de 26', yes: [sealed({ streak: 26 })], no: [sealed({ streak: 25 })] },
  win_3: { what: '3 victorias', yes: [sealed({ winsTotal: 3 })], no: [sealed({ winsTotal: 2 })] },
  season_champ: {
    what: 'ganar una temporada (o empatar en la 1.ª)',
    yes: [{ kind: 'seasonClosed', champion: true }],
    no: [{ kind: 'seasonClosed', champion: false }],
  },
  level_20: {
    what: 'llegar al nivel 20',
    yes: [
      { kind: 'xpChanged', xp: 16_700 },
      { kind: 'xpChanged', xp: 40_000 },
    ],
    no: [{ kind: 'xpChanged', xp: 16_699 }],
  },
  last_minute: {
    what: 'subir en los 10 min antes del cierre de envíos',
    yes: [
      entryActivated({ submittedAt: WEEK.submitEndsAt - 600_000 }),
      entryActivated({ submittedAt: WEEK.submitEndsAt - 1 }),
    ],
    no: [
      entryActivated({ submittedAt: WEEK.submitEndsAt - 600_001 }),
      entryActivated({ submittedAt: WEEK.submitEndsAt }),
    ],
  },
  night_owl: {
    what: 'votar 10 entradas entre las 03:00 y las 05:00 (Madrid)',
    yes: [
      voteCast({ castAt: madrid(THURSDAY, 4), nightVotes: 10 }),
      voteCast({ castAt: madrid(THURSDAY, 3), nightVotes: 12 }),
    ],
    no: [
      voteCast({ castAt: madrid(THURSDAY, 4), nightVotes: 9 }),
      voteCast({ castAt: madrid(THURSDAY, 5), nightVotes: 10 }),
      voteCast({ castAt: madrid(THURSDAY, 2, 59, 59), nightVotes: 10 }),
    ],
  },
  scratch: {
    what: '7 clics en el logo en 3 s',
    yes: [
      secret({ secret: 'scratch', clickTimes: sevenClicks(3000) }),
      secret({ secret: 'scratch', clickTimes: [0, 5000, ...sevenClicks(1200).map((t) => t + 9000)] }),
    ],
    no: [
      secret({ secret: 'scratch', clickTimes: sevenClicks(3001) }),
      secret({ secret: 'scratch', clickTimes: sevenClicks(1000).slice(1) }),
      secret({ secret: 'konami', keys: [] }),
    ],
  },
  konami: {
    what: 'la secuencia ↑↑↓↓←→←→BA',
    yes: [
      secret({ secret: 'konami', keys: [...KONAMI, 'b', 'a'] }),
      secret({ secret: 'konami', keys: ['x', 'Enter', ...KONAMI, 'B', 'A'] }),
    ],
    no: [
      secret({ secret: 'konami', keys: [...KONAMI, 'a', 'b'] }),
      secret({ secret: 'konami', keys: [...KONAMI.slice(1), 'b', 'a'] }),
      secret({ secret: 'konami', keys: [...KONAMI, 'b', 'a', 'x'] }),
    ],
  },
  pad_404: {
    what: 'grabar un bucle en el beat pad del 404',
    yes: [secret({ secret: 'pad_404', loopHits: 1 }), secret({ secret: 'pad_404', loopHits: 16 })],
    no: [secret({ secret: 'pad_404', loopHits: 0 })],
  },
  screwed: {
    what: 'mantener Espacio sobre el vinilo 5 s',
    yes: [secret({ secret: 'screwed', holdMs: 5000 })],
    no: [secret({ secret: 'screwed', holdMs: 4999 })],
  },
  human_metronome: {
    what: 'acertar el BPM del sample (±1) con 8 pulsos',
    yes: [
      secret({ secret: 'human_metronome', taps: 8, tappedBpm: 91, sampleBpm: 90 }),
      secret({ secret: 'human_metronome', taps: 12, tappedBpm: 89.4, sampleBpm: 90 }),
    ],
    no: [
      secret({ secret: 'human_metronome', taps: 8, tappedBpm: 88.9, sampleBpm: 90 }),
      secret({ secret: 'human_metronome', taps: 7, tappedBpm: 90, sampleBpm: 90 }),
      secret({ secret: 'human_metronome', taps: 8, tappedBpm: 90, sampleBpm: null }),
    ],
  },
  detective: {
    what: 'acertar 5 productores',
    yes: [{ kind: 'guessResolved', correctTotal: 5 }],
    no: [{ kind: 'guessResolved', correctTotal: 4 }],
  },
  comeback: {
    what: 'de la mitad baja a top 3 en semanas consecutivas',
    yes: [
      sealed({ entry: entry({ position: 3 }), previousEntry: previous(6, 10) }),
      sealed({ entry: entry({ position: 1 }), previousEntry: previous(4, 5) }),
    ],
    no: [
      // La 5.ª de 10 y la 3.ª de 5 no están por debajo de la mediana.
      sealed({ entry: entry({ position: 3 }), previousEntry: previous(5, 10) }),
      sealed({ entry: entry({ position: 3 }), previousEntry: previous(3, 5) }),
      sealed({ entry: entry({ position: 4 }), previousEntry: previous(10, 10) }),
      sealed({ entry: entry({ position: 2 }), previousEntry: previous(null, 10) }),
      sealed({ entry: entry({ position: 2 }), previousEntry: null }),
    ],
  },
  golden_week: {
    what: 'participar en una semana dorada',
    yes: [entryActivated({ goldenWeek: true })],
    no: [entryActivated({ goldenWeek: false })],
  },
  double: {
    what: 'ganar dos semanas seguidas',
    yes: [sealed({ entry: entry({ position: 1 }), previousEntry: previous(1, 8) })],
    no: [
      sealed({ entry: entry({ position: 1 }), previousEntry: previous(2, 8) }),
      sealed({ entry: entry({ position: 2 }), previousEntry: previous(1, 8) }),
      sealed({ entry: entry({ position: 1 }), previousEntry: null }),
    ],
  },
  oracle: {
    what: 'oído de oro 3 semanas seguidas',
    yes: [sealed({ goldenEarStreak: 3 })],
    no: [sealed({ goldenEarStreak: 2 })],
  },
  revetlla: {
    what: 'visitar la web la noche del 23 de junio (Madrid)',
    yes: [
      secret({ secret: 'revetlla', at: madrid(JUNE_23, 21) }),
      secret({ secret: 'revetlla', at: madrid(JUNE_24, 5, 59, 59) }),
    ],
    no: [
      secret({ secret: 'revetlla', at: madrid(JUNE_23, 20, 59, 59) }),
      secret({ secret: 'revetlla', at: madrid(JUNE_24, 6) }),
      secret({ secret: 'revetlla', at: madrid({ year: 2026, month: 12, day: 23 }, 22) }),
    ],
  },
}

describe('catálogo de logros', () => {
  it('RF-GAME-05: los 36 logros del Anexo C, en su orden, con su rareza y si son ocultos', () => {
    expect(ACHIEVEMENTS.map((a) => [a.id, a.rarity, a.hidden])).toEqual(ANNEX_C)
    expect(ACHIEVEMENT_IDS).toEqual(ANNEX_C.map(([id]) => id))
    expect(new Set(ACHIEVEMENT_IDS).size).toBe(36)
  })

  it('RF-GAME-05: los ocultos llevan la clave de su pista; los visibles, no', () => {
    for (const a of ACHIEVEMENTS) expect(a.hintKey, a.id).toBe(a.hidden ? `achievement.${a.id}.hint` : null)
  })

  it('RF-GAME-05: los disparadores de los secretos y de «Adivina el productor» son de la F8; la Elección del sello, de la F9', () => {
    const byPhase = (phase: number) =>
      ACHIEVEMENTS.filter((a) => a.phase === phase)
        .map((a) => a.id)
        .sort()
    expect(byPhase(8)).toEqual([
      'detective',
      'human_metronome',
      'konami',
      'pad_404',
      'revetlla',
      'scratch',
      'screwed',
    ])
    expect(byPhase(9)).toEqual(['label_pick'])
  })

  it('cada logro tiene al menos un evento que lo mira, y el catálogo está congelado', () => {
    expect(Object.isFrozen(ACHIEVEMENTS)).toBe(true)
    for (const a of ACHIEVEMENTS) {
      expect(a.events.length, a.id).toBeGreaterThan(0)
      expect(Object.isFrozen(a)).toBe(true)
      expect(achievementById(a.id)).toBe(a)
    }
    expect(isAchievementId('night_owl')).toBe(true)
    expect(isAchievementId('nope')).toBe(false)
    expect(isAchievementId(7)).toBe(false)
  })
})

describe('condiciones de los logros (Anexo C)', () => {
  it('hay un caso para cada logro del catálogo', () => {
    expect(Object.keys(CASES).sort()).toEqual([...ACHIEVEMENT_IDS].sort())
  })

  it.each(ACHIEVEMENT_IDS.map((id) => [id, CASES[id].what] as const))('RF-GAME-05: %s — %s', (id) => {
    const { yes, no } = CASES[id]
    expect(yes.length).toBeGreaterThan(0)
    expect(no.length).toBeGreaterThan(0)
    for (const event of yes) expect(evaluate(event, none), JSON.stringify(event)).toContain(id)
    for (const event of no) expect(evaluate(event, none), JSON.stringify(event)).not.toContain(id)
    // Sin duplicados: si ya lo tiene, no vuelve.
    for (const event of yes) expect(evaluate(event, { unlocked: new Set([id]) })).not.toContain(id)
  })
})

describe('evaluate', () => {
  const allEvents = Object.values(CASES).flatMap((c) => [...c.yes, ...c.no])

  it('RF-GAME-05: sin duplicados, en el orden del catálogo y solo los logros que miran ese evento', () => {
    fc.assert(
      fc.property(fc.constantFrom(...allEvents), fc.subarray([...ACHIEVEMENT_IDS]), (event, unlocked) => {
        const found = evaluate(event, { unlocked: new Set(unlocked) })
        expect(new Set(found).size).toBe(found.length)
        for (const id of found) {
          expect(unlocked).not.toContain(id)
          expect(achievementById(id).events).toContain(event.kind)
        }
        const positions = found.map((id) => ACHIEVEMENT_IDS.indexOf(id))
        expect(positions).toEqual([...positions].sort((a, b) => a - b))
        // Lo que ya tenía más lo nuevo es lo mismo que evaluar sin nada y quitar lo que tenía.
        expect(found).toEqual(evaluate(event, none).filter((id) => !unlocked.includes(id)))
      }),
    )
  })

  it('RF-GAME-05: un evento puede desbloquear varios a la vez (el primer voto de una noche de búho)', () => {
    const event = voteCast({ votesTotal: 100, castAt: madrid(THURSDAY, 4), nightVotes: 10 })
    expect(evaluate(event, { unlocked: new Set(['first_vote']) })).toEqual(['votes_100', 'night_owl'])
    // Una victoria con racha de 3, tras otra victoria y desde la mitad baja no: la anterior fue 1.ª.
    const win = sealed({
      entry: entry({ position: 1 }),
      previousEntry: previous(1, 9),
      winsTotal: 3,
      streak: 3,
    })
    expect(evaluate(win, none)).toEqual(['streak_3', 'podium', 'win', 'win_3', 'double'])
  })

  it('RF-GAME-05: más votos, entradas o racha nunca desbloquean menos', () => {
    fc.assert(
      fc.property(fc.nat(1200), fc.nat(1200), (a, b) => {
        const [low, high] = a <= b ? [a, b] : [b, a]
        const fewer = evaluate(voteCast({ votesTotal: low }), none)
        const more = evaluate(voteCast({ votesTotal: high }), none)
        for (const id of fewer) expect(more).toContain(id)
        const shorter = evaluate(sealed({ streak: Math.min(low, 40) }), none)
        const longer = evaluate(sealed({ streak: Math.min(high, 40) }), none)
        for (const id of shorter) expect(longer).toContain(id)
      }),
    )
  })

  it('rechaza recuentos imposibles', () => {
    expect(() => evaluate(voteCast({ votesTotal: -1 }), none)).toThrow(RangeError)
    expect(() => evaluate(entryActivated({ entriesTotal: 1.5 }), none)).toThrow(RangeError)
    expect(() => evaluate(sealed({ streak: Number.NaN }), none)).toThrow(RangeError)
    expect(() => evaluate({ kind: 'xpChanged', xp: -5 }, none)).toThrow(RangeError)
  })
})

describe('franjas horarias en hora de Madrid', () => {
  it('RF-GAME-05: night_owl va de las 03:00 (incluida) a las 05:00 (excluida), en invierno y en verano', () => {
    // 29 de octubre de 2026 (CET, UTC+1): 03:00 en Madrid son las 02:00 UTC.
    const winter = nightOwlWindow(Date.UTC(2026, 9, 29, 2, 0, 0))
    expect(winter).toEqual({ startsAt: Date.UTC(2026, 9, 29, 2), endsAt: Date.UTC(2026, 9, 29, 4) })
    expect(nightOwlWindow(Date.UTC(2026, 9, 29, 1, 59, 59, 999))).toBeNull()
    expect(nightOwlWindow(Date.UTC(2026, 9, 29, 4))).toBeNull()
    // 1 de julio (CEST, UTC+2): 03:00 en Madrid son la 01:00 UTC.
    expect(nightOwlWindow(Date.UTC(2026, 6, 1, 1, 30))).toEqual({
      startsAt: Date.UTC(2026, 6, 1, 1),
      endsAt: Date.UTC(2026, 6, 1, 3),
    })
  })

  it('RF-GAME-05: night_owl, también las noches del cambio de hora', () => {
    // 29 de marzo de 2026: a las 02:00 se pasa a las 03:00 (CEST); la franja dura 2 h y empieza a la 01:00 UTC.
    expect(nightOwlWindow(Date.UTC(2026, 2, 29, 1, 0))).toEqual({
      startsAt: Date.UTC(2026, 2, 29, 1),
      endsAt: Date.UTC(2026, 2, 29, 3),
    })
    // 25 de octubre de 2026: a las 03:00 se vuelve a las 02:00 (CET); la franja empieza a las 02:00 UTC.
    expect(nightOwlWindow(Date.UTC(2026, 9, 25, 1, 30))).toBeNull()
    expect(nightOwlWindow(Date.UTC(2026, 9, 25, 2, 0))).toEqual({
      startsAt: Date.UTC(2026, 9, 25, 2),
      endsAt: Date.UTC(2026, 9, 25, 4),
    })
  })

  it('RF-GAME-05: revetlla va del 23 de junio a las 21:00 al 24 a las 06:00, en hora de Madrid', () => {
    expect(isRevetllaNight(Date.UTC(2026, 5, 23, 19))).toBe(true)
    expect(isRevetllaNight(Date.UTC(2026, 5, 23, 18, 59, 59, 999))).toBe(false)
    expect(isRevetllaNight(Date.UTC(2026, 5, 24, 3, 59, 59, 999))).toBe(true)
    expect(isRevetllaNight(Date.UTC(2026, 5, 24, 4))).toBe(false)
    expect(isRevetllaNight(Date.UTC(2027, 5, 23, 22))).toBe(true)
  })
})
