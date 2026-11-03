import { levelProgress, rankTitle } from '@beatbattle/rules'
import type { PublicProfile } from '@beatbattle/shared'
import { useEffect, useId, useRef, useState } from 'react'
import { paths } from '../../app/paths'
import { t } from '../../i18n'
import { profileQrPath } from '../../net/game'
import { Button } from '../../ui/Button'
import {
  CARD_VARIANTS,
  type CardSide,
  type CardVariant,
  cardSince,
  cardStats,
  cardVariant,
  isChampion,
  ProducerCard,
  unlockedVariants,
} from '../../ui/ProducerCard'
import { singleKeyAllowed, useShortcuts } from '../../ui/shortcuts'
import { initialsOf } from '../account/session'
import styles from './ProfilePage.module.css'

/** Lo que la carta de un perfil público necesita, sacado de su capa de juego (solo semanas selladas, hueco G1). */
export function profileCardProps(profile: PublicProfile) {
  const progress = levelProgress(profile.xp)
  const stats = cardStats(profile.game.history)
  const facts = { level: progress.level, wins: stats.wins, champion: isChampion(profile.game.achievements) }
  return {
    name: profile.displayUsername,
    initials: initialsOf(profile.displayUsername),
    cardNumber: profile.cardNumber,
    level: progress.level,
    levelFraction: progress.fraction,
    rank: t(`rank.${rankTitle(progress.level)}`),
    stats,
    showcase: profile.game.showcase,
    achievements: profile.game.achievements.length,
    since: cardSince(profile.joinedAt),
    avatarUrl: profile.avatarUrl,
    variant: cardVariant(facts),
    unlocked: unlockedVariants(facts),
  }
}

/**
 * La pieza del perfil (§3.8.10, §3.4.4; tarea 7.22): la carta plana con «[C] Girar carta» y sus variantes. Las ganadas
 * se pueden ver (la carta sale con la más alta); las demás dicen cómo se ganan. C gira la carta desde cualquier parte
 * de la pantalla con los atajos de una tecla encendidos y, apagados, con el foco en la pieza (WCAG 2.1.4). La 3D colgada
 * de su pase llega con la 7.23; sin WebGL o con «reducir movimiento» se queda esta (`RF-GAME-07`).
 */
export function ProfileCard({ profile }: { profile: PublicProfile }) {
  const { unlocked, variant, ...card } = profileCardProps(profile)
  const [side, setSide] = useState<CardSide>('front')
  const [shown, setShown] = useState<CardVariant>(variant)
  const [described, setDescribed] = useState<CardVariant>(variant)
  const pieceRef = useRef<HTMLDivElement>(null)
  const shortcuts = useShortcuts((state) => state.enabled)
  const howId = useId()
  const flip = () => setSide((value) => (value === 'front' ? 'back' : 'front'))

  // Otro perfil (la misma ruta con otro nombre): su carta, de frente y con su variante.
  useEffect(() => {
    setSide('front')
    setShown(variant)
    setDescribed(variant)
  }, [variant])

  // C gira la carta (§3.4.4), como la barra de controles dice.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `flip` solo cambia el estado
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return
      if (event.key.toLowerCase() !== 'c') return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!singleKeyAllowed(Boolean(target && pieceRef.current?.contains(target)))) return
      event.preventDefault()
      flip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts])

  return (
    <div ref={pieceRef} className={styles.piece}>
      <ProducerCard
        {...card}
        variant={shown}
        side={side}
        back={{
          profileUrl: `${window.location.origin}${paths.profile(profile.username)}`,
          qrSrc: profileQrPath(profile.username),
        }}
        interactive
      />
      <div className={styles.cardControls}>
        <Button
          variant="outline"
          size="sm"
          keyHint={t('frame.keys.glyph.c')}
          aria-pressed={side === 'back'}
          onClick={flip}
        >
          {t('pages.profile.card.flip')}
        </Button>
        <fieldset className={styles.variants}>
          <legend className="sr-only">{t('pages.profile.card.variants')}</legend>
          {CARD_VARIANTS.map((value) => {
            const owned = unlocked.includes(value)
            const name = t(`ui.producerCard.variants.${value}.name`)
            return (
              <button
                key={value}
                type="button"
                className={styles.variant}
                aria-pressed={shown === value}
                aria-disabled={owned ? undefined : true}
                aria-describedby={howId}
                data-locked={owned ? undefined : ''}
                onFocus={() => setDescribed(value)}
                onPointerEnter={() => setDescribed(value)}
                onClick={() => owned && setShown(value)}
              >
                {name}
                {!owned && <span className="sr-only">{t('pages.profile.card.variantLocked')}</span>}
              </button>
            )
          })}
        </fieldset>
        <p id={howId} className={styles.variantHow}>
          {t(`ui.producerCard.variants.${described}.name`)}
          {' · '}
          {t(`pages.profile.card.variantHow.${described}`)}
        </p>
      </div>
    </div>
  )
}
