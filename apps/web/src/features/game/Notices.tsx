import { duration, ease, reducedDuration, spring } from '@beatbattle/shared/tokens'
import { AnimatePresence, domAnimation, LazyMotion, m, type Transition } from 'motion/react'
import { type CSSProperties, useEffect, useLayoutEffect, useState } from 'react'
import { audio } from '../../audio/engine'
import { t } from '../../i18n'
import { Announcer } from '../../ui/Announcer'
import { frameAttributes } from '../../ui/Frame'
import { flash } from '../../ui/flash'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { useSeriousMode } from '../../ui/hooks/useSeriousMode'
import { AchievementBadge } from './AchievementBadge'
import { type RewardNotice, useHud } from './hudStore'
import styles from './Notices.module.css'
import { rankChanges, rankName } from './rewards'

/** Desde dónde entra una placa: desde la diagonal, abajo a la izquierda (§3.8.8, Anexo E). */
const ENTER = { x: -48, y: 24 }
/** Chispas del legendario. */
const SPARKS = 14

/** El borde de abajo de la ficha del HUD en la ventana (las placas van debajo); arriba si no se ve. */
function useHudBottom(): number {
  const [bottom, setBottom] = useState(0)
  useLayoutEffect(() => {
    const update = () => {
      const slot = document.querySelector('[data-frame-slot="hudPlayer"]')
      const box = slot?.getBoundingClientRect()
      setBottom(box && box.height > 0 ? Math.max(0, box.bottom) : 0)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update)
    }
  }, [])
  return bottom
}

/**
 * El legendario y la subida de nivel se quitan con cualquier tecla, toque o clic (`RD-MOT-01`): sin bloquear, la tecla
 * sigue su camino (votar la siguiente, volver con Esc).
 */
function useSkip(notice: RewardNotice | null): void {
  useEffect(() => {
    if (!notice) return
    const skip = (event: Event) => {
      if (event instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return
      useHud.getState().dismiss(notice.key)
    }
    // Tras el fotograma en que sale: la tecla o el clic que lo ha provocado (el voto) no lo quitan.
    const timer = window.setTimeout(() => {
      window.addEventListener('keydown', skip, true)
      window.addEventListener('pointerdown', skip, true)
    }, duration.slam)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', skip, true)
      window.removeEventListener('pointerdown', skip, true)
    }
  }, [notice])
}

/** La curva por defecto, como la quiere Motion. */
const EASE_OUT = [...ease.out] as [number, number, number, number]

/** El movimiento de una placa: desde la diagonal con el muelle; sin movimiento, fundido. */
function useEnter(reduced: boolean) {
  const fade: Transition = {
    duration: (reduced ? reducedDuration.fast : duration.fast) / 1000,
    ease: EASE_OUT,
  }
  const move: Transition = reduced ? fade : { type: 'spring', ...spring.interaction }
  const offset = reduced ? { x: 0, y: 0 } : ENTER
  return {
    initial: { opacity: 0, ...offset },
    animate: { opacity: 1, x: 0, y: 0 },
    exit: { opacity: 0, x: reduced ? 0 : ENTER.x / 2 },
    transition: { ...fade, x: move, y: move } satisfies Transition,
  }
}

/** Una placa de logro (común, raro o épico): suena su `ach.*` en el fotograma en que entra. */
function AchievementPlate({ notice }: { notice: Extract<RewardNotice, { kind: 'achievement' }> }) {
  const reduced = useReducedMotion()
  useLayoutEffect(() => audio.play(`ach.${notice.rarity}`), [notice.rarity])
  return (
    <m.li {...useEnter(reduced)} className={styles.item} data-notice="achievement">
      <div {...frameAttributes({ cut: 'base' })} className={styles.plate} data-rarity={notice.rarity}>
        <AchievementBadge id={notice.id} kicker={t('game.notice.unlocked')} />
      </div>
    </m.li>
  )
}

