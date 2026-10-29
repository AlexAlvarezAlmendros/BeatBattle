import { LEVEL_MAX, levelProgress, rankTitle } from '@beatbattle/rules'
import { useLayoutEffect, useRef, useState } from 'react'
import { useHud } from '../../features/game/hudStore'
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

/** Atributo del medidor de XP del HUD: el «+XP» flotante vuela hasta él (§3.4.2). */
export const HUD_XP_ATTRIBUTE = 'data-hud-xp'

/**
 * Lo que enseña la ficha: lo de la sesión menos lo que el medidor aún no ha tragado (el «+XP» en vuelo y los avisos
 * de logro en cola, §3.4.1). Sin nada pendiente, tal cual llega.
 */
function shownProgress({ level, rank, xp }: Pick<PlayerCardProps, 'level' | 'rank' | 'xp'>, pending: number) {
  if (pending <= 0) return { level, rank, xp }
  const value = Math.max(0, xp.value - pending)
  const progress = levelProgress(value)
  return {
    level: progress.level,
    rank: t(`rank.${rankTitle(progress.level)}`),
    xp: { value, min: progress.levelXp, max: progress.nextLevelXp ?? progress.levelXp },
  }
}

/**
 * El jugador en el HUD (guía §3.4.1, con sesión): «1P» en display rojo, avatar en marco de chaflán con
 * borde rojo y fondo granate (la foto en duotono o, sin ella, el monograma), nombre, nivel y rango, y el medidor de XP segmentado
 * con «XP 2.980 · NV 8 · 3.350». En móvil, avatar, nombre, nivel y XP en una fila.
 *
 * Capa de juego (tarea 7.18): el XP que el medidor aún no ha tragado no se enseña (`useHud`), y al subir de nivel el
 * número se estampa (§3.8.8; sin movimiento o en modo serio, solo cambia). En el nivel 20, lleno y «NV 20 · MÁX».
 */
export function PlayerCard(props: PlayerCardProps) {
  const { name, initials, avatarUrl } = props
  const pending = useHud((state) => state.pendingXp)
  const { level, rank, xp } = shownProgress(props, pending)
  const max = level >= LEVEL_MAX
  const next = level + 1
  const nameRef = useRef<HTMLParagraphElement>(null)
  useFitText(nameRef, name, { minFontPx: 12 })
  // El sello de nivel se estampa cuando el nivel sube (no al montarse).
  const [stamp, setStamp] = useState(0)
  const previous = useRef(level)
  useLayoutEffect(() => {
    if (level > previous.current) setStamp((key) => key + 1)
    previous.current = level
  }, [level])
  const value = formatNumber(xp.value, { useGrouping: 'always' })
  const top = formatNumber(xp.max, { useGrouping: 'always' })
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
          {t('frame.player.levelBefore')}{' '}
          <b key={stamp} className={styles.level} data-stamp={stamp > 0 || undefined}>
            {level}
          </b>{' '}
          · {rank}
        </p>
        <div className={styles.meterBox} {...{ [HUD_XP_ATTRIBUTE]: '' }}>
          <Meter
            className={styles.meter}
            value={xp.value}
            min={xp.min}
            max={xp.max}
            label={t('frame.player.xp')}
            valueText={
              max
                ? t('frame.player.xpTextMax', { value, level })
                : t('frame.player.xpText', { value, max: top, next })
            }
            caption={{
              start: t('frame.player.xpStart', { value }),
              end: max ? t('frame.player.xpEndMax', { level }) : t('frame.player.xpEnd', { next, max: top }),
            }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Un dato del HUD de la derecha (temporada, racha): rótulo y valor en un marco. `spoken` es lo que oye el lector
 * («Temporada T4: 12 puntos, puesto 9»), en vez de las abreviaturas de la vista.
 */
export function HudStat({ label, value, spoken }: { label: string; value: string; spoken?: string }) {
  return (
    <Frame cut="md" className={styles.stat}>
      <span className={styles.statLabel} aria-hidden={spoken ? true : undefined}>
        {label}
      </span>
      <b className={styles.statValue} aria-hidden={spoken ? true : undefined}>
        {value}
      </b>
      {spoken && <span className="sr-only">{spoken}</span>}
    </Frame>
  )
}
