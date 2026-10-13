import type { CurrentWeek } from '@beatbattle/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { paths } from '../../app/paths'
import { ScreenPage } from '../../app/ScreenPage'
import { t } from '../../i18n'
import { ApiClientError } from '../../net/api'
import { queryKeys } from '../../net/queryKeys'
import { acceptRules, useCurrentWeek } from '../../net/weeks'
import { Button } from '../../ui/Button'
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton'
import { VinylSun } from '../../ui/VinylSun'
import { Done, PaperNotice } from '../account/FormBits'
import { RulesModal } from '../week/RulesModal'
import { EditEntry } from './EditEntry'
import { EntrySheet, type EntrySheetResult } from './EntrySheet'
import { clearDraft, EMPTY_DRAFT, type EntryDraft, loadDraft, saveDraft } from './entrySheet'
import styles from './UploadPage.module.css'
import { UploadCelebration, UploadMeter } from './UploadProgress'
import { UploadSlot } from './UploadSlot'
import { useEntryAnalysis } from './useEntryAnalysis'
import { useEntryUpload } from './useEntryUpload'

/**
 * `/subir` — «INSERTA TU BEAT» (§2.5, §3.8.5; tareas 4.14–4.18), solo cuentas verificadas (la ruta lo
 * exige). Antes de la ranura, las comprobaciones previas (§2.5, paso 1): semana en `open` (si no, «Envíos
 * cerrados», `RF-ENT-02`), bases aceptadas (se aceptan aquí mismo) y sin entrada (si ya la tiene, a su
 * edición). Luego la ranura con el análisis local.
 */
