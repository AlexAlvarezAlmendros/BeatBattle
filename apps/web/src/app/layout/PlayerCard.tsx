import { useRef } from 'react'
import { formatNumber, t } from '../../i18n'
import { Frame } from '../../ui/Frame'
import { useFitText } from '../../ui/hooks/useFitText'
import { Meter } from '../../ui/Meter'
import styles from './PlayerCard.module.css'

export interface PlayerCardProps {
  name: string
  /** Monograma del avatar si no hay foto («LB»). */
  initials: string
  level: number
  rank: string
  xp: { value: number; min: number; max: number }
  /** Foto del avatar; pasa por el duotono rojo y negro (§3.4.1). */
  avatarUrl?: string | null
}

/**
 * El jugador en el HUD (guía §3.4.1, con sesión): «1P» en display rojo, avatar en marco de chaflán con
 * borde rojo y fondo granate (la foto en duotono o, sin ella, el monograma), nombre, nivel y rango, y el medidor de XP segmentado
 * con «XP 2.980 · NV 8 · 3.350». En móvil, avatar, nombre, nivel y XP en una fila.
 */
export function PlayerCard({ name, initials, level, rank, xp, avatarUrl }: PlayerCardProps) {
  const next = level + 1
  const nameRef = useRef<HTMLParagraphElement>(null)
  useFitText(nameRef, name, { minFontPx: 12 })
  return (
    <div className={styles.player}>
      <span className={styles.p1} aria-hidden="true">
        {t('ui.cursor.player')}
      </span>
      <Frame as="span" cut="md" className={styles.avatar} aria-hidden="true">
        {avatarUrl ? (
          <span className={styles.photo} data-duotone="">
            <img src={avatarUrl} alt="" width={64} height={64} />
          </span>
        ) : (
          initials
        )}
      </Frame>
      <div className={styles.text}>
        <p ref={nameRef} className={styles.name}>
          {name}
        </p>
        <p className={styles.rank}>
          {t('frame.player.levelBefore')} <b>{level}</b> · {rank}
        </p>
        <Meter
          className={styles.meter}
          value={xp.value}
          min={xp.min}
          max={xp.max}
          label={t('frame.player.xp')}
          valueText={t('frame.player.xpText', {
            value: formatNumber(xp.value, { useGrouping: 'always' }),
            max: formatNumber(xp.max, { useGrouping: 'always' }),
            next,
          })}
          caption={{
            start: t('frame.player.xpStart', { value: formatNumber(xp.value, { useGrouping: 'always' }) }),
            end: t('frame.player.xpEnd', { next, max: formatNumber(xp.max, { useGrouping: 'always' }) }),
          }}
        />
      </div>
    </div>
  )
}

/** Un dato del HUD de la derecha (temporada, racha): rótulo y valor en un marco. */
export function HudStat({ label, value }: { label: string; value: string }) {
  return (
    <Frame cut="md" className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <b className={styles.statValue}>{value}</b>
    </Frame>
  )
}
