import type { AchievementId } from '@beatbattle/rules'
import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { AchievementBadge, achievementName } from '../AchievementBadge'
import { HalftoneCanvas } from '../arena/HalftoneCanvas'
import { frameAttributes } from '../Frame'
import { cx } from '../forceState'
import { GameLogo } from '../GameLogo'
import { useFitText } from '../hooks/useFitText'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { OtpSlapImage } from '../OtpSlap'
import { Tag } from '../Tag'
import { type CardVariant, cardNumberLabel } from './cardModel'
import styles from './ProducerCard.module.css'
import { ProfileQr } from './ProfileQr'

export type CardSide = 'front' | 'back'

export interface ProducerCardProps {
  name: string
  initials: string
  cardNumber: number
  level: number
  /** Fracción del nivel actual, `[0, 1]` (el arco del sello). */
  levelFraction: number
  rank: string
  stats: { wins: number; podiums: number; weeks: number }
  /** Hasta tres logros de la vitrina (conseguidos); los huecos van en silueta. */
  showcase?: readonly AchievementId[]
  /** Logros conseguidos que enseña el perfil: «Vitrina · 3 de 14». Sin el dato, solo «Vitrina». */
  achievements?: number
  /** «10/2026»: mes y año de alta. */
  since: string
  /** Foto del avatar (256 px, cuadrada); sin ella, el monograma. */
  avatarUrl?: string | null
  /** Variante (§3.4.4): estándar, roja, holo o de campeón. Por defecto, la estándar. */
  variant?: CardVariant
  /** Cara que se ve (la controla quien la usa: la tecla C del perfil). Por defecto, el anverso. */
  side?: CardSide
  /** Dirección del perfil: el QR del reverso. Sin ella, la carta no tiene reverso. */
  profileUrl?: string
  /**
   * La carta sigue al puntero: se inclina y la lámina holo brilla hacia él (Anexo E, «Carta de luchador»). Con
   * «reducir movimiento», la carta plana (`RF-GAME-07`): ni inclinación, ni giro, ni brillo que se mueva.
   */
  interactive?: boolean
  className?: string
}

/** Pares de la lámina: la holo y la de campeón siguen al puntero. */
const FOILED: readonly CardVariant[] = ['holo', 'champion']

/**
 * Carta de productor (guía §3.4.4, §2.10; tarea 7.22): la carta coleccionable de luchador (63 × 88, inclinada −3°) en
 * 2D, que es también la **carta plana** de `RF-GAME-07` (la 3D colgada de su pase llega con la 7.23 y la usa tal cual
 * sin WebGL o con «reducir movimiento»).
 *
 * - **Anverso**: número «#0042», sello circular de nivel con su arco, retrato sobre trama (la foto en duotono o el
 *   monograma con extrusión), etiqueta de variante, nombre en display, rango en rojo, victorias · podios · semanas,
 *   vitrina de tres logros y pie «BEAT BATTLE · DESDE 03/2026» con la pegatina OTP.
 * - **Reverso**: logo del juego, pegatina OTP, QR del perfil, el nombre y la fecha de alta.
 * - **Variantes**, todas en la paleta: estándar (negra), roja (rango ≥ Productor), holo (ha ganado alguna semana:
 *   lámina roja, blanca y granate que sigue la inclinación) y campeón (campeón de temporada: lámina roja con corona).
 *
 * Ningún texto va sobre la trama (`RD-VIS-05`): el número, el sello y la etiqueta llevan su placa opaca, y el
 * monograma es un dibujo. La cara que no se ve queda fuera del árbol accesible y del foco (`inert`).
 */