export function UploadPage() {
  const { data, isPending } = useCurrentWeek()
  const queryClient = useQueryClient()
  const analysis = useEntryAnalysis()
  const [rulesOpen, setRulesOpen] = useState(false)
  const [rulesBusy, setRulesBusy] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const week = data?.week ?? null
  const upload = useEntryUpload()
  const [draft, setDraft] = useState<EntryDraft>(EMPTY_DRAFT)
  const [lastSheet, setLastSheet] = useState<EntrySheetResult | null>(null)
  const [withdrawn, setWithdrawn] = useState(false)
  const rulesRef = useRef<HTMLButtonElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const slug = week?.slug ?? null
  const needsRules = Boolean(
    week && week.phase === 'open' && !week.viewer?.entry && !week.viewer?.rulesAccepted,
  )

  // Las bases: al llegar, el cursor en «Leer las bases», la acción de la pantalla (§3.3; jurado de la 4.20, A9).
  useEffect(() => {
    if (needsRules) rulesRef.current?.focus({ preventScroll: true })
  }, [needsRules])

  // El borrador de la semana vuelve si se recarga o algo falla (`RF-ENT-12`).
  useEffect(() => {
    if (!slug) return
    const saved = loadDraft(slug)
    if (saved) setDraft(saved)
  }, [slug])

  // Al terminar el análisis, BPM y tonalidad sugeridos donde aún no hay nada escrito (`RF-ENT-06`).
  const ready = analysis.state.stage === 'ready' ? analysis.state : null
  useEffect(() => {
    if (!ready) return
    setDraft((prev) => ({
      ...prev,
      bpm: prev.bpm || (ready.bpm === null ? '' : String(ready.bpm)),
      musicalKey: prev.musicalKey || (ready.musicalKey ?? ''),
    }))
  }, [ready])

  // Tras un error de subida, el medidor desaparece: el foco va a «Volver a intentarlo», junto al motivo,
  // en vez de caer en `<body>` (jurado de la 4.20, A4).
  const failed = upload.state.stage === 'error'
  useEffect(() => {
    if (failed) retryRef.current?.focus()
  }, [failed])

  const changeDraft = (next: EntryDraft) => {
    setDraft(next)
    if (slug) saveDraft(slug, next)
  }

  const send = async (sheet: EntrySheetResult) => {
    if (!week || !ready) return
    setLastSheet(sheet)
    const entry = await upload.start({
      weekSlug: week.slug,
      file: ready.file,
      durationMs: ready.durationMs,
      sheet,
    })
    if (entry) {
      clearDraft(week.slug)
      void queryClient.invalidateQueries({ queryKey: queryKeys.weeks.all })
    }
  }

  const accept = async () => {
    if (!week) return
    setRulesBusy(true)
    setRulesError(null)
    try {
      await acceptRules(week.slug)
      queryClient.setQueryData<CurrentWeek>(queryKeys.weeks.current(), (prev) =>
        prev?.week
          ? {
              ...prev,
              week: {
                ...prev.week,
                viewer: {
                  dropSeen: prev.week.viewer?.dropSeen ?? false,
                  entry: prev.week.viewer?.entry ?? null,
                  rulesAccepted: true,
                },
              },
            }
          : prev,
      )
      setRulesOpen(false)
    } catch (error) {
      setRulesError(
        error instanceof ApiClientError && error.code === 'SUBMISSIONS_CLOSED'
          ? t('pages.upload.closed.summary')
          : t('pages.upload.rules.error'),
      )
    } finally {
      setRulesBusy(false)
    }
  }

  const piece = (
    <div className={styles.piece}>
      <VinylSun
        stage
        className={styles.vinyl}
        label={week ? `S${week.number}` : 'BB'}
        sub={week?.sample.bpm ? `${Math.round(week.sample.bpm)} BPM` : ''}
        bpm={week?.sample.bpm ?? 90}
      />
    </div>
  )

  let body: React.ReactNode
  if (isPending) {
    body = (
      <SkeletonGroup>
        <Skeleton height="12rem" />
      </SkeletonGroup>
    )
  } else if (!week || week.phase !== 'open') {
    body = (
      <div className={styles.gate}>
        <PaperNotice live={false}>{t('pages.upload.closed.summary')}</PaperNotice>
        <div className={styles.actions}>
          {week && (
            <Button to={paths.week(week.slug)} variant="outline">
              {t('pages.upload.closed.week')}
            </Button>
          )}
        </div>
      </div>
    )
  } else if (upload.state.stage === 'done') {
    body = <UploadCelebration entry={upload.state.entry} weekNumber={week.number} />
  } else if (upload.state.stage === 'uploading' || upload.state.stage === 'registering') {
    const current = upload.state
    body = (
      <UploadMeter
        sent={current.stage === 'uploading' ? current.sent : current.total}
        total={current.total}
        speed={current.stage === 'uploading' ? current.speed : null}
        remaining={current.stage === 'uploading' ? current.remaining : null}
        registering={current.stage === 'registering'}
        onCancel={upload.cancel}
      />
    )
  } else if (week.viewer?.entry) {
    body = <EditEntry week={week} onWithdrawn={() => setWithdrawn(true)} />
  } else if (!week.viewer?.rulesAccepted) {
    body = (
      <div className={styles.gate}>
        <p className={styles.lead}>{t('pages.upload.rules.summary', { number: week.number })}</p>
        <div className={styles.actions}>
          <Button ref={rulesRef} variant="cta" size="lg" onClick={() => setRulesOpen(true)}>
            {t('pages.upload.rules.open')}
          </Button>
        </div>
        {rulesError && <PaperNotice live>{rulesError}</PaperNotice>}
      </div>
    )
  } else {
    body = (
      <>
        {/* Tras retirar la entrada, lo dice antes de la ranura vacía (jurado de la 4.20, J10). */}
        {withdrawn && analysis.state.stage === 'idle' && <Done>{t('pages.upload.edit.withdrawn')}</Done>}
        <UploadSlot
          analysis={analysis.state}
          autoFocus={!withdrawn}
          onFile={(file) => {
            upload.reset()
            setWithdrawn(false)
            void analysis.start(file)
          }}
          onReset={() => {
            upload.reset()
            analysis.reset()
          }}
        />
        {upload.state.stage === 'error' && (
          <PaperNotice
            live
            action={
              lastSheet && (
                <Button ref={retryRef} size="sm" variant="outline" onClick={() => void send(lastSheet)}>
                  {t('pages.upload.retry')}
                </Button>
              )
            }
          >
            {upload.state.message}
          </PaperNotice>
        )}
        {upload.state.stage === 'idle' && upload.state.cancelled && (
          <Done>{t('pages.upload.progress.cancelled')}</Done>
        )}
        {ready && (
          <EntrySheet
            draft={draft}
            onChange={changeDraft}
            onSubmit={(sheet) => void send(sheet)}
            blind={week.blind}
          />
        )}
      </>
    )
  }

  // Llenan el alto (pantalla de contenido) la hoja y la edición; la ranura, las bases, el medidor y la
  // celebración son de poco contenido y centran su bloque, sin un panel estirado y medio vacío (§3.8.14;
  // jurado de la 4.20, J5). Mientras sube, el pie no ofrece «Volver al menú [Esc]»: Esc cancela (A7).
  const moving = upload.state.stage === 'uploading' || upload.state.stage === 'registering'
  const long = Boolean(week?.viewer?.entry) || (ready !== null && !moving && upload.state.stage !== 'done')
  return (
    <ScreenPage
      title={t('pages.upload.title')}
      kicker={week ? t('pages.upload.kicker', { number: week.number }) : undefined}
      fill={long}
      // En la columna única (móvil, tableta), la ranura antes que el vinilo: es la acción de la pantalla.
      panelFirst
      // El vinilo arriba y a la vista mientras se desplaza la hoja: centrado en un panel largo bajaba fuera
      // de la vista y dejaba la cuña desnuda (jurado de la 4.20, J2 y M1).
      pieceAlign="start"
      piece={piece}
      actions={moving ? null : undefined}
    >
      <div className={styles.body}>{body}</div>
      {week && (
        <RulesModal
          open={rulesOpen}
          weekNumber={week.number}
          busy={rulesBusy}
          error={null}
          onClose={() => setRulesOpen(false)}
          onAccept={() => void accept()}
          submitLabel={t('pages.upload.rules.submit')}
        />
      )}
    </ScreenPage>
  )
}
