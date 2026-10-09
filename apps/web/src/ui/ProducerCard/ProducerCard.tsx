import { type CSSProperties, useRef } from 'react'
import { t } from '../../i18n'
import { frameAttributes } from '../Frame'
import { cx } from '../forceState'
import { useFitText } from '../hooks/useFitText'
import { OtpSlapImage } from '../OtpSlap'
import styles from './ProducerCard.module.css'

export interface ProducerCardProps {
  name: string
  initials: string
  cardNumber: number
  level: number
  /** Fracción del nivel actual, `[0, 1]` (el arco del sello). */
  levelFraction: number
  rank: string
  stats: { wins: number; podiums: number; weeks: number }
  /** Hasta tres logros de la vitrina; los huecos van en silueta. */
  showcase?: readonly string[]
  /** «10/2026»: mes y año de alta. */
  since: string
  /** Foto del avatar (256 px, cuadrada); sin ella, el monograma. */
  avatarUrl?: string | null
  className?: string
}

/**
 * Carta de productor, anverso plano (guía §3.4.4; versión simple de la Fase 2, tareas 2.17 y 2.18): número
 * de alta, sello de nivel con su arco, retrato (la foto en duotono rojo y negro o, sin ella, el monograma), nombre, rango en rojo, tres
 * estadísticas, vitrina de tres logros y el pie con la pegatina OTP. La carta 3D colgada de su pase llega
 * con la capa de juego (Fase 7).
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
  since,
  avatarUrl,
  className,
}: ProducerCardProps) {
  const nameRef = useRef<HTMLParagraphElement>(null)
  // El nombre en una línea (§3.4.4): baja la anchura y después el cuerpo antes que partir a mitad de palabra.
  useFitText(nameRef, name, { minFontPx: 14 })
  const slots = [0, 1, 2].map((i) => showcase[i] ?? null)
  const arc = Math.max(0, Math.min(1, levelFraction))
  return (
    <article
      {...frameAttributes({ cut: 'lg' })}
      className={cx(styles.card, className)}
      aria-label={t('ui.producerCard.label', { name, number: cardNumber })}
      data-producer-card=""
    >
      <header className={styles.top}>
        <span className={styles.number}>#{String(cardNumber).padStart(4, '0')}</span>
        <span
          role="img"
          className={styles.seal}
          style={{ '--seal-arc': `${arc * 360}deg` } as CSSProperties}
          aria-label={t('ui.producerCard.level', { level })}
        >
          <span className={styles.sealInner}>
            <span className={styles.sealLabel} aria-hidden="true">
              {t('ui.producerCard.levelShort')}
            </span>
            {level}
          </span>
        </span>
      </header>
      <div className={styles.portrait} aria-hidden="true" data-duotone={avatarUrl ? '' : undefined}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" width={256} height={256} loading="lazy" />
        ) : (
          <span className={styles.monogram}>{initials}</span>
        )}
      </div>
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
      <ul className={styles.showcase} aria-label={t('ui.producerCard.showcase')}>
        {slots.map((achievement, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: tres huecos fijos
          <li key={i} className={styles.slot} data-empty={achievement ? undefined : ''}>
            {achievement ?? <span className="sr-only">{t('ui.producerCard.emptySlot')}</span>}
          </li>
        ))}
      </ul>
      <footer className={styles.footer}>
        <span>{t('ui.producerCard.since', { since })}</span>
        <OtpSlapImage size="bar" />
      </footer>
    </article>
  )
}
