/**
 * Textos de la capa de juego para los emails (guía §2.10, Anexo B y Anexo C): el nombre de cada rango y el nombre y la
 * condición de cada logro, en castellano. Los ids son los de `@beatbattle/rules` (`RankId`, `AchievementId`); el
 * servidor comprueba que no falta ninguno (`apps/server/test/gameEmails.test.ts`). La web los tiene en su i18n.
 */

export type GameRarity = 'common' | 'rare' | 'epic' | 'legendary'

/** Rangos del Anexo B, por id. */
export const RANK_NAMES: Readonly<Record<string, string>> = {
  crateDigger: 'Excavador de cajones',
  looper: 'Loopero',
  sampler: 'Sampleador',
  beatmaker: 'Beatmaker',
  producer: 'Productor',
  grooveArchitect: 'Arquitecto del groove',
  bounceMaster: 'Maestro del bounce',
  studioBoss: 'Jefe de estudio',
  blockLegend: 'Leyenda del barrio',
  otherPeople: 'Other People',
}

/** Logros del Anexo C, por id: nombre y condición. */
export const ACHIEVEMENT_COPY: Readonly<Record<string, { name: string; condition: string }>> = {
  first_drop: { name: 'Primer sample', condition: 'Descargar tu primer sample.' },
  first_entry: { name: 'Primera piedra', condition: 'Subir tu primera entrada.' },
  profile_done: { name: 'Carta de presentación', condition: 'Completar tu perfil: avatar, bio y un enlace.' },
  first_vote: { name: 'Primer veredicto', condition: 'Emitir tu primer voto.' },
  share_card: { name: 'Altavoz', condition: 'Compartir una tarjeta.' },
  early_bird: { name: 'Madrugador', condition: 'Subir la primera entrada de una semana.' },
  streak_3: { name: 'En racha', condition: '3 semanas seguidas clasificado.' },
  entries_10: { name: 'Diez de diez', condition: 'Subir 10 entradas.' },
  jury_full: {
    name: 'Jurado completo',
    condition: 'Votar todas las entradas de una semana (5 como mínimo).',
  },
  votes_100: { name: 'Oído fino', condition: 'Emitir 100 votos.' },
  podium: { name: 'Al podio', condition: 'Quedar en el top 3 por primera vez.' },
  challenge: {
    name: 'Reto aceptado',
    condition: 'Cumplir el reto extra de una semana y quedar en el top 10.',
  },
  streak_8: { name: 'Imparable', condition: '8 semanas seguidas clasificado.' },
  entries_50: { name: 'Catálogo', condition: 'Subir 50 entradas.' },
  win: { name: 'Disco de oro', condition: 'Ganar una semana.' },
  unanimous: { name: 'Unanimidad', condition: 'Una media de 4,8 o más con 10 votos o más.' },
  votes_1000: { name: 'Juez supremo', condition: 'Emitir 1.000 votos.' },
  golden_ear: { name: 'Oído de oro', condition: 'Anticipar el criterio del jurado en una semana (ρ ≥ 0,6).' },
  label_pick: { name: 'Elegido por el sello', condition: 'Recibir la Elección del sello.' },
  streak_26: { name: 'Medio año sin fallar', condition: '26 semanas seguidas clasificado.' },
  win_3: { name: 'Platino', condition: 'Ganar 3 semanas.' },
  season_champ: { name: 'Campeón de temporada', condition: 'Ganar una temporada.' },
  level_20: { name: 'De la familia', condition: 'Llegar al nivel 20.' },
  last_minute: {
    name: 'Al límite',
    condition: 'Subir en los últimos 10 minutos antes del cierre de envíos.',
  },
  night_owl: { name: 'Búho', condition: 'Votar 10 entradas entre las 03:00 y las 05:00.' },
  scratch: { name: 'Scratcher', condition: 'Siete clics seguidos en el logo.' },
  konami: { name: 'Rebobinado', condition: 'Activar el modo cassette.' },
  pad_404: { name: 'Perdido con flow', condition: 'Grabar un bucle en el beat pad del 404.' },
  screwed: {
    name: 'Chopped & screwed',
    condition: 'Mantener Espacio sobre el vinilo del sample 5 segundos.',
  },
  human_metronome: { name: 'Metrónomo humano', condition: 'Acertar el BPM del sample (±1) con tap tempo.' },
  detective: { name: 'Detective', condition: 'Acertar 5 productores en «Adivina el productor».' },
  comeback: { name: 'Remontada', condition: 'Pasar de la mitad baja al top 3 en semanas seguidas.' },
  golden_week: { name: 'Cajón dorado', condition: 'Participar en una semana dorada.' },
  double: { name: 'Doblete', condition: 'Ganar dos semanas seguidas.' },
  oracle: { name: 'Oráculo', condition: 'Oído de oro 3 semanas seguidas.' },
  revetlla: { name: 'Revetlla', condition: 'Visitar la web la noche del 23 de junio.' },
}

/** «Épico», «Legendario»… (en las placas, en mayúsculas). */
export const RARITY_NAMES: Readonly<Record<GameRarity, string>> = {
  common: 'común',
  rare: 'raro',
  epic: 'épico',
  legendary: 'legendario',
}

export const rankName = (id: string) => RANK_NAMES[id] ?? id
export const achievementName = (id: string) => ACHIEVEMENT_COPY[id]?.name ?? id
export const achievementCondition = (id: string) => ACHIEVEMENT_COPY[id]?.condition ?? ''

/** Miles con punto, como la interfaz («1.250 XP»). */
export const xpText = (xp: number) => `${new Intl.NumberFormat('es-ES', { useGrouping: true }).format(xp)} XP`
