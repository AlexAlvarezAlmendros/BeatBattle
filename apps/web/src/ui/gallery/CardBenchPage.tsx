import type { AchievementId } from '@beatbattle/rules'
import { useState } from 'react'
import { DocumentTitle } from '../../app/DocumentTitle'
import { t } from '../../i18n'
import { profileQrPath } from '../../net/game'
import { Button } from '../Button'
import { CARD_VARIANTS, type CardSide, type CardVariant, ProducerCard } from '../ProducerCard'
import styles from './CardBenchPage.module.css'

/** Lo que lleva cada variante en el banco: los datos de la maqueta `05-perfil`, más o menos. */
const SAMPLES: Record<
  CardVariant,
  { name: string; level: number; wins: number; podiums: number; weeks: number; showcase: AchievementId[] }
> = {
  standard: { name: 'aina', level: 4, wins: 0, podiums: 0, weeks: 3, showcase: ['first_entry'] },
  red: { name: 'nuria.beats', level: 10, wins: 0, podiums: 2, weeks: 9, showcase: ['podium', 'streak_3'] },
  holo: {
    name: 'kairo.wav',
    level: 13,
    wins: 2,
    podiums: 5,
    weeks: 18,
    showcase: ['win', 'golden_ear', 'streak_3'],
  },
  champion: {
    name: 'productora.nocturna',
    level: 17,
    wins: 4,
    podiums: 9,
    weeks: 26,
    showcase: ['season_champ', 'win_3', 'night_owl'],
  },
}

/**
 * `/dev/carta` (solo en desarrollo; tarea 7.22): la carta de productor en sus cuatro variantes, anverso y reverso, para
 * mirarla y capturarla (`tools/shot`). La primera fila gira con C o con su botón, como en el perfil.
 */
export function CardBenchPage() {
  const [side, setSide] = useState<CardSide>('front')
  return (
    <div className={styles.page}>
      <DocumentTitle page={t('dev.card.title')} />
      <h1 className="bb-display">{t('dev.card.title')}</h1>
      <p className={styles.intro}>{t('dev.card.intro')}</p>
      <Button
        variant="outline"
        size="sm"
        keyHint={t('frame.keys.glyph.c')}
        onClick={() => setSide((value) => (value === 'front' ? 'back' : 'front'))}
      >
        {t('pages.profile.card.flip')}
      </Button>
      {(['front', 'back'] as const).map((row) => (
        <section key={row} className={styles.row} aria-label={t(`dev.card.${row}`)}>
          <h2 className="bb-label">{t(`dev.card.${row}`)}</h2>
          <div className={styles.cards}>
            {CARD_VARIANTS.map((variant) => {
              const sample = SAMPLES[variant]
              return (
                <figure key={variant} className={styles.cell}>
                  <ProducerCard
                    name={sample.name}
                    initials={sample.name.slice(0, 2).toUpperCase()}
                    cardNumber={42}
                    level={sample.level}
                    levelFraction={0.6}
                    rank={t('rank.grooveArchitect')}
                    stats={sample}
                    showcase={sample.showcase}
                    achievements={sample.showcase.length + 6}
                    since="03/2026"
                    variant={variant}
                    side={row === 'back' ? 'back' : side}
                    back={{
                      profileUrl: `${window.location.origin}/p/${sample.name}`,
                      qrSrc: profileQrPath(sample.name),
                    }}
                    interactive
                  />
                  <figcaption className="bb-label">
                    {t(`ui.producerCard.variants.${variant}.name`)}
                  </figcaption>
                </figure>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
