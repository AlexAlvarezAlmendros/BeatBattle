import { duration } from '@beatbattle/shared/tokens'
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Signature } from '../../../app/layout/ControlsBar'
import { SoundButton } from '../../../app/layout/Hud'
import { useSound } from '../../../app/layout/soundStore'
import { audio } from '../../../audio/engine'
import { formatDuration, t } from '../../../i18n'
import { DataChip } from '../../../ui/Chip'
import { Cursor } from '../../../ui/Cursor'
import { Frame } from '../../../ui/Frame'
import { cx } from '../../../ui/forceState'
import { GameLogo } from '../../../ui/GameLogo'
import { useFitText } from '../../../ui/hooks/useFitText'
import { useReducedMotion } from '../../../ui/hooks/useReducedMotion'
import { Key } from '../../../ui/Key'
import { Medal } from '../../../ui/Medal'
import { lockScroll, pushModalLayer, trapTab } from '../../../ui/Modal/focus'
import { OtpSlapImage } from '../../../ui/OtpSlap'
import { RoundClock, RoundClockWeek } from '../../../ui/RoundClock'
import { singleKeyAllowed } from '../../../ui/shortcuts'
import { Tag } from '../../../ui/Tag'
import { TitleDisc } from '../../../ui/TitleDisc'
import { TitleLockup } from '../../../ui/TitleLockup'
import type { MenuModel } from './model'
import styles from './TitleGate.module.css'
import { markTitleSeen } from './titleGate'

/**
 * Tiempos de la línea de la puerta (§3.6: los tiempos internos de las ceremonias viven en su línea de
 * tiempo, no en tokens). El arranque «[OTP.] PRESENTA» dura ~1,2 s; la salida, lo que tarda la diagonal en
 * abrir la pantalla.
 */
const BOOT_MS = 1200
const LEAVE_MS = duration.slam

type Phase = 'boot' | 'title' | 'leaving'

/** Teclas que no entran: las que se usan dentro de la puerta o las que solas no son una pulsación. */
const KEYS_THAT_STAY = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'm', 'M'])

/**
 * Puerta de entrada «PULSA PARA EMPEZAR» (guía §3.8.1, tarea 1.13; maqueta `00-titulo`): la primera vez
 * que se entra al menú en cada sesión, a pantalla completa y modal (el menú ya está debajo, en el DOM).
 *
 * 1. **Arranque** (~1,2 s, saltable con cualquier tecla, clic o toque): negro, la pegatina *OTP.* se pega y
 *    aparece «PRESENTA».
 * 2. **Título**: el logo cae (1,12 → 1, `--bb-dur-slam`), el *lockup* debajo y, a la derecha, el disco de la
 *    semana cortado por la diagonal y girando al BPM. «◀ PULSA PARA EMPEZAR ▶» respira; debajo, cómo entrar
 *    y «Entrar sin sonido [S]». Abajo, el campeón vigente y el cartel EN JUEGO con la semana y su reloj.
 * 3. **Al pulsar** (Intro, cualquier tecla, clic o toque): se crea el `AudioContext`, suena `ui.enter` y la
 *    diagonal abre la pantalla hacia el menú. «Entrar sin sonido» (o S) entra con el sonido apagado.
 *
 * Tab recorre lo que se puede pulsar dentro (empezar, sin sonido, el sonido) y M cambia el sonido sin
 * entrar. Sin movimiento, el título aparece montado, nada respira y se entra sin la diagonal.
 */
