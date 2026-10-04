import { useId, useRef } from 'react'
import { DROP_ALERT_ID } from '../../../app/paths'
import { formatDuration, t } from '../../../i18n'
import { HalftoneCanvas } from '../../../ui/arena/HalftoneCanvas'
import { Button } from '../../../ui/Button'
import { DataChip } from '../../../ui/Chip'
import { Frame } from '../../../ui/Frame'
import { cx } from '../../../ui/forceState'
import { useFitText } from '../../../ui/hooks/useFitText'
import { RoundClock } from '../../../ui/RoundClock'
import { Tag } from '../../../ui/Tag'
import { VinylSun } from '../../../ui/VinylSun'
import { Waveform } from '../../../ui/Waveform'
import type { MenuWeek } from './model'
import styles from './StageCard.module.css'

/**
 * Tarjeta del escenario de la semana (guía §3.8.3): marco rojo con trama (`Frame` `stage`). Con la
 * semana en juego, el vinilo-sol girando, «SEMANA 41 · ESCENARIO», el título, los créditos, los chips
 * (BPM, tonalidad, duración, género sugerido), el play con la onda, el reto y las entradas en la
 * batalla; en móvil, compacta y con el reloj en línea. Sin semana (calendario vacío, §2.19), «El
 * próximo drop está en el horno» y el hueco del formulario «Avísame del próximo drop» (§2.12.3, que
 * llega con la Fase 3).
 *
 * El título del escenario es el elemento más grande con texto de la home: su LCP (`RNF-PERF-02`). Sale
 * con la primera pintura, sin entrada animada.
 */
export function StageCard({ week }: { week: MenuWeek | null }) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  useFitText(titleRef, week?.title ?? '')
  if (!week) return <EmptyStage titleId={titleId} />
  return (
    <Frame
      as="article"
      variant="stage"
      cut="lg"
      texture={false}
      className={styles.card}
      aria-labelledby={titleId}
    >
      <HalftoneCanvas className={styles.halftone} shape="piece" cell={8} angle={45} ink="wine" />
      <div className={styles.top}>
        <VinylSun
          className={styles.vinyl}
          label={t('home.stage.vinylLabel', { number: week.number })}
          sub={t('home.stage.bpm', { bpm: week.bpm })}
          bpm={week.bpm}
        />
        <div className={styles.heading}>
          <p className={styles.kickers}>
            <span className="bb-label">
              {t('home.stage.kickerBefore')} <b className={styles.number}>{week.number}</b>{' '}
              {t('home.stage.kickerAfter')}
            </span>
            <span className={cx('bb-label', styles.range)}>{week.range}</span>
          </p>
          <h2 ref={titleRef} id={titleId} className={cx('bb-display', styles.title)}>
            {week.title}
          </h2>
          <p className={styles.credits}>{week.credits}</p>
        </div>
      </div>
      <div className={styles.chips}>
        <DataChip value={week.bpm} unit={t('home.stage.bpmUnit')} />
        <DataChip value={week.musicalKey} word />
        <DataChip value={formatDuration(week.durationSeconds)} unit={t('home.stage.minUnit')} />
        <DataChip
          className={styles.genre}
          value={week.genre}
          unit={t('home.stage.suggested')}
          unitFirst
          word
        />
        <DataChip className={styles.mobileOnly} value={week.entries} unit={t('home.stage.inBattleShort')} />
      </div>
      <div className={styles.play}>
        <Button
          className={styles.playButton}
          variant="white"
          iconOnly
          icon="triangleRight"
          aria-label={t('home.stage.listen', { title: week.title })}
        />
        <div className={styles.wave}>
          <Waveform peaks={week.peaks} height={40} decorative animateIn={false} />
        </div>
        <span className={styles.time}>
          {t('home.stage.time', { current: formatDuration(0), total: formatDuration(week.durationSeconds) })}
        </span>
        <RoundClock
          className={styles.mobileClock}
          target={week.closesAt}
          label={t(week.phase === 'open' ? 'home.stage.closesShort' : 'home.stage.votesShort')}
          variant="inline"
          when={week.clockWhen}
          week={week.weekBar}
        />
      </div>
      <div className={styles.foot}>
        <p className={styles.challenge}>
          <Tag tone="white">{t('home.stage.challenge')}</Tag> {week.challenge}
        </p>
        <p className={styles.entries}>
          <b>{week.entries}</b> {t('home.stage.inBattle')}
        </p>
      </div>
    </Frame>
  )
}

/** Calendario vacío (§2.19, §3.8.3): sin reloj, con el hueco de «Avísame del próximo drop». */
function EmptyStage({ titleId }: { titleId: string }) {
  const alertId = useId()
  return (
    <Frame
      as="article"
      variant="stage"
      cut="lg"
      texture={false}
      className={styles.card}
      aria-labelledby={titleId}
    >
      <HalftoneCanvas className={styles.halftone} shape="piece" cell={8} angle={45} ink="wine" />
      <p className={cx(styles.kickers, styles.emptyKickers)}>
        <span className={cx('bb-label', styles.kickerRed)}>{t('home.empty.kicker')}</span>
        <span className={cx('bb-label', styles.range)}>{t('home.empty.when')}</span>
      </p>
      <h2 id={titleId} className={cx('bb-display', styles.title, styles.emptyTitle)}>
        {t('home.empty.title')}
      </h2>
      <p className={styles.credits}>{t('home.empty.summary')}</p>
      <section id={DROP_ALERT_ID} className={styles.alert} aria-labelledby={alertId}>
        <h3 id={alertId} className={styles.alertTitle}>
          <Tag tone="white">{t('home.empty.alertTag')}</Tag> {t('home.dropAlert.title')}
        </h3>
        <p className={styles.alertText}>{t('home.dropAlert.summary')}</p>
      </section>
    </Frame>
  )
}
