import type { WaveformPeak } from '../../../ui/Waveform'

/**
 * Lo que el menú principal (guía §3.8.3) necesita saber para pintarse. Hasta que lleguen las semanas
 * (Fase 3) y las cuentas (Fase 2), la home lo construye en el estado «calendario vacío» y visitante; la
 * pantalla de desarrollo `/dev/menu` lo rellena con los datos de muestra de las maquetas para
 * compararla con ellas.
 *
 * Integridad (§1.3): aquí no hay medias, recuentos de votos de una entrada, posiciones ni autoría. Los
 * números son de la semana (entradas en la batalla) o del propio jugador (lo que le queda por votar).
 */

/** La semana en juego, cuando la hay. */
export interface MenuWeek {
  /** `open`: se puede subir; `voting`: domingo de 20:00 a 23:59, solo votos. */
  phase: 'open' | 'voting'
  number: number
  title: string
  credits: string
  /** Rango de fechas («5–11 oct · 2026-W41»). */
  range: string
  /** Semana ISO («2026-W41»): la pantalla de título la enseña arriba (§3.8.1). */
  code: string
  bpm: number
  /** Tonalidad en palabras («Re menor», §3.2). */
  musicalKey: string
  durationSeconds: number
  genre: string
  peaks: readonly WaveformPeak[]
  /** Reto de la semana («Usa solo el primer compás · da logro, no puntúa»). */
  challenge: string
  /** Entradas en la batalla (un dato de la semana, no de una entrada). */
  entries: number
  /** Cierre de envíos (o de votos en `voting`), UTC en ms. */
  closesAt: number
  /** El cierre en palabras para el panel de ayuda («domingo 11 a las 20:00»), en hora de Madrid. */
  when: string
  /** La línea de fecha del reloj («Domingo 11 a las 20:00 · votos hasta las 23:59»). */
  clockWhen: string
  /** La barra de la semana del reloj. */
  weekBar: { today: number; progress: number }
  /** MP3 de escucha firmado del sample (`RF-DROP-09`); sin él, el play no suena (datos de muestra). */
  streamUrl?: string
  /** Slug de la semana (`2026-w41`), para enlazar su ficha. */
  slug?: string
}

/** El jugador con sesión (sin sesión, el HUD dice «1P · PULSA PARA UNIRTE»). */
export interface MenuPlayer {
  name: string
  initials: string
  level: number
  rank: string
  xp: { value: number; min: number; max: number }
  /** Foto del avatar (64 px); sin ella, el monograma. */
  avatarUrl?: string | null
  season?: { label: string; value: string }
  streak?: number
  /** Ya ha subido su entrada esta semana (Jugar pasa a «Editar mi entrada» y el cursor, a Jurado). */
  uploaded: boolean
  /** Entradas que le quedan por votar (su dato, no el de nadie). */
  unvoted: number
}

/**
 * Campeón vigente (§3.8.1): el 1.º de la última semana sellada. Su puntuación ya es pública (la semana
 * está sellada: `RF-PLAY-05` solo protege lo que no lo está).
 */
export interface MenuChampion {
  /** Nombre del productor («KAIRO.WAV»). */
  producer: string
  week: number
  /** Título de la entrada ganadora. */
  title: string
  /** Puntuación ya formateada («4,62»). */
  score: string
}

export interface MenuModel {
  week: MenuWeek | null
  /** Temporada en juego («T4»), si la hay. */
  season: string | null
  /** Campeón de la última semana sellada, si la hay. */
  champion: MenuChampion | null
  player: MenuPlayer | null
  /** Última semana sellada y si tiene ceremonia sin ver. */
  lastSealed: { number: number; unseen: boolean } | null
  /** Crónica de la arena (§3.8.3): nunca dice quién ha subido. */
  chronicle: readonly string[]
  /**
   * La semana todavía no ha llegado (la primera petición de `GET /api/weeks/current`): ni «en el horno» ni
   * Jugar bloqueado, sino la tarjeta en esqueleto (jurado de la 3.21, quinto pase: al cargar se veía un
   * instante el calendario vacío aunque hubiera semana).
   */
  loading?: boolean
  /** Sin semana en juego: cuándo cae el próximo drop («Cae el lunes 12 de octubre»), si está programado. */
  nextDrop?: string | null
}

/** Modos del menú principal, en su orden (§3.8.3). */
export const MENU_MODES = ['play', 'jury', 'results', 'hallOfFame', 'howItWorks', 'settings'] as const
export type MenuMode = (typeof MENU_MODES)[number]