export function TitleGate({ model, onDone }: { model: MenuModel; onDone: () => void }) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<Phase>(reduced ? 'title' : 'boot')
  const root = useRef<HTMLDivElement>(null)
  const start = useRef<HTMLButtonElement>(null)
  const layer = useMemo(() => ({}), [])
  const setSound = useSound((state) => state.set)
  const toggleSound = useSound((state) => state.toggle)
  const titleId = useId()
  const billTitleRef = useRef<HTMLHeadingElement>(null)
  // El título del cartel, en una línea mientras quepa (antes un título largo se iba a 5 líneas y tapaba el disco).
  useFitText(billTitleRef, model.week?.title ?? '', { minFontPx: 22 })
  const hintId = useId()
  const week = model.week

  useEffect(() => {
    if (phase !== 'boot') return
    const timer = window.setTimeout(() => setPhase('title'), BOOT_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  // Modal: la página no se desplaza y la puerta es la capa de arriba; el foco, dentro.
  useLayoutEffect(() => {
    const releaseScroll = lockScroll()
    const releaseLayer = pushModalLayer(layer)
    root.current?.focus({ preventScroll: true })
    return () => {
      releaseLayer()
      releaseScroll()
    }
  }, [layer])

  useEffect(() => {
    if (phase === 'title') start.current?.focus({ preventScroll: true })
  }, [phase])

  const enter = (muted: boolean) => {
    if (phase === 'leaving') return
    markTitleSeen()
    // El gesto que crea el contexto de audio (`RD-SND-01`): también al entrar sin sonido.
    audio.unlock()
    if (muted) setSound(false)
    else audio.play('ui.enter')
    if (reduced) {
      onDone()
      return
    }
    setPhase('leaving')
    window.setTimeout(onDone, LEAVE_MS)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Nada de lo que se pulsa aquí llega al menú de debajo.
    event.stopPropagation()
    if (phase === 'boot') {
      event.preventDefault()
      setPhase('title')
      return
    }
    if (event.key === 'Tab') {
      if (root.current && trapTab(root.current, event.shiftKey)) event.preventDefault()
      return
    }
    // M (sonido) y S (sin sonido) son atajos de una tecla: con ellos apagados (`RNF-A11Y-08`, WCAG 2.1.4),
    // M no hace nada y S entra como cualquier otra tecla.
    const shortcuts = singleKeyAllowed()
    if (event.key === 'm' || event.key === 'M') {
      if (shortcuts && !event.ctrlKey && !event.metaKey && !event.altKey) toggleSound()
      return
    }
    if (KEYS_THAT_STAY.has(event.key) || event.ctrlKey || event.metaKey || event.altKey) return
    // Intro o Espacio sobre otro botón de la puerta (sin sonido, el sonido): lo acciona él.
    const target = event.target as HTMLElement
    if ((event.key === 'Enter' || event.key === ' ') && target !== start.current && target.closest('button'))
      return
    event.preventDefault()
    enter(shortcuts && (event.key === 's' || event.key === 'S'))
  }

  // La galleta solo cabe una tonalidad corta («Re menor»): con una larga («Fa sostenido menor»), solo el BPM
  // (la tonalidad sigue en los chips del cartel).
  const discSub = week
    ? (week.musicalKey.length <= 9
        ? t('home.gate.discSub', { bpm: week.bpm, key: week.musicalKey })
        : t('home.stage.bpm', { bpm: week.bpm })
      ).toLocaleUpperCase('es')
    : ''

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: la puerta entera se pulsa (clic o toque en cualquier sitio, §3.8.1)
    <div
      ref={root}
      className={styles.gate}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      tabIndex={-1}
      data-title-gate=""
      data-phase={phase}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (phase === 'boot') {
          setPhase('title')
          return
        }
        if ((event.target as HTMLElement).closest('button, a')) return
        enter(false)
      }}
    >
      <div className={styles.backdrop} aria-hidden="true">
        <div className={styles.burst} data-fx="" />
        {week && (
          <TitleDisc
            className={styles.disc}
            label={t('home.stage.vinylLabel', { number: week.number })}
            sub={discSub}
            bpm={week.bpm}
          />
        )}
        <div className={cx(styles.slash, styles.slashRed)} />
        <div className={cx(styles.slash, styles.slashBlack)} />
        <div className={cx(styles.slash, styles.slashWhite)} />
        <div className={styles.vignette} />
      </div>

      <div className={styles.boot} aria-hidden={phase !== 'boot'}>
        <OtpSlapImage size="title" className={styles.bootSlap} />
        <span className={styles.presents}>{t('home.gate.presents')}</span>
      </div>

      <div className={styles.screen}>
        <div className={styles.top}>
          {week && (
            <span className={cx('bb-label', styles.kicker)}>
              {model.season
                ? t('home.gate.topSeason', { season: model.season, week: week.number, code: week.code })
                : t('home.gate.top', { week: week.number, code: week.code })}
            </span>
          )}
          <SoundButton />
        </div>

        <div className={styles.presentsRow}>
          <OtpSlapImage size="presents" />
          <span className={styles.presents}>{t('home.gate.presents')}</span>
        </div>

        <div className={styles.title}>
          <h1 id={titleId} className="sr-only">
            {t('home.gate.heading')}
          </h1>
          <GameLogo className={styles.logo} />
          <TitleLockup className={styles.lockup} />
        </div>

        <div className={styles.start}>
          <button
            ref={start}
            type="button"
            className={styles.startButton}
            data-cursor=""
            onClick={() => enter(false)}
          >
            <Cursor />
            {/* Respira el texto, no el botón: el cursor de foco no se apaga (`RNF-A11Y-01`). */}
            <span className={styles.startText}>
              <span className={cx(styles.tri, styles.triLeft)} aria-hidden="true" />
              {t('home.gate.start')}
              <span className={styles.tri} aria-hidden="true" />
            </span>
          </button>
          <p id={hintId} className={styles.hint}>
            <span>{t('home.gate.hint')}</span>
            <button type="button" className={styles.muted} onClick={() => enter(true)} aria-keyshortcuts="S">
              {t('home.gate.muted')} <Key aria-hidden="true">S</Key>
            </button>
          </p>
        </div>

        {week && (
          // En una columna (móvil), el disco va entre las piezas y no detrás del texto (`RD-VIS-05`).
          <TitleDisc
            className={styles.discInline}
            label={t('home.stage.vinylLabel', { number: week.number })}
            sub={discSub}
            bpm={week.bpm}
          />
        )}

        {model.champion && (
          <p className={styles.champion} data-title-champion="">
            <Medal place={1} className={styles.medal} />
            <span className={styles.championLabel}>{t('home.gate.champion')}</span>
            <b className={styles.championName}>{model.champion.producer}</b>
            <span>
              {t('home.gate.championDetail', {
                week: model.champion.week,
                title: model.champion.title,
                score: model.champion.score,
              })}
            </span>
          </p>
        )}

        {week && (
          <Frame
            as="aside"
            cut="lg"
            className={styles.bill}
            aria-labelledby={`${titleId}-bill`}
            data-title-bill=""
          >
            <span className={styles.billTag}>
              <Tag tone="red">{t('home.gate.inPlay')}</Tag>
            </span>
            <span className="bb-label">
              {t('home.gate.billKickerBefore')} <b className={styles.billNumber}>{week.number}</b>{' '}
              {t('home.gate.billKickerAfter')}
            </span>
            <h2 ref={billTitleRef} id={`${titleId}-bill`} className={cx('bb-display', styles.billTitle)}>
              {week.title}
            </h2>
            <div className={styles.billChips}>
              <DataChip value={week.bpm} unit={t('home.stage.bpmUnit')} />
              <DataChip value={week.musicalKey} word />
              <DataChip value={formatDuration(week.durationSeconds)} />
            </div>
            <div className={styles.billClock}>
              <div className={styles.billRow}>
                <RoundClock variant="bill" target={week.closesAt} label={t('home.gate.closes')} />
                <span className={styles.billEntries}>
                  <b>{week.entries}</b>
                  {t('home.gate.inBattle')}
                </span>
              </div>
              <RoundClockWeek week={week.weekBar} className={styles.billWeek} />
            </div>
          </Frame>
        )}

        <footer className={styles.footer}>
          <span className={styles.credit}>
            {t('home.gate.credit')} <em>{t('home.gate.creditValue')}</em>
          </span>
          <Signature />
          <span className={styles.url}>{t('home.gate.url')}</span>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
