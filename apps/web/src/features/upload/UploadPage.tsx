import type { CurrentWeek } from '@beatbattle/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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
  const slug = week?.slug ?? null

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
    body = <EditEntry week={week} />
  } else if (!week.viewer?.rulesAccepted) {
    body = (
      <div className={styles.gate}>
        <p className={styles.lead}>{t('pages.upload.rules.summary', { number: week.number })}</p>
        <div className={styles.actions}>
          <Button variant="cta" size="lg" onClick={() => setRulesOpen(true)}>
            {t('pages.upload.rules.open')}
          </Button>
        </div>
        {rulesError && <PaperNotice live>{rulesError}</PaperNotice>}
      </div>
    )
  } else {
    body = (
      <>
        <UploadSlot
          analysis={analysis.state}
          onFile={(file) => {
            upload.reset()
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
                <Button size="sm" variant="outline" onClick={() => void send(lastSheet)}>
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

  return (
    <ScreenPage
      title={t('pages.upload.title')}
      kicker={week ? t('pages.upload.kicker', { number: week.number }) : undefined}
      fill
      // En la columna única (móvil, tableta), la ranura antes que el vinilo: es la acción de la pantalla.
      panelFirst
      piece={piece}
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
