// Tabla de equilibrado de BeatBattle (guía Anexo B). Es la única fuente de los números de juego:
// ninguna regla de packages/rules lleva un número mágico fuera de este fichero (guía §4.5, §4.18).
//
// Convenciones:
// - La unidad va en el nombre: `_MS`, `_BYTES`, `_LUFS`, `_DB`, `_KBPS`, `_WEEKS`, `_VOTES`,
//   `_PERCENT`; las constantes de experiencia empiezan por `XP_` y su valor está en puntos de XP.
// - Los porcentajes son enteros (`10` = 10 %) para que las cuentas con ellos sean exactas.
// - Todo es inmutable: `as const` para los tipos y `Object.freeze` para que tampoco se pueda
//   mutar en ejecución.
// - Las horas de cierre son datos de calendario (hora de pared en Madrid), no instantes: el módulo
//   `calendar` (Fase 3) las convierte en instantes UTC al programar cada semana (guía §4.12).

// ─── Semana (guía §2.1) ─────────────────────────────────────────────────────────────────────────

/** Zona horaria de todas las fronteras de la semana; respeta el cambio de horario (`RF-DROP-05`). */
export const WEEK_TIME_ZONE = 'Europe/Madrid' as const

/** Día de la semana ISO 8601: 1 = lunes … 7 = domingo. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * Hora de pared dentro de la semana, en `WEEK_TIME_ZONE`. Es un dato de calendario, no un
 * instante: el instante UTC depende de la semana concreta y del horario de verano.
 */
export interface WeeklyWallTime {
  readonly isoWeekday: IsoWeekday
  readonly hour: number
  readonly minute: number
  readonly second: number
}

/** Drop del sample y apertura de envíos y votos: lunes 00:00 (guía §2.1). */
export const WEEK_OPENS_AT = Object.freeze({
  isoWeekday: 1,
  hour: 0,
  minute: 0,
  second: 0,
} as const satisfies WeeklyWallTime)

/** Cierre de envíos: domingo 20:00 (Anexo B). Desde aquí la semana está en fase `voting`. */
export const SUBMISSIONS_CLOSE_AT = Object.freeze({
  isoWeekday: 7,
  hour: 20,
  minute: 0,
  second: 0,
} as const satisfies WeeklyWallTime)

/**
 * Frontera de la semana: hora de pared en `WEEK_TIME_ZONE` más la semana en la que cae, contada
 * desde la del drop (`0` = la misma semana, `1` = la siguiente).
 */
export interface WeeklyBoundary extends WeeklyWallTime {
  readonly weekOffset: 0 | 1
}

/**
 * Cierre de votos como frontera exclusiva (Anexo B): el instante del lunes 00:00:00.000 de la
 * semana siguiente, igual que `WEEK_OPENS_AT` de esa semana. Un voto vale si llega antes de este
 * instante; así la ventana de solo votación (desde `SUBMISSIONS_CLOSE_AT`) dura 4 h justas (§2.1).
 * Es el valor que usan `calendar`/`phase` (Fase 3, `RF-DROP-01`).
 */
export const VOTING_CLOSE_EXCLUSIVE_AT = Object.freeze({
  isoWeekday: 1,
  hour: 0,
  minute: 0,
  second: 0,
  weekOffset: 1,
} as const satisfies WeeklyBoundary)

/**
 * Cierre de votos tal y como se muestra a la gente: «domingo 23:59:59» (Anexo B). Solo es texto
 * para la interfaz y los emails: ninguna regla compara instantes con esta hora.
 */
export const VOTING_CLOSE_DISPLAY_AT = Object.freeze({
  isoWeekday: 7,
  hour: 23,
  minute: 59,
  second: 59,
} as const satisfies WeeklyWallTime)

/**
 * «Hora loca» (guía §2.11, §3.3, §3.6): la última hora antes de cada cierre, en la que el reloj de ronda
 * late. Incluye el instante en que falta justo 1 h (`RF-DROP-10`).
 */
export const LAST_HOUR_MS = 3_600_000

// ─── Voto (guía §2.7, §2.8) ─────────────────────────────────────────────────────────────────────

/** Estrella mínima de un voto (votos de 1 a 5 estrellas enteras, `RF-VOTE-01`). */
export const STARS_MIN = 1
/** Estrella máxima de un voto. */
export const STARS_MAX = 5

/** Escucha que hace falta para votar: 30 s (`RF-VOTE-04`; la entrada entera si dura menos). */
export const LISTEN_THRESHOLD_MS = 30_000

