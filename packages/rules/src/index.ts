// @beatbattle/rules — núcleo de reglas puro y determinista (guía §4.5).
//
// Módulos de §4.5 disponibles desde la Fase 0 (tarea 0.6):
//   balance    todas las constantes del Anexo B (y las de juego citadas en §2.6 y §2.10)
//   entryAudio validación del audio de una entrada (formato, tamaño y duración)
//   prng       hash de cadenas → sfc32, flujos con nombre
//   listen     umbral de escucha
//   scoring    media bayesiana, media, mediana, histograma
//   levels     curva de niveles, rangos, bonus de racha (del módulo `xp` de §4.5)
//   season     puntos de temporada
//   loudness   ganancia de reproducción
//   goldenEar  Spearman con rangos medios
//
// El resto de §4.5 llega con la fase que lo usa (ver docs/planning/ROADMAP.md): `calendar`,
// `phase`, `ranking`, `fair`, `alias`, `xp` (`xpFor`, `streakOf`), `achievements`,
// `seasonStandings` y `goldenEar()`.

export * from './balance'
export * from './entryAudio'
export * from './goldenEar'
export * from './levels'
export * from './listen'
export * from './loudness'
export * from './prng'
export * from './scoring'
export * from './season'