/** La subida de nivel (§3.8.8): el sello del nivel nuevo, «¡NIVEL 8!» y el rango si cambia, con `level.up`. */
function LevelPlate({ notice }: { notice: Extract<RewardNotice, { kind: 'level' }> }) {
  const reduced = useReducedMotion()
  useSkip(notice)
  useLayoutEffect(() => audio.play('level.up'), [])
  const changed = rankChanges(notice)
  return (
    <m.li {...useEnter(reduced)} className={styles.item} data-notice="level">
      <div className={styles.levelAnnouncer}>
        <Announcer text={t('game.notice.level', { level: notice.level })} variant="tag" silent />
      </div>
      <div {...frameAttributes({ cut: 'base' })} className={styles.plate} data-level="">
        <span className={styles.seal} data-stamp={reduced ? undefined : ''} aria-hidden="true">
          <small>{t('game.notice.levelPlate')}</small>
          <b className="bb-display">{notice.level}</b>
        </span>
        {/* El anunciador es espectáculo (el modo serio lo quita): la placa dice todo sin él. */}
        <div className={styles.levelText}>
          <p className={styles.levelKicker}>{t('game.notice.levelUp', { level: notice.level })}</p>
          <p className={styles.levelTitle}>
            {changed
              ? t('game.notice.rank', { rank: rankName(notice.level).toUpperCase() })
              : rankName(notice.level)}
          </p>
        </div>
      </div>
    </m.li>
  )
}

/** El logro legendario, al centro (§3.8.8): «¡LOGRO LEGENDARIO!», la placa y chispas por el limitador. */
function LegendaryNotice({ notice }: { notice: Extract<RewardNotice, { kind: 'achievement' }> }) {
  const reduced = useReducedMotion()
  const serious = useSeriousMode()
  useSkip(notice)
  const [sparks, setSparks] = useState<{ area: number; opacity: number } | null>(null)
  useLayoutEffect(() => {
    audio.play('ach.legendary')
    if (reduced || serious) return
    // Un destello, con el área y la opacidad que autoriza el limitador (`RD-MOT-04`).
    const grant = flash.request({ reason: 'achievement', area: 0.12, opacity: 0.4 })
    if (grant) setSparks({ area: grant.area, opacity: grant.opacity })
  }, [reduced, serious])
  return (
    <m.div
      initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: (reduced ? reducedDuration.slow : duration.slow) / 1000, ease: EASE_OUT }}
      className={styles.center}
      aria-hidden="true"
      data-notice="legendary"
    >
      <div className={styles.legendary}>
        {sparks && (
          <div
            className={styles.sparks}
            data-fx=""
            aria-hidden="true"
            style={
              {
                '--spark-reach': `${Math.round(Math.sqrt(sparks.area * window.innerWidth * window.innerHeight) / 2)}px`,
                '--spark-opacity': sparks.opacity,
              } as CSSProperties
            }
          >
            {Array.from({ length: SPARKS }, (_, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: piezas fijas
                key={index}
                data-tone={index % 2}
                style={{ '--i': index, '--n': SPARKS } as CSSProperties}
              />
            ))}
          </div>
        )}
        <Announcer text={t('game.notice.legendary')} className={styles.legendaryAnnouncer} silent />
        <div {...frameAttributes({ cut: 'lg' })} className={styles.plate} data-rarity="legendary">
          <AchievementBadge id={notice.id} kicker={t('game.notice.unlocked')} />
        </div>
        <p className={styles.skip}>{t('game.notice.skip')}</p>
      </div>
    </m.div>
  )
}

/**
 * Los avisos de logro y de subida de nivel (§3.8.8, tarea 7.20): bajo la ficha del HUD, la subida de nivel y las placas
 * de logro (tres a la vez); el legendario, al centro. No se pulsan (lo que dicen ya está en la región viva).
 */
export function Notices() {
  const plates = useHud((state) => state.plates)
  const big = useHud((state) => state.big)
  const top = useHudBottom()
  const level = big?.kind === 'level' ? big : null
  const legendary = big?.kind === 'achievement' ? big : null
  return (
    <LazyMotion features={domAnimation}>
      <ol
        className={styles.column}
        style={{ '--notices-top': `${top}px` } as CSSProperties}
        aria-hidden="true"
      >
        <AnimatePresence initial={false}>
          {level && <LevelPlate key={level.key} notice={level} />}
          {plates.map((notice) =>
            notice.kind === 'achievement' ? <AchievementPlate key={notice.key} notice={notice} /> : null,
          )}
        </AnimatePresence>
      </ol>
      <AnimatePresence>
        {legendary && <LegendaryNotice key={legendary.key} notice={legendary} />}
      </AnimatePresence>
    </LazyMotion>
  )
}