/** Peso `C` del previo bayesiano, en votos (guía §2.8, `RF-RES-01`). */
export const BAYES_PRIOR_WEIGHT = 5

/** Votos válidos mínimos para clasificar y optar al podio (`RF-RES-03`). */
export const PODIUM_MIN_VOTES = 3

/** Plazas del podio: oro, platino y diamante (guía §3.4.3). */
export const PODIUM_SIZE = 3

/** Última posición del «top 10» (XP de resultado y puntos de temporada). */
export const TOP_TEN_LAST_POSITION = 10

/** Límite de votos por hora y usuario (`RF-VOTE-11`). */
export const VOTES_PER_HOUR_LIMIT = 120

// ─── Entradas y audio (guía §2.5, §2.6, §4.8) ───────────────────────────────────────────────────

/** Duración mínima de una entrada: 30 s (`RF-ENT-03`). */
export const ENTRY_MIN_DURATION_MS = 30_000
/** Duración máxima de una entrada: 4 min (`RF-ENT-03`). */
export const ENTRY_MAX_DURATION_MS = 240_000

/**
 * Tamaño máximo del fichero de una entrada: «100 MB» (`RF-ENT-03`). Se cuenta como lo cuenta
 * Cloudinary, en MiB (100 × 1024 × 1024 = 104 857 600 bytes), para que el límite propio y el del
 * almacenamiento coincidan.
 */
export const ENTRY_MAX_BYTES = 100 * 1024 * 1024

/** Formatos de audio de una entrada (`RF-ENT-03`), por su extensión en minúsculas (`aif` es `aiff`). */
export const ENTRY_FORMATS = Object.freeze(['wav', 'aiff', 'flac', 'mp3'] as const)

/** Sonoridad integrada objetivo de la reproducción (`RF-PLAY-03`). */
export const TARGET_LOUDNESS_LUFS = -14
/** Ganancia máxima de la igualación: 0 dB, solo atenúa (`RF-PLAY-03`). */
export const PLAYBACK_GAIN_MAX_DB = 0

/** Bitrate del derivado MP3 de escucha (guía §4.8.3). */
export const STREAM_BITRATE_KBPS = 192

/** Semanas que se conserva el original tras el sellado antes de sustituirlo por el derivado (`RF-STO-07`). */
export const ORIGINAL_RETENTION_WEEKS = 8
/** Las entradas de estas primeras posiciones conservan el original para siempre (`RF-STO-07`). */
export const ORIGINAL_RETENTION_EXEMPT_TOP_POSITIONS = PODIUM_SIZE

/** Escucha seguida mínima para contar una reproducción en `play_count` (guía §2.6, `RF-PLAY-07`). */
export const PLAY_COUNT_MIN_CONTINUOUS_MS = 10_000

// ─── XP (Anexo B; guía §2.10) ───────────────────────────────────────────────────────────────────

/** Subir una entrada (× bonus de racha). */
export const XP_ENTRY_SUBMITTED = 100
/** Extra por la primera entrada de la semana. */
export const XP_FIRST_ENTRY_OF_WEEK = 25

/** Votar: solo el primer voto a cada entrada. */
export const XP_VOTE = 5
/** Tope de votos que dan XP por semana (`RF-GAME-03`: 50 votos dan como máximo 40 × 5 XP). */
export const XP_VOTE_MAX_VOTES_PER_WEEK = 40

/** Jurado completo: votar todas las entradas de la semana. */
export const XP_JURY_COMPLETE = 50
/** Entradas mínimas de la semana para que exista el jurado completo. */
export const JURY_COMPLETE_MIN_ENTRIES = 5

/** Clasificar (≥ `PODIUM_MIN_VOTES` votos válidos) fuera del top 10 (× bonus de racha). */
export const XP_QUALIFIED = 25
/**
 * XP de resultado por posición (× bonus de racha); sustituye a `XP_QUALIFIED`.
 * Índice 0 = 1.º, 1 = 2.º, 2 = 3.º.
 */
export const XP_PODIUM_BY_POSITION = Object.freeze([500, 350, 250] as const)
/** XP de resultado del 4.º al 10.º (× bonus de racha); sustituye a `XP_QUALIFIED`. */
export const XP_TOP_TEN = 100

/** Oído de oro (guía §2.10). */
export const XP_GOLDEN_EAR = 75
/** Votos mínimos de un jurado en la semana para calcularle el oído de oro. */
export const GOLDEN_EAR_MIN_VOTES = 8
/** Correlación de Spearman mínima (ρ ≥ 0,6) para ganar el oído de oro. */
export const GOLDEN_EAR_MIN_RHO = 0.6

