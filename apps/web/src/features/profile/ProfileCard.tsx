import { levelProgress, rankTitle } from '@beatbattle/rules'
import type { PublicProfile } from '@beatbattle/shared'
import { useEffect, useId, useRef, useState } from 'react'
import { useControlKeys } from '../../app/layout/screen'
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
import { loadCardAssets } from '../../ui/ProducerCard/cardCanvas'
import { singleKeyAllowed, useShortcuts } from '../../ui/shortcuts'
import { initialsOf, useSession } from '../account/session'
import { StoryButton } from '../share/StoryButton'
import { shareStory } from '../share/shareStory'
import type { StoryCard } from '../share/storyCard'
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
 * «Mi carta de productor» para *stories* (§2.15, §3.4.4; tarea 7.28): la carta pintada por CPU desde `cardModel` con lo
 * público del perfil, en la variante que se está viendo, y la dirección del perfil.
 */
export async function producerStory(profile: PublicProfile, variant?: CardVariant): Promise<StoryCard> {
  const { unlocked: _unlocked, variant: best, avatarUrl, ...card } = profileCardProps(profile)
  const assets = await loadCardAssets(avatarUrl)
  return {
    kind: 'producer',
    card: { ...card, variant: variant ?? best, ...assets },
    url: `${window.location.origin}${paths.profile(profile.username)}`,
  }
}

/** Nombre del PNG de la carta. */
export const producerStoryFile = (username: string) => t('stories.producerFile', { username })

/**
 * La pieza del perfil (§3.8.10, §3.4.4; tareas 7.22 y 7.28): la carta plana con «[C] Girar carta» y sus variantes. Las
 * ganadas se pueden ver (la carta sale con la más alta); las demás dicen cómo se ganan. C gira la carta desde cualquier
 * parte de la pantalla con los atajos de una tecla encendidos y, apagados, con el foco en la pieza (WCAG 2.1.4). En el
 * perfil propio, «[D] Compartir mi carta» la exporta para *stories* (Web Share con el fichero o descarga) y declara
 * `share_card`; D, con las mismas reglas que C. La 3D colgada de su pase llega con la 7.23; sin WebGL o con «reducir
 * movimiento» se queda esta (`RF-GAME-07`).
 */
export function ProfileCard({ profile }: { profile: PublicProfile }) {
  const { unlocked, variant, ...card } = profileCardProps(profile)
  const [side, setSide] = useState<CardSide>('front')
  const [shown, setShown] = useState<CardVariant>(variant)
  const [described, setDescribed] = useState<CardVariant>(variant)
  const pieceRef = useRef<HTMLDivElement>(null)
  const shortcuts = useShortcuts((state) => state.enabled)
  const own = useSession((state) => state.me?.username === profile.username)
  const sharing = useRef(false)
  const howId = useId()
  const flip = () => setSide((value) => (value === 'front' ? 'back' : 'front'))
  // En el perfil propio, la barra dice también «[D] PARA STORIES».
  useControlKeys(own ? ['flip', 'story', 'back', 'sound'] : null)
  const share = async () => {
    if (sharing.current) return
    sharing.current = true
    try {
      await shareStory({
        card: await producerStory(profile, shown),
        fileName: producerStoryFile(profile.username),
        shared: { kind: 'producer' },
      })
    } finally {
      sharing.current = false
    }
  }

  // Otro perfil (la misma ruta con otro nombre): su carta, de frente y con su variante.
  useEffect(() => {
    setSide('front')
    setShown(variant)
    setDescribed(variant)
  }, [variant])

  // C gira la carta y, en la propia, D la exporta para stories (§3.4.4), como la barra de controles dice.
  const shareRef = useRef(share)
  shareRef.current = share
  // biome-ignore lint/correctness/useExhaustiveDependencies: `flip` solo cambia el estado y `share` va por su ref
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented || event.repeat) return
      const key = event.key.toLowerCase()
      if (key !== 'c' && !(key === 'd' && own)) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!singleKeyAllowed(Boolean(target && pieceRef.current?.contains(target)))) return
      event.preventDefault()
      if (key === 'c') flip()
      else void shareRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts, own])

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
        {own && (
          <StoryButton
            size="sm"
            keyHint={t('frame.keys.glyph.d')}
            fileName={producerStoryFile(profile.username)}
            shared={{ kind: 'producer' }}
            card={() => producerStory(profile, shown)}
          >
            {t('pages.profile.card.share')}
          </StoryButton>
        )}
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
