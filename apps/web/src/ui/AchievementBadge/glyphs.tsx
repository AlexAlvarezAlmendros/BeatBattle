import type { AchievementId } from '@beatbattle/rules'
import type { ReactNode } from 'react'
import styles from './AchievementBadge.module.css'

/**
 * Glifos de las insignias de logro (guía §3.8.8, §3.8.10; tarea 7.22): dibujos de 24 × 24 con `currentColor`, como los
 * iconos de `ui/Icon`, de trazo o macizos (`styles.solid`). Cada logro del Anexo C toma el de su familia: la corona para
 * ganar, la llama para las rachas, la oreja para el oído de oro…; los ocultos sin conseguir no enseñan glifo («???»).
 */
const GLYPHS = {
  crown: <path d="M3 18L2 7l6 5 4-8 4 8 6-5-1 11z" className={styles.solid} />,
  flame: (
    <path
      d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z"
      className={styles.solid}
    />
  ),
  ear: (
    <>
      <path d="M7.5 9a4.5 4.5 0 1 1 9 0c0 3-3 4-3 6.5a3 3 0 0 1-5.5 1.6" />
      <path d="M10.5 9.5a1.5 1.5 0 1 1 3 0" />
    </>
  ),
  star: (
    <path
      d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"
      className={styles.solid}
    />
  ),
  vinyl: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 12h.01" />
    </>
  ),
  podium: <path d="M3 20v-6h6v6zM9 20V8h6v12zM15 20v-9h6v9z" className={styles.solid} />,
  headphones: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <path d="M4 14h3v6H4zM17 14h3v6h-3z" />
    </>
  ),
  card: (
    <>
      <path d="M6 3h12v18H6z" />
      <circle cx="12" cy="9.5" r="2.5" />
      <path d="M9 15h6M9 18h4" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 10v4h3l7 4V6l-7 4z" />
      <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  sunrise: (
    <>
      <path d="M5 17a7 7 0 0 1 14 0M2 20h20" />
      <path d="M12 3v3M4.2 8.2l2 2M19.8 8.2l-2 2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12h.01" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  chevrons: <path d="M6 9l6-5 6 5M6 14l6-5 6 5M6 19l6-5 6 5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" className={styles.solid} />,
  cassette: (
    <>
      <path d="M3 6h18v12H3z" />
      <circle cx="8.5" cy="11" r="2" />
      <circle cx="15.5" cy="11" r="2" />
      <path d="M7 18l2-3h6l2 3" />
    </>
  ),
  pad: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  wave: <path d="M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0" />,
  metronome: (
    <>
      <path d="M8 21l3-17h2l3 17z" />
      <path d="M12 16l5-9" />
    </>
  ),
  magnifier: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5.5 5.5" />
    </>
  ),
  arrowUp: <path d="M12 20V5M6 11l6-6 6 6" />,
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  burst: <path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19" />,
} satisfies Record<string, ReactNode>

export type GlyphName = keyof typeof GLYPHS

/** El glifo de cada logro del Anexo C. */
export const ACHIEVEMENT_GLYPHS: Record<AchievementId, GlyphName> = {
  first_drop: 'vinyl',
  first_entry: 'vinyl',
  profile_done: 'card',
  first_vote: 'star',
  share_card: 'megaphone',
  early_bird: 'sunrise',
  streak_3: 'flame',
  entries_10: 'vinyl',
  jury_full: 'headphones',
  votes_100: 'star',
  podium: 'podium',
  challenge: 'target',
  streak_8: 'flame',
  entries_50: 'vinyl',
  win: 'crown',
  unanimous: 'star',
  votes_1000: 'star',
  golden_ear: 'ear',
  label_pick: 'tag',
  streak_26: 'flame',
  win_3: 'crown',
  season_champ: 'crown',
  level_20: 'chevrons',
  last_minute: 'clock',
  night_owl: 'moon',
  scratch: 'vinyl',
  konami: 'cassette',
  pad_404: 'pad',
  screwed: 'wave',
  human_metronome: 'metronome',
  detective: 'magnifier',
  comeback: 'arrowUp',
  golden_week: 'vinyl',
  double: 'crown',
  oracle: 'eye',
  revetlla: 'burst',
}

/** El dibujo de un glifo (decorativo: el nombre lo da quien lo usa). */
export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} focusable="false" aria-hidden="true" data-glyph={name}>
      {GLYPHS[name]}
    </svg>
  )
}