/** Acertar el productor de una entrada (Fase 8). */
export const XP_PRODUCER_GUESS = 15
/** Tope de aciertos de productor con XP por semana. */
export const XP_PRODUCER_GUESS_MAX_PER_WEEK = 5

/** Rarezas de los logros (Anexo C: C, R, E, L). */
export const ACHIEVEMENT_RARITIES = Object.freeze(['common', 'rare', 'epic', 'legendary'] as const)
export type AchievementRarity = (typeof ACHIEVEMENT_RARITIES)[number]

/** XP de un logro según su rareza. */
export const XP_ACHIEVEMENT_BY_RARITY = Object.freeze({
  common: 25,
  rare: 75,
  epic: 150,
  legendary: 300,
} as const satisfies Record<AchievementRarity, number>)

/** Semana dorada: multiplica todo el XP de esa semana. */
export const GOLDEN_WEEK_XP_MULTIPLIER = 2

/** La racha da bonus a partir de esta semana consecutiva (Anexo G: `racha ≥ 2`). */
export const STREAK_BONUS_FROM_WEEK = 2
/** Bonus de racha por cada semana desde `STREAK_BONUS_FROM_WEEK`: +10 %. */
export const STREAK_BONUS_STEP_PERCENT = 10
/** Bonus de racha máximo: +50 %. */
export const STREAK_BONUS_MAX_PERCENT = 50
/** Comodines de racha por temporada (se gasta solo la primera semana que fallas). */
export const STREAK_JOKERS_PER_SEASON = 1

// ─── Niveles y rangos (Anexo B; Anexo G) ────────────────────────────────────────────────────────

/** Primer nivel. */
export const LEVEL_MIN = 1
/** Último nivel («Other People»). */
export const LEVEL_MAX = 20

/** Curva de niveles: XP acumulado del nivel `n` = `round50(150 · (n − 1)^1,6)`. */
export const LEVEL_CURVE_BASE_XP = 150
/** Exponente de la curva de niveles. */
export const LEVEL_CURVE_EXPONENT = 1.6
/** Los umbrales de nivel se redondean al múltiplo de 50 XP más cercano. */
export const LEVEL_XP_ROUNDING_STEP = 50

/**
 * Identificador de rango. El título visible es un texto de UI: sale de i18n con la clave
 * `rank.<id>` (guía §4.18), no de este paquete.
 */
export type RankId =
  | 'crateDigger'
  | 'looper'
  | 'sampler'
  | 'beatmaker'
  | 'producer'
  | 'grooveArchitect'
  | 'bounceMaster'
  | 'studioBoss'
  | 'blockLegend'
  | 'otherPeople'

/** Peldaño de la escalera de rangos: el rango vale desde `fromLevel` hasta el siguiente peldaño. */
export interface RankStep {
  readonly fromLevel: number
  readonly id: RankId
}

/** Escalera de rangos (Anexo B), ordenada por `fromLevel` ascendente. */
export const RANK_LADDER: readonly RankStep[] = Object.freeze([
  Object.freeze({ fromLevel: 1, id: 'crateDigger' }), // Excavador de cajones
  Object.freeze({ fromLevel: 3, id: 'looper' }), // Loopero
  Object.freeze({ fromLevel: 5, id: 'sampler' }), // Sampleador
  Object.freeze({ fromLevel: 7, id: 'beatmaker' }), // Beatmaker
  Object.freeze({ fromLevel: 9, id: 'producer' }), // Productor
  Object.freeze({ fromLevel: 11, id: 'grooveArchitect' }), // Arquitecto del groove
  Object.freeze({ fromLevel: 13, id: 'bounceMaster' }), // Maestro del bounce
  Object.freeze({ fromLevel: 15, id: 'studioBoss' }), // Jefe de estudio
  Object.freeze({ fromLevel: 17, id: 'blockLegend' }), // Leyenda del barrio
  Object.freeze({ fromLevel: 20, id: 'otherPeople' }), // Other People («eres de la familia»)
] as const satisfies readonly RankStep[])

// ─── Temporadas (Anexo B; guía §2.9) ────────────────────────────────────────────────────────────

/** Puntos de temporada del 1.º al 10.º, al estilo F1. Índice 0 = 1.º. */
export const SEASON_POINTS_BY_POSITION = Object.freeze([25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const)
/** Puntos por cada entrada clasificada fuera del top 10. */
export const SEASON_POINTS_QUALIFIED_OUTSIDE_TOP = 1
