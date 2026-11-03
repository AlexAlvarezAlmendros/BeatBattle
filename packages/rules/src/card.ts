import { RANK_LADDER } from './balance'

/**
 * Las variantes de la carta de productor (guía §3.4.4, §2.10; tareas 7.22 y 7.28). Es una regla del juego que usan la
 * carta plana y la tarjeta para *stories* de la web y la imagen OG del perfil que pinta el servidor: tiene que dar lo
 * mismo en los dos sitios, así que vive aquí. Todas en la paleta.
 */

/** Variantes de la carta, de menos a más (§3.4.4). */
export const CARD_VARIANTS = ['standard', 'red', 'holo', 'champion'] as const
export type CardVariant = (typeof CARD_VARIANTS)[number]

/** Nivel desde el que la carta es roja: el del rango «Productor» (Anexo B). */
export const RED_CARD_LEVEL = RANK_LADDER.find((step) => step.id === 'producer')?.fromLevel ?? Number.NaN

/** Lo que decide la variante (de lo público: solo semanas selladas, §2.10). */
export interface CardFacts {
  level: number
  /** Semanas selladas en 1.ª posición (ex aequo incluidos). */
  wins: number
  /** Tiene `season_champ` (campeón o campeón ex aequo de una temporada cerrada, §2.9). */
  champion: boolean
}

/**
 * Las variantes que tiene ganadas, de menos a más: la estándar siempre; la roja con rango ≥ Productor; la holo si ha
 * ganado alguna semana (`egg.holo`, Anexo F); la de campeón si lo ha sido de una temporada.
 */
export function unlockedVariants({ level, wins, champion }: CardFacts): CardVariant[] {
  return CARD_VARIANTS.filter(
    (variant) =>
      variant === 'standard' ||
      (variant === 'red' && level >= RED_CARD_LEVEL) ||
      (variant === 'holo' && wins > 0) ||
      (variant === 'champion' && champion),
  )
}

/** La variante con la que sale la carta: la más alta que tiene ganada. */
export function cardVariant(facts: CardFacts): CardVariant {
  return unlockedVariants(facts).at(-1) ?? 'standard'
}
