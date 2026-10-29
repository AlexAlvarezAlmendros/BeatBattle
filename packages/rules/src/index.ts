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
// De la Fase 3 (tareas 3.1 y 3.2):
//   calendar   fronteras de la semana en Europe/Madrid, semana ISO, slug y temporada
//   phase      fase derivada de los instantes, permisos por fase y cuenta atrás
//
// De la Fase 4 (tarea 4.1):
//   alias      alias de batalla sin repetirse en la semana, número de recibo y semilla de la portada
//
// De la Fase 5 (tarea 5.1):
//   fair       Ronda justa, Recién subidas, Aleatorio y la cola del Modo Jurado
//
// De la Fase 6 (tarea 6.1):
//   ranking    la clasificación de la semana: bayesiana, desempates, ex aequo y podio
//
// De la Fase 7 (tareas 7.1–7.6, la capa de juego):
//   xp         `xpFor` con la tabla del Anexo B (racha en juego, topes, semana dorada)

export * from './alias'
export * from './balance'
export * from './calendar'
export * from './entryAudio'
export * from './fair'
export * from './goldenEar'
export * from './levels'
export * from './listen'
export * from './loudness'
export * from './phase'
export * from './prng'
export * from './ranking'
export * from './scoring'
export * from './season'
export * from './xp'
