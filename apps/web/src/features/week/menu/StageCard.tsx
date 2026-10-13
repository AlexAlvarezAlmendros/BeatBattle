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
import { useSamplePlayer } from '../useSamplePlayer'
import { DropAlertForm } from './DropAlertForm'
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
export function StageCard({ week, nextDrop }: { week: MenuWeek | null; nextDrop?: string | null }) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  useFitText(titleRef, week?.title ?? '')
  const player = useSamplePlayer(week?.streamUrl, week?.durationSeconds ?? 0)
  if (!week) return <EmptyStage titleId={titleId} nextDrop={nextDrop ?? null} />
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
          icon={player.playing ? 'pause' : 'triangleRight'}
          aria-label={t(player.playing ? 'home.stage.pause' : 'home.stage.listen', { title: week.title })}
          aria-pressed={player.playing}
          onClick={player.toggle}
        />
        <div className={styles.wave}>
          <Waveform peaks={week.peaks} height={40} decorative animateIn={false} progress={player.progress} />
        </div>
        <span className={styles.time}>
          {t('home.stage.time', {
            current: formatDuration(player.current),
            total: formatDuration(week.durationSeconds),
          })}
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
        {week.challenge ? (
          <p className={styles.challenge}>
            <Tag tone="white">{t('home.stage.challenge')}</Tag> {week.challenge}
          </p>
        ) : (
          <span />
        )}
        <p className={styles.entries}>
          <b>{week.entries}</b> {t('home.stage.inBattle')}
        </p>
      </div>
    </Frame>
  )
}

/**
 * Sin semana en juego (§2.19, §3.8.3): sin reloj. Con el próximo drop programado, cuándo cae; con el
 * calendario vacío, «Próximo drop pronto» (`RF-DROP-04`). Y el formulario «Avísame del próximo drop»
 * (§2.12.3, `RF-NOTIF-09`).
 */
function EmptyStage({ titleId, nextDrop }: { titleId: string; nextDrop: string | null }) {
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
        <span className={cx('bb-label', styles.range)} data-next-drop={nextDrop ? '' : undefined}>
          {nextDrop ?? t('home.empty.whenSoon')}
        </span>
      </p>
      <h2 id={titleId} className={cx('bb-display', styles.title, styles.emptyTitle)}>
        {t('home.empty.title')}
      </h2>
      <p className={styles.credits}>{t('home.empty.summary')}</p>
      <section id={DROP_ALERT_ID} className={styles.alert} aria-labelledby={alertId}>
        <h3 id={alertId} className={styles.alertTitle}>
          {t('home.dropAlert.title')}
        </h3>
        <p className={styles.alertText}>{t('home.dropAlert.summary')}</p>
        <DropAlertForm />
      </section>
    </Frame>
  )
}
