import type { BeatGenre, OwnEntry, PublicWeek } from '@beatbattle/shared'
import { DAWS } from '@beatbattle/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { paths } from '../../app/paths'
import { formatDuration, t } from '../../i18n'
import { ApiClientError } from '../../net/api'
import { getMyEntry, signEntryUpload, updateEntry, withdrawEntry } from '../../net/entries'
import { queryKeys } from '../../net/queryKeys'
import { Button } from '../../ui/Button'
import { DataChip } from '../../ui/Chip'
import { GenerativeCover } from '../../ui/CoverArt/GenerativeCover'
import { Frame } from '../../ui/Frame'
import { cx } from '../../ui/forceState'
import { Modal } from '../../ui/Modal'
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton'
import { Done, PaperNotice } from '../account/FormBits'
import { musicalKeyName } from '../week/weekModel'
import { uploadInChunks } from './chunkedUpload'
import styles from './EditEntry.module.css'
import { EntrySheet, type EntrySheetResult } from './EntrySheet'
import { EMPTY_DRAFT, type EntryDraft } from './entrySheet'
import { UploadMeter } from './UploadProgress'
import { UploadSlot } from './UploadSlot'
import { useEntryAnalysis } from './useEntryAnalysis'
import { uploadErrorMessage, useEntryUpload } from './useEntryUpload'

/** La ficha de una entrada ya subida, como borrador de la hoja. */
export function draftOf(entry: OwnEntry): EntryDraft {
  const known = entry.daw !== null && (DAWS as readonly string[]).includes(entry.daw)
  return {
    ...EMPTY_DRAFT,
    title: entry.title,
    bpm: entry.bpm === null ? '' : String(entry.bpm),
    musicalKey: entry.musicalKey ?? '',
    daw: entry.daw === null ? '' : known ? (entry.daw as EntryDraft['daw']) : 'other',
    dawOther: entry.daw !== null && !known ? entry.daw : '',
    genres: entry.genres as BeatGenre[],
    description: entry.description ?? '',
  }
}

/**
 * `/subir` con la entrada ya subida (§2.5 «Después de subir»; tarea 4.18): la ficha y la portada se editan
 * hasta el cierre de envíos; el audio se sustituye solo sin votos (`RF-ENT-08`, mismo alias y mismo
 * recibo); y se retira con confirmación (`RF-ENT-09`: se borran el audio y sus votos y queda el hueco
 * libre).
 */
