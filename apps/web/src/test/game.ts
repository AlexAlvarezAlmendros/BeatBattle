import type { MeGame, ProfileGame } from '@beatbattle/shared'

/** La capa de juego de una cuenta nueva en `GET /api/me` (tarea 7.13), para los fixtures de las pruebas. */
export const EMPTY_ME_GAME: MeGame = {
  xp: 0,
  level: 1,
  levelSeen: 1,
  streak: { current: 0, best: 0, jokerAvailable: true },
  season: { id: '2026-T4', points: 0, position: null },
  unseenAchievements: [],
  seasonCeremony: null,
}

/** La capa de juego de un perfil sin semanas selladas en `GET /api/profiles/:username` (tarea 7.13). */
export const EMPTY_PROFILE_GAME: ProfileGame = {
  level: 1,
  stats: {
    bestPosition: null,
    streak: { current: 0, best: 0 },
    meanScoreMilli: null,
    goldenEars: 0,
    votesCast: 0,
    season: { id: '2026-T4', points: 0, position: null },
  },
  history: [],
  achievements: [],
  showcase: [],
}
