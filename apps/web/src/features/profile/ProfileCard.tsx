import type { PublicProfile } from '@beatbattle/shared'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useControlKeys } from '../../app/layout/screen'
import { hasWebGL, useStageAllowed } from '../../app/layout/stageGate'
import { paths } from '../../app/paths'
import { t } from '../../i18n'
import { profileQrPath } from '../../net/game'
import { useStageQuality } from '../../stage/quality'
import { type PassFace, useStagePass } from '../../stage/runtime'
import { whenIdleAfterFirstPaint } from '../../ui/afterFirstPaint'
import { Button } from '../../ui/Button'
import { useMediaQuery } from '../../ui/hooks/useMediaQuery'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { useSeriousMode } from '../../ui/hooks/useSeriousMode'
import {
  CARD_VARIANTS,
  type CardSide,
  type CardVariant,
  ProducerCard,
  profileCard,
} from '../../ui/ProducerCard'
import { loadCardFace } from '../../ui/ProducerCard/cardCanvas'
import { singleKeyAllowed, useShortcuts } from '../../ui/shortcuts'
import { useSession } from '../account/session'
import { StoryButton } from '../share/StoryButton'
import { shareStory } from '../share/shareStory'
import type { StoryCard } from '../share/storyCard'
import styles from './ProfilePage.module.css'

/**
 * «Mi carta de productor» para *stories* (§2.15, §3.4.4; tarea 7.28): la carta pintada por CPU desde `cardModel` con lo
 * público del perfil, en la variante que se está viendo, y la dirección del perfil.
 */
export async function producerStory(profile: PublicProfile, variant?: CardVariant): Promise<StoryCard> {
  const { unlocked: _unlocked, avatarUrl, ...front } = profileCard(profile)
  return {
    kind: 'producer',
    card: await loadCardFace({ ...front, variant: variant ?? front.variant }, avatarUrl),
    url: `${window.location.origin}${paths.profile(profile.username)}`,
  }
}

/** Nombre del PNG de la carta. */
export const producerStoryFile = (username: string) => t('stories.producerFile', { username })

/** Dos columnas (§3.8.14): la pieza va en la cuña, a la izquierda de la diagonal. */
export const TWO_COLUMNS_QUERY = '(min-width: 961px)'

/**
 * `localStorage['bb:pass']` = `on` cuelga la carta de su pase también en una columna, para mirar cómo quedaría en el
 * móvil (pruebas y depuración, como `bb:stage`); lo demás (WebGL, movimiento, calidad, modo serio) manda igual.
 */
export const PASS_OVERRIDE_KEY = 'bb:pass'

function passForced(): boolean {
  try {
    return window.localStorage.getItem(PASS_OVERRIDE_KEY) === 'on'
  } catch {
    return false
  }
}

/**
 * ¿Va la carta colgada de su pase (§3.4.4, `RF-GAME-07`; tarea 7.23)? Solo con el Escenario encendido y su calidad alta
 * o media (con la baja, el 3D es solo de las ceremonias, §3.5), sin «reducir movimiento», sin modo serio, sin contraste
 * alto (el lienzo no toma los colores del sistema) y en dos columnas: en una, la diagonal de la arena cruza la pieza y va
 * por encima del lienzo. Lo que aún no se sabe (la sonda de calidad, si hay WebGL) cuenta como sí: el hueco del pase se
 * reserva desde el principio y la carta no salta al llegar la 3D.
 */
export function usePassWanted(): boolean {
  const allowed = useStageAllowed()
  const reduced = useReducedMotion()
  const serious = useSeriousMode()
  const twoColumns = useMediaQuery(TWO_COLUMNS_QUERY)
  const forcedColors = useMediaQuery('(forced-colors: active)')
  const quality = useStageQuality((state) => state.quality)
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const [forced] = useState(passForced)
  // Como el Escenario: el contexto de prueba se crea después de la primera pintura.
  useEffect(() => whenIdleAfterFirstPaint(() => setWebgl(hasWebGL())), [])
  return (
    allowed &&
    !reduced &&
    !serious &&
    (twoColumns || forced) &&
    !forcedColors &&
    webgl !== false &&
    (quality === null || quality === 'alta' || quality === 'media')
  )
}

/**
 * La pieza del perfil (§3.8.10, §3.4.4; tareas 7.22, 7.23 y 7.28): la carta con «[C] Girar carta» y sus variantes. Las
 * ganadas se pueden ver (la carta sale con la más alta); las demás dicen cómo se ganan. C gira la carta desde cualquier
 * parte de la pantalla con los atajos de una tecla encendidos y, apagados, con el foco en la pieza (WCAG 2.1.4). En el
 * perfil propio, «[D] Compartir mi carta» la exporta para *stories* (Web Share con el fichero o descarga) y declara
 * `share_card`; D, con las mismas reglas que C.
 *
 * Con el Escenario (`usePassWanted`), la carta cuelga de su pase de torneo en una vista anclada (`useStagePass`, la pinta
 * el trozo del pase con Rapier) y se arrastra; la plana se queda debajo, transparente, para los lectores de pantalla y
 * el foco, y vuelve en cuanto el Escenario no la pinta. Sin WebGL, con «reducir movimiento», con la calidad apagada o
 * baja, en modo serio, en contraste alto o en una columna, la carta plana (`RF-GAME-07`).
 */
export function ProfileCard({ profile }: { profile: PublicProfile }) {
  const { unlocked, variant, ...card } = profileCard(profile)
  const [side, setSide] = useState<CardSide>('front')
  const [shown, setShown] = useState<CardVariant>(variant)
  const [described, setDescribed] = useState<CardVariant>(variant)
  const pieceRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLElement | null>(null)
  const shortcuts = useShortcuts((state) => state.enabled)
  const own = useSession((state) => state.me?.username === profile.username)
  const sharing = useRef(false)
  const howId = useId()
  const flip = () => setSide((value) => (value === 'front' ? 'back' : 'front'))
  const passWanted = usePassWanted()
  const back = {
    profileUrl: `${window.location.origin}${paths.profile(profile.username)}`,
    qrSrc: profileQrPath(profile.username),
  }
  const backKey = `${back.profileUrl}|${back.qrSrc}`
  const cardKey = JSON.stringify(card)
  // La 3D pinta el mismo anverso de `cardModel` que la plana (y que la tarjeta para stories), en la variante que se ve.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `cardKey` y `backKey` resumen `card` y `back`
  const face = useMemo((): PassFace => {
    const { avatarUrl, ...front } = card
    return { front: { ...front, variant: shown }, avatarUrl, back }
  }, [cardKey, backKey, shown])
  // La carta plana marca dónde descansa la 3D.
  useLayoutEffect(() => {
    cardRef.current = slotRef.current?.querySelector<HTMLElement>('[data-producer-card]') ?? null
  })
  const passLive = useStagePass(viewRef, cardRef, face, side, passWanted)
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
      <div
        ref={slotRef}
        className={styles.cardSlot}
        data-pass-room={passWanted || undefined}
        data-pass-live={passLive || undefined}
      >
        {passWanted && <div ref={viewRef} className={styles.passView} aria-hidden="true" data-pass-view="" />}
        <ProducerCard {...card} variant={shown} side={side} back={back} interactive />
      </div>
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
