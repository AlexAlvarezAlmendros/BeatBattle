import type { AchievementId } from '@beatbattle/rules'
import { useEffect, useState } from 'react'
import { DocumentTitle } from '../../app/DocumentTitle'
import { drawStory, STORY_HEIGHT, STORY_WIDTH } from '../../features/share/storyCard'
import { t } from '../../i18n'
import { profileQrPath } from '../../net/game'
import { Button } from '../Button'
import { CARD_VARIANTS, type CardSide, type CardVariant, ProducerCard } from '../ProducerCard'
import { loadCardAssets } from '../ProducerCard/cardCanvas'
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

/** «Mi carta de productor» para *stories* de cada variante (tarea 7.28), pintada en el lienzo por CPU. */
function StoryPreviews() {
  const [urls, setUrls] = useState<Partial<Record<CardVariant, string>>>({})
  useEffect(() => {
    let alive = true
    void (async () => {
      const assets = await loadCardAssets(null)
      for (const variant of CARD_VARIANTS) {
        const sample = SAMPLES[variant]
        const canvas = document.createElement('canvas')
        await drawStory(canvas, {
          kind: 'producer',
          card: {
            name: sample.name,
            initials: sample.name.slice(0, 2).toUpperCase(),
            cardNumber: 42,
            level: sample.level,
            levelFraction: 0.6,
            rank: t('rank.grooveArchitect'),
            stats: sample,
            showcase: sample.showcase,
            achievements: sample.showcase.length + 6,
            since: '03/2026',
            variant,
            ...assets,
          },
          url: `${window.location.origin}/p/${sample.name}`,
        })
        const url = canvas.toDataURL('image/png')
        if (alive) setUrls((value) => ({ ...value, [variant]: url }))
      }
    })()
    return () => {
      alive = false
    }
  }, [])
  return (
    <section className={styles.row} aria-label={t('dev.card.stories')}>
      <h2 className="bb-label">{t('dev.card.stories')}</h2>
      <div className={styles.cards}>
        {CARD_VARIANTS.map((variant) => (
          <figure key={variant} className={styles.cell}>
            {urls[variant] ? (
              <img
                className={styles.story}
                src={urls[variant]}
                width={STORY_WIDTH}
                height={STORY_HEIGHT}
                alt={t('dev.card.storyAlt', { variant: t(`ui.producerCard.variants.${variant}.label`) })}
                data-story={variant}
              />
            ) : (
              <span className={styles.story} />
            )}
            <figcaption className="bb-label">{t(`ui.producerCard.variants.${variant}.name`)}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

/**
 * `/dev/carta` (solo en desarrollo; tareas 7.22 y 7.28): la carta de productor en sus cuatro variantes, anverso y
 * reverso, y la tarjeta para *stories* pintada por CPU, para mirarlas y capturarlas (`tools/shot`). La primera fila
 * gira con C o con su botón, como en el perfil.
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
      <StoryPreviews />
    </div>
  )
}
