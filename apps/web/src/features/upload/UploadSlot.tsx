import { MUSICAL_KEYS, type MusicalKey } from '@beatbattle/shared'
import { type DragEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { audio } from '../../audio/engine'
import { formatDuration, t } from '../../i18n'
import { announce, ensureAnnouncer } from '../../ui/announce'
import { Button } from '../../ui/Button'
import { DataChip } from '../../ui/Chip'
import { Frame } from '../../ui/Frame'
import { cx } from '../../ui/forceState'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import { Waveform } from '../../ui/Waveform'
import { PaperNotice } from '../account/FormBits'
import { musicalKeyName } from '../week/weekModel'
import styles from './UploadSlot.module.css'
import type { EntryAnalysis } from './useEntryAnalysis'

/** Extensiones y tipos que ofrece el selector de ficheros (la comprobación de verdad es `checkEntryFile`). */
const ACCEPT =
  '.wav,.wave,.aif,.aiff,.flac,.mp3,audio/wav,audio/x-wav,audio/aiff,audio/x-aiff,audio/flac,audio/mpeg'
/** Paso de la tragaperras de BPM y tonalidad mientras se analiza (como la revelación del drop). */
const SLOT_STEP_MS = 70

/**
 * Un rodillo de la tragaperras: una ventana que deja ver el valor y asoma el anterior y el siguiente; en
 * cada paso, la tira baja una posición (jurado de la 4.20, J4). Solo con movimiento: sin él no gira.
 */
function Reel({ step, values }: { step: number; values: readonly [ReactNode, ReactNode, ReactNode] }) {
  const [next, current, previous] = values
  return (
    <span className={styles.reel}>
      <span key={step} className={styles.strip}>
        <span>{next}</span>
        <span>{current}</span>
        <span>{previous}</span>
      </span>
    </span>
  )
}

/**
 * La ranura «INSERTA TU BEAT» (§3.8.5; tarea 4.14): se arrastra o se elige el fichero (Intro con el foco en
 * «Elegir archivo», que lo tiene al llegar). Al arrastrar encima se ilumina y vibra una vez. Al soltar, la
 * onda se dibuja de izquierda a derecha con el progreso del análisis y BPM y tonalidad giran como una
 * tragaperras hasta fijarse; sin movimiento, sin giro ni vibración. Un fichero que no vale dice por qué
 * en un aviso de papel y la ranura sigue esperando.
 */
export function UploadSlot({
  analysis,
  onFile,
  onReset,
  autoFocus = true,
  compact = false,
}: {
  analysis: EntryAnalysis
  onFile: (file: File) => void
  onReset: () => void
  /** Llevarse el foco al llegar (la página de subir); en la edición, el foco empieza en la ficha. */
  autoFocus?: boolean
  /**
   * La ranura de sustituir el audio en la edición: acción secundaria, con su rótulo pequeño («Nuevo audio»)
   * en vez del display y sin la tecla [INTRO], que es de «Guardar la ficha» (jurado de la 4.20, J9 y M8).
   */
  compact?: boolean
}) {
  const reduced = useReducedMotion()
  const inputRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const hintId = useId()
  const [over, setOver] = useState(false)
  const [jolt, setJolt] = useState(0)
  const [slot, setSlot] = useState(0)
  const fileRef = useRef<HTMLHeadingElement>(null)

  const idle = analysis.stage === 'idle' || analysis.stage === 'problem'
  // Al llegar, «Elegir archivo» tiene el foco: Intro abre el selector (foco = cursor, §3.3). Si queda fuera
  // de la vista (tras retirar, a 320), la vista va a él (jurado de la 4.20, A3).
  useEffect(() => {
    if (idle && autoFocus) {
      pickRef.current?.focus({ preventScroll: true })
      pickRef.current?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [idle, autoFocus])

  // Al elegir el fichero, el botón desaparece: el foco va al nombre del fichero, el título del análisis, en
  // vez de caer en `<body>` (A4). El lector oye «Analizando…» una vez y el resultado al final, no los
  // valores falsos de la tragaperras (A6).
  const stage = analysis.stage
  useEffect(() => {
    if (stage === 'reading') {
      ensureAnnouncer()
      fileRef.current?.focus({ preventScroll: true })
      announce(t('pages.upload.analysis.label'))
    }
  }, [stage])
  const readyBpm = analysis.stage === 'ready' ? analysis.bpm : null
  const readyKey = analysis.stage === 'ready' ? analysis.musicalKey : null
  // Solo al pasar de analizar a listo: si la ranura vuelve a montarse ya lista (tras cancelar o tras un
  // error de subida), no se repite el resultado (jurado de la 4.20, A10).
  const previousStage = useRef(stage)
  useEffect(() => {
    const from = previousStage.current
    previousStage.current = stage
    if (stage !== 'ready' || from === 'ready') return
    announce(
      readyBpm === null || readyKey === null
        ? t('pages.upload.analysis.readyAnnounceNone')
        : t('pages.upload.analysis.readyAnnounce', { bpm: readyBpm, key: musicalKeyName(readyKey) }),
    )
  }, [stage, readyBpm, readyKey])

  const spinning = analysis.stage === 'reading' || analysis.stage === 'analyzing'
  useEffect(() => {
    if (!spinning || reduced) return
    const timer = window.setInterval(() => setSlot((value) => value + 1), SLOT_STEP_MS)
    return () => window.clearInterval(timer)
  }, [spinning, reduced])

  const pick = () => inputRef.current?.click()
  const onDragEnter = (event: DragEvent) => {
    event.preventDefault()
    if (!over) {
      setOver(true)
      setJolt((value) => value + 1)
      // Una vez por entrada en la ranura (el motor no deja más de uno cada 0,5 s).
      audio.play('upload.hover')
    }
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setOver(false)
    const file = event.dataTransfer.files[0]
    if (file) {
      audio.play('upload.drop')
      onFile(file)
    }
  }

  const input = (
    <input
      ref={inputRef}
      className={styles.input}
      type="file"
      accept={ACCEPT}
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) {
          audio.play('upload.drop')
          onFile(file)
        }
      }}
    />
  )

  if (idle)
    return (
      <div className={styles.wrap}>
        <Frame
          as="section"
          variant="stage"
          cut="lg"
          texture={false}
          className={styles.slot}
          data-over={over || undefined}
          data-jolt={!reduced && jolt > 0 ? jolt % 2 : undefined}
          aria-labelledby={titleId}
          aria-describedby={hintId}
          onDragEnter={onDragEnter}
          onDragOver={(event: DragEvent) => event.preventDefault()}
          onDragLeave={(event: DragEvent) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
          }}
          onDrop={onDrop}
        >
          {compact ? (
            <h3 id={titleId} className={cx('bb-label', styles.compactTitle)}>
              {t('pages.upload.slot.replaceTitle')}
            </h3>
          ) : (
            <h2 id={titleId} className={cx('bb-display', styles.title)}>
              {t('pages.upload.slot.title')}
            </h2>
          )}
          <p id={hintId} className={styles.hint}>
            {t('pages.upload.slot.hint')}
          </p>
          {/* La boca de la ranura: la hendidura con sus flechas, donde se suelta el beat (J5). */}
          <div className={styles.mouth} aria-hidden="true">
            <span className={styles.chevrons}>
              <span />
              <span />
              <span />
            </span>
            <span className={styles.slit} />
          </div>
          <div className={styles.actions}>
            <Button
              ref={pickRef}
              variant="cta"
              size={compact ? 'md' : 'lg'}
              keyHint={compact ? undefined : t('pages.upload.slot.key')}
              onClick={pick}
            >
              {t('pages.upload.slot.pick')}
            </Button>
            <span className={styles.drop}>{t('pages.upload.slot.drop')}</span>
          </div>
          {input}
        </Frame>
        {analysis.stage === 'problem' && <PaperNotice live>{analysis.message}</PaperNotice>}
      </div>
    )

  const ready = analysis.stage === 'ready'
  const pct = analysis.stage === 'analyzing' ? analysis.pct : ready ? 100 : 0
  const peaks = analysis.stage === 'analyzing' || ready ? analysis.peaks : []
  const durationMs = analysis.stage === 'analyzing' || ready ? analysis.durationMs : null
  const bpm = ready ? analysis.bpm : null
  const key: MusicalKey | null = ready ? analysis.musicalKey : null
  // Lo que enseña el rodillo en el paso `n` (el anterior y el siguiente asoman por arriba y por abajo).
  const bpmAt = (n: number) => 60 + ((((n * 37) % 120) + 120) % 120)
  const keyAt = (n: number) =>
    musicalKeyName(
      MUSICAL_KEYS[
        (((n * 7) % MUSICAL_KEYS.length) + MUSICAL_KEYS.length) % MUSICAL_KEYS.length
      ] as MusicalKey,
    )

  return (
    <Frame
      as="section"
      variant="stage"
      cut="lg"
      texture={false}
      className={styles.slot}
      aria-labelledby={titleId}
    >
      {(() => {
        const Heading = compact ? 'h3' : 'h2'
        return (
          <Heading
            ref={fileRef}
            id={titleId}
            tabIndex={-1}
            data-focus-target="heading"
            className={cx('bb-label', styles.file)}
          >
            {analysis.file.name}
          </Heading>
        )
      })()}
      <div
        className={styles.wave}
        aria-busy={!ready || undefined}
        // La onda se dibuja de izquierda a derecha con el progreso, en rojo y con la cabeza blanca en el
        // borde; mientras se lee, el esqueleto entero.
        style={peaks.length > 0 && !ready ? { clipPath: `inset(0 ${100 - pct}% 0 0)` } : undefined}
      >
        <Waveform
          peaks={peaks}
          height={64}
          decorative
          animateIn={false}
          loading={peaks.length === 0}
          progress={ready ? 1 : pct / 100}
          playhead={!ready && peaks.length > 0}
        />
      </div>
      {spinning && (
        <p className={styles.busy} aria-hidden="true">
          {t('pages.upload.analysis.label')}…<span className={styles.busyPct}>{`${pct}\u00a0%`}</span>
        </p>
      )}
      <p className={styles.chips} aria-hidden={spinning || undefined}>
        {spinning && !reduced ? (
          <>
            <DataChip
              className={styles.chip}
              data-spinning=""
              value={<Reel step={slot} values={[bpmAt(slot + 1), bpmAt(slot), bpmAt(slot - 1)]} />}
              unit="BPM"
            />
            <DataChip
              className={cx(styles.chip, styles.keyChip)}
              data-spinning=""
              value={<Reel step={slot} values={[keyAt(slot + 1), keyAt(slot), keyAt(slot - 1)]} />}
              word
            />
          </>
        ) : spinning ? null : (
          <>
            <DataChip className={styles.chip} value={bpm ?? '—'} unit="BPM" />
            <DataChip className={styles.chip} value={key ? musicalKeyName(key) : '—'} word />
            {durationMs !== null && (
              <DataChip className={styles.chip} value={formatDuration(durationMs / 1000)} unit="Min" />
            )}
          </>
        )}
      </p>
      {ready && (
        <p className={styles.note}>
          {bpm === null || key === null
            ? t('pages.upload.analysis.noSuggestion')
            : t('pages.upload.analysis.done')}
        </p>
      )}
      <div className={styles.actions}>
        <Button variant="outline" size={compact ? 'md' : undefined} onClick={onReset}>
          {t('pages.upload.slot.change')}
        </Button>
      </div>
    </Frame>
  )
}