export function EditEntry({ week }: { week: PublicWeek }) {
  const queryClient = useQueryClient()
  const key = queryKeys.entries.mine(week.slug)
  const {
    data: entry,
    isPending,
    isError,
  } = useQuery({ queryKey: key, queryFn: ({ signal }) => getMyEntry(week.slug, signal) })
  const [draft, setDraft] = useState<EntryDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const analysis = useEntryAnalysis()
  const upload = useEntryUpload()

  if (isPending)
    return (
      <SkeletonGroup>
        <Skeleton height="10rem" />
      </SkeletonGroup>
    )
  if (isError || !entry) return <PaperNotice live={false}>{t('pages.upload.edit.loadError')}</PaperNotice>

  const current = draft ?? draftOf(entry)
  const refresh = (next: OwnEntry) => {
    queryClient.setQueryData(key, next)
    void queryClient.invalidateQueries({ queryKey: queryKeys.weeks.all })
  }

  const save = async ({ fields, cover, removeCover }: EntrySheetResult) => {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      let coverIntentId: string | null | undefined
      if (cover) {
        const signed = await signEntryUpload({
          kind: 'entryCover',
          weekSlug: week.slug,
          mime: cover.type as 'image/png',
          bytes: cover.size,
        })
        await uploadInChunks({
          file: cover,
          uploadUrl: signed.uploadUrl,
          fields: signed.fields,
          chunkBytes: signed.chunkBytes,
        })
        coverIntentId = signed.intentId
      } else if (removeCover) coverIntentId = null
      const { declaration: _, ...rest } = fields
      const next = await updateEntry(entry.id, {
        ...rest,
        ...(coverIntentId !== undefined ? { coverIntentId } : {}),
      })
      refresh(next)
      setDraft(null)
      setSaved(true)
    } catch (error) {
      setSaveError(uploadErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const replace = async () => {
    if (analysis.state.stage !== 'ready') return
    const next = await upload.start({
      weekSlug: week.slug,
      file: analysis.state.file,
      durationMs: analysis.state.durationMs,
      replacing: entry.id,
    })
    if (next) {
      refresh(next)
      analysis.reset()
    }
  }

  const withdraw = async () => {
    setWithdrawing(true)
    setWithdrawError(null)
    try {
      await withdrawEntry(entry.id)
      setConfirm(false)
      queryClient.removeQueries({ queryKey: key })
      await queryClient.invalidateQueries({ queryKey: queryKeys.weeks.all })
    } catch (error) {
      setWithdrawError(
        error instanceof ApiClientError && error.code === 'SUBMISSIONS_CLOSED'
          ? t('pages.upload.closed.summary')
          : t('pages.upload.edit.withdrawError'),
      )
    } finally {
      setWithdrawing(false)
    }
  }

  const meter =
    upload.state.stage === 'uploading' || upload.state.stage === 'registering' ? upload.state : null

  return (
    <div className={styles.edit}>
      <Frame as="section" variant="stage" cut="lg" texture={false} className={styles.summary}>
        <div className={styles.cover}>
          {entry.ownCoverUrl ? (
            <img src={entry.ownCoverUrl} alt="" />
          ) : (
            <GenerativeCover
              seed={entry.cover.kind === 'generative' ? entry.cover.seed : entry.id}
              bpm={entry.bpm}
              musicalKey={entry.musicalKey}
            />
          )}
        </div>
        <div className={styles.who}>
          <p className="bb-label">{t('pages.upload.edit.kicker', { receipt: entry.receiptCode })}</p>
          <h2 className={cx('bb-display', styles.alias)}>{entry.alias}</h2>
          <p className={styles.title}>{entry.title}</p>
          <p className={styles.chips}>
            {entry.bpm !== null && <DataChip value={Math.round(entry.bpm)} unit="BPM" />}
            {entry.musicalKey && <DataChip value={musicalKeyName(entry.musicalKey)} word />}
            <DataChip value={formatDuration(entry.durationMs / 1000)} unit="Min" />
          </p>
          {entry.status === 'processing' && (
            <p className={styles.note}>{t('pages.upload.done.processing')}</p>
          )}
          <div className={styles.actions}>
            <Button to={paths.entry(entry.id)} variant="outline" size="sm">
              {t('pages.upload.done.view')}
            </Button>
          </div>
        </div>
      </Frame>

      <EntrySheet
        mode="edit"
        draft={current}
        onChange={setDraft}
        onSubmit={(result) => void save(result)}
        blind={week.blind}
        busy={saving}
        hasOwnCover={entry.ownCoverUrl !== null}
      />
      {saved && <Done>{t('pages.upload.edit.saved')}</Done>}
      {saveError && <PaperNotice live>{saveError}</PaperNotice>}

      <section className={styles.block} aria-labelledby="replace-title">
        <h2 id="replace-title" className={cx('bb-display', styles.heading)}>
          {t('pages.upload.edit.replaceTitle')}
        </h2>
        {!entry.canReplaceAudio ? (
          <p className={styles.note}>{t('pages.upload.edit.hasVotes')}</p>
        ) : meter ? (
          <UploadMeter
            sent={meter.stage === 'uploading' ? meter.sent : meter.total}
            total={meter.total}
            speed={meter.stage === 'uploading' ? meter.speed : null}
            remaining={meter.stage === 'uploading' ? meter.remaining : null}
            registering={meter.stage === 'registering'}
            onCancel={upload.cancel}
          />
        ) : (
          <>
            <p className={styles.note}>{t('pages.upload.edit.replaceSummary')}</p>
            <UploadSlot
              analysis={analysis.state}
              onFile={(file) => void analysis.start(file)}
              onReset={analysis.reset}
            />
            {analysis.state.stage === 'ready' && (
              <div className={styles.actions}>
                <Button variant="cta" onClick={() => void replace()}>
                  {t('pages.upload.edit.replace')}
                </Button>
              </div>
            )}
            {upload.state.stage === 'done' && <Done>{t('pages.upload.edit.replaced')}</Done>}
            {upload.state.stage === 'error' && <PaperNotice live>{upload.state.message}</PaperNotice>}
          </>
        )}
      </section>

      <section className={styles.block} aria-labelledby="withdraw-title">
        <h2 id="withdraw-title" className={cx('bb-display', styles.heading)}>
          {t('pages.upload.edit.withdrawTitle')}
        </h2>
        <p className={styles.note}>{t('pages.upload.edit.withdrawSummary')}</p>
        <div className={styles.actions}>
          <Button variant="outline" onClick={() => setConfirm(true)}>
            {t('pages.upload.edit.withdraw')}
          </Button>
        </div>
        {withdrawError && <PaperNotice live>{withdrawError}</PaperNotice>}
      </section>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('pages.upload.edit.confirmTitle')}
        description={t('pages.upload.edit.confirmSummary', { alias: entry.alias })}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setConfirm(false)}
              keyHint={t('frame.keys.glyph.escape')}
            >
              {t('pages.upload.edit.keep')}
            </Button>
            <Button variant="cta" loading={withdrawing} onClick={() => void withdraw()}>
              {t('pages.upload.edit.confirm')}
            </Button>
          </>
        }
      />
    </div>
  )
}