export function ProducerCard({
  name,
  initials,
  cardNumber,
  level,
  levelFraction,
  rank,
  stats,
  showcase = [],
  achievements,
  since,
  avatarUrl,
  variant = 'standard',
  side = 'front',
  profileUrl,
  interactive = false,
  className,
}: ProducerCardProps) {
  const cardRef = useRef<HTMLElement>(null)
  const nameRef = useRef<HTMLParagraphElement>(null)
  // El nombre en una línea (§3.4.4): baja la anchura y después el cuerpo antes que partir a mitad de palabra.
  useFitText(nameRef, name, { minFontPx: 14 })
  const flat = useReducedMotion()
  const showing: CardSide = profileUrl ? side : 'front'
  // El reverso, una vez visto, se queda con su QR (para girar de vuelta sin que desaparezca a medio giro).
  const [backSeen, setBackSeen] = useState(showing === 'back')
  useEffect(() => {
    if (showing === 'back') setBackSeen(true)
  }, [showing])
  const slots = [0, 1, 2].map((i) => showcase[i] ?? null)
  const arc = Math.max(0, Math.min(1, levelFraction))
  const tilt = interactive && !flat

  // La inclinación y el brillo siguen al puntero (sin re-render: variables CSS en la propia carta).
  const follow = (event: PointerEvent<HTMLElement>) => {
    const card = cardRef.current
    if (!tilt || !card) return
    const box = card.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width - 0.5
    const y = (event.clientY - box.top) / box.height - 0.5
    card.style.setProperty('--card-px', x.toFixed(3))
    card.style.setProperty('--card-py', y.toFixed(3))
  }
  const rest = () => {
    cardRef.current?.style.removeProperty('--card-px')
    cardRef.current?.style.removeProperty('--card-py')
  }

  return (
    <article
      ref={cardRef}
      className={cx(styles.card, className)}
      aria-label={[
        t('ui.producerCard.label', { name, number: cardNumber }),
        t(`ui.producerCard.variants.${variant}.label`, { wins: stats.wins }),
      ].join(', ')}
      data-producer-card=""
      data-variant={variant}
      data-side={showing}
      data-flat={flat || undefined}
      data-tilt={tilt || undefined}
      onPointerMove={tilt ? follow : undefined}
      onPointerLeave={tilt ? rest : undefined}
    >
      <div className={styles.flipper}>
        <section
          {...frameAttributes({ cut: 'lg' })}
          className={cx(styles.face, styles.front)}
          aria-hidden={showing === 'front' ? undefined : true}
          inert={showing !== 'front'}
          data-face="front"
        >
          <div className={styles.art}>
            <HalftoneCanvas
              shape="podiumFloor"
              ink={variant === 'red' ? 'redShade' : 'red'}
              className={styles.halftone}
            />
            <div className={styles.portrait} aria-hidden="true" data-duotone={avatarUrl ? '' : undefined}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" width={256} height={256} loading="lazy" />
              ) : (
                <Monogram initials={initials} />
              )}
            </div>
            {FOILED.includes(variant) && <span className={styles.foil} aria-hidden="true" />}
            <span className={styles.number}>{cardNumberLabel(cardNumber)}</span>
            <span
              role="img"
              className={styles.seal}
              style={{ '--seal-arc': `${arc * 360}deg` } as CSSProperties}
              aria-label={t('ui.producerCard.level', { level })}
            >
              <span className={styles.sealInner}>
                <span className={styles.sealLevel}>{level}</span>
                <span className={styles.sealLabel} aria-hidden="true">
                  {t('ui.producerCard.levelShort')}
                </span>
              </span>
            </span>
            {variant === 'champion' && <Crown />}
            {variant !== 'standard' && (
              <Tag tone={variant === 'champion' ? 'red' : 'white'} className={styles.tag}>
                {t(`ui.producerCard.variants.${variant}.tag`, { wins: stats.wins })}
              </Tag>
            )}
          </div>
          <div className={styles.body}>
            <p ref={nameRef} className={cx('bb-display', styles.name)}>
              {name}
            </p>
            <p className={styles.rank}>{rank}</p>
            <dl className={styles.stats}>
              {(['wins', 'podiums', 'weeks'] as const).map((key) => (
                <div key={key}>
                  <dt>{t(`ui.producerCard.stats.${key}`)}</dt>
                  <dd>{stats[key]}</dd>
                </div>
              ))}
            </dl>
            <div className={styles.case}>
              <ul className={styles.showcase} aria-label={t('ui.producerCard.showcase')}>
                {slots.map((achievement, i) =>
                  achievement ? (
                    <li key={achievement} className={styles.slot}>
                      <AchievementBadge id={achievement} unlocked className={styles.badge} />
                      <span className="sr-only">{achievementName(achievement, true)}</span>
                    </li>
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: huecos fijos
                    <li key={`empty-${i}`} className={styles.slot} data-empty="">
                      <span className="sr-only">{t('ui.producerCard.emptySlot')}</span>
                    </li>
                  ),
                )}
              </ul>
              <p className={styles.caseLabel} aria-hidden="true">
                <span>{t('ui.producerCard.showcaseShort')}</span>
                {achievements !== undefined && (
                  <span>
                    {t('ui.producerCard.showcaseCount', {
                      shown: slots.filter(Boolean).length,
                      total: achievements,
                    })}
                  </span>
                )}
              </p>
            </div>
            <footer className={styles.footer}>
              <span>{t('ui.producerCard.since', { since })}</span>
              <OtpSlapImage size="bar" />
            </footer>
          </div>
        </section>
        {profileUrl && (
          <section
            {...frameAttributes({ cut: 'lg' })}
            className={cx(styles.face, styles.back)}
            aria-hidden={showing === 'back' ? undefined : true}
            inert={showing !== 'back'}
            data-face="back"
          >
            <span className={styles.backNumber}>{cardNumberLabel(cardNumber)}</span>
            <GameLogo compact className={styles.backLogo} />
            <div className={styles.qrBox}>
              {/* El QR solo se calcula la primera vez que se gira la carta (su trozo va aparte). */}
              {backSeen ? <ProfileQr url={profileUrl} /> : <span className={styles.qrPending} />}
            </div>
            <p className={styles.backUrl}>{profileUrl.replace(/^https?:\/\//, '')}</p>
            <footer className={styles.backFooter}>
              <span>{t('ui.producerCard.joined', { since })}</span>
              <OtpSlapImage size="bar" />
            </footer>
          </section>
        )}
      </div>
    </article>
  )
}

/**
 * El monograma del retrato sin foto (§3.4.4: «con extrusión»): las iniciales en display, blancas con contorno negro y
 * extrusión roja en capas, como el logo. Es un dibujo (`<svg>`): va sobre la trama del retrato sin ser texto.
 */
function Monogram({ initials }: { initials: string }) {
  const layers = [6, 5, 4, 3, 2, 1]
  return (
    <svg viewBox="0 0 200 120" className={styles.monogram} focusable="false" aria-hidden="true">
      {layers.map((step) => (
        <text
          key={step}
          x={100 + step * 1.6}
          y={86 + step * 1.8}
          className={styles.monogramDepth}
          textAnchor="middle"
        >
          {initials}
        </text>
      ))}
      <text x="100" y="86" className={styles.monogramFace} textAnchor="middle">
        {initials}
      </text>
    </svg>
  )
}

/** La corona de la carta de campeón (§3.4.4): la del disco de oro, en grande sobre el retrato. */
function Crown() {
  return (
    <svg viewBox="0 0 24 24" className={styles.crown} focusable="false" aria-hidden="true">
      <path d="M3 18L2 7l6 5 4-8 4 8 6-5-1 11z" />
    </svg>
  )
}
