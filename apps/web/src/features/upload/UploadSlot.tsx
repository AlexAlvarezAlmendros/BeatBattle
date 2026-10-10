import { MUSICAL_KEYS, type MusicalKey } from '@beatbattle/shared'
import { type DragEvent, useEffect, useId, useRef, useState } from 'react'
import { audio } from '../../audio/engine'
import { formatDuration, t } from '../../i18n'
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
}: {
  analysis: EntryAnalysis
  onFile: (file: File) => void
  onReset: () => void
  /** Llevarse el foco al llegar (la página de subir); en la edición, el foco empieza en la ficha. */
  autoFocus?: boolean
}) {
  const reduced = useReducedMotion()
  const inputRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const hintId = useId()
  const [over, setOver] = useState(false)
  const [jolt, setJolt] = useState(0)
  const [slot, setSlot] = useState(0)

  const idle = analysis.stage === 'idle' || analysis.stage === 'problem'
  // Al llegar, «Elegir archivo» tiene el foco: Intro abre el selector (foco = cursor, §3.3).
  useEffect(() => {
    if (idle && autoFocus) pickRef.current?.focus({ preventScroll: true })
  }, [idle, autoFocus])

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
          <h2 id={titleId} className={cx('bb-display', styles.title)}>
            {t('pages.upload.slot.title')}
          </h2>
          <p id={hintId} className={styles.hint}>
            {t('pages.upload.slot.hint')}
          </p>
          <div className={styles.actions}>
            <Button ref={pickRef} variant="cta" size="lg" keyHint={t('pages.upload.slot.key')} onClick={pick}>
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
  const spinBpm = 60 + ((slot * 37) % 120)
  const spinKey = MUSICAL_KEYS[(slot * 7) % MUSICAL_KEYS.length] as MusicalKey

  return (
    <Frame
      as="section"
      variant="stage"
      cut="lg"
      texture={false}
      className={styles.slot}
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className={cx('bb-label', styles.file)}>
        {analysis.file.name}
      </h2>
      <div
        className={styles.wave}
        aria-busy={!ready || undefined}
        // La onda se dibuja de izquierda a derecha con el progreso; mientras se lee, el esqueleto entero.
        style={peaks.length > 0 ? { clipPath: `inset(0 ${100 - pct}% 0 0)` } : undefined}
      >
        <Waveform peaks={peaks} height={64} decorative animateIn={false} loading={peaks.length === 0} />
      </div>
      <p className={styles.chips} aria-live="polite">
        {spinning && !reduced ? (
          <>
            <DataChip className={styles.chip} data-spinning="" value={spinBpm} unit="BPM" />
            <DataChip className={styles.chip} data-spinning="" value={musicalKeyName(spinKey)} word />
            <span className="sr-only">{t('pages.upload.analysis.busy', { pct })}</span>
          </>
        ) : spinning ? (
          <span className={styles.busy}>{t('pages.upload.analysis.busy', { pct })}</span>
        ) : (
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
        <Button variant="outline" onClick={onReset}>
          {t('pages.upload.slot.change')}
        </Button>
      </div>
    </Frame>
  )
}
