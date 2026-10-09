import {
  type AdminSample,
  CHOPS_COUNT,
  type Chop,
  MUSICAL_KEYS,
  type MusicalKey,
  type SampleUploadPart,
} from '@beatbattle/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ScreenPage } from '../../app/ScreenPage'
import { formatDuration, t } from '../../i18n'
import {
  adminSampleQuery,
  createSample,
  deleteSample,
  signSampleUpload,
  updateSample,
  uploadSigned,
} from '../../net/admin'
import { ApiClientError } from '../../net/api'
import { queryKeys } from '../../net/queryKeys'
import { Button } from '../../ui/Button'
import { TextAreaField, TextField } from '../../ui/Field'
import { Waveform } from '../../ui/Waveform'
import { Done, PaperNotice } from '../account/FormBits'
import { decodePeaks, musicalKeyName } from '../week/weekModel'
import { AdminGate } from './AdminPage'
import styles from './SampleEditorPage.module.css'

const ACCEPT: Record<SampleUploadPart, string> = {
  original: '.wav,.aif,.aiff,audio/wav,audio/aiff',
  cover: 'image/png,image/jpeg,image/webp',
  stems: '.zip,application/zip',
}

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; fraction: number }
  | { status: 'done' }
  | { status: 'error' }

/**
 * `/admin/samples/:id` (`nuevo` para uno nuevo) — el editor de samples del panel (§2.14; tarea 3.18,
 * `RF-ADM-01`): subir el original, la portada y los stems con la firma del servidor, directos al
 * almacenamiento; la ficha (título, créditos, licencia, BPM, tonalidad…); y los 8 *chops* sobre la onda
 * medida en el servidor.
 */
export function SampleEditorPage() {
  const { id = 'nuevo' } = useParams()
  const isNew = id === 'nuevo'
  return (
    <ScreenPage
      title={t(isNew ? 'admin.sample.titleNew' : 'admin.sample.titleEdit')}
      kicker={t('frame.plates.admin')}
      actions={null}
      wide
    >
      <AdminGate>{isNew ? <NewSample /> : <ExistingSample id={id} />}</AdminGate>
    </ScreenPage>
  )
}

function ExistingSample({ id }: { id: string }) {
  const sample = useQuery(adminSampleQuery(id))
  if (!sample.data)
    return <p className={styles.note}>{sample.isPending ? t('admin.loading') : t('admin.error')}</p>
  return <SampleForm key={sample.data.id} sample={sample.data} />
}

function NewSample() {
  return <SampleForm sample={null} />
}

function UploadSlot({
  label,
  part,
  state,
  onFile,
}: {
  label: string
  part: SampleUploadPart
  state: UploadState
  onFile: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  return (
    <div className={styles.slot}>
      <label htmlFor={id} className={styles.slotLabel}>
        {label}
      </label>
      <input
        ref={input}
        id={id}
        className="sr-only"
        type="file"
        accept={ACCEPT[part]}
        data-part={part}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          event.target.value = ''
        }}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => input.current?.click()}
        aria-describedby={`${id}-state`}
      >
        {state.status === 'done' ? t('admin.sample.replace') : t('admin.sample.choose')}
      </Button>
      <span id={`${id}-state`} className={styles.slotState} aria-live="polite">
        {state.status === 'uploading' &&
          t('admin.sample.uploading', { percent: Math.round(state.fraction * 100) })}
        {state.status === 'done' && t('admin.sample.uploaded')}
        {state.status === 'error' && t('admin.sample.uploadError')}
      </span>
    </div>
  )
}

function SampleForm({ sample }: { sample: AdminSample | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sampleId, setSampleId] = useState<string | null>(sample?.id ?? null)
  const [uploads, setUploads] = useState<Record<SampleUploadPart, UploadState>>({
    original: { status: sample ? 'done' : 'idle' },
    cover: { status: sample ? 'done' : 'idle' },
    stems: { status: sample?.hasStems ? 'done' : 'idle' },
  })
  const [fields, setFields] = useState({
    title: sample?.title ?? '',
    credits: sample?.credits ?? '',
    origin: sample?.origin ?? '',
    licenseText: sample?.licenseText ?? '',
    bpm: sample?.bpm ? String(sample.bpm) : '',
    musicalKey: (sample?.musicalKey ?? '') as MusicalKey | '',
    genreHint: sample?.genreHint ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const keyId = useId()
  const set = (key: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }))
  const refresh = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all })
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.samples(), id] })
  }

  const upload = async (part: SampleUploadPart, file: File) => {
    setMessage(null)
    setUploads((current) => ({ ...current, [part]: { status: 'uploading', fraction: 0 } }))
    try {
      const signed = await signSampleUpload(part, sampleId ?? undefined)
      setSampleId(signed.sampleId)
      await uploadSigned(signed.upload, file, (fraction) =>
        setUploads((current) => ({ ...current, [part]: { status: 'uploading', fraction } })),
      )
      setUploads((current) => ({ ...current, [part]: { status: 'done' } }))
      // En un sample que ya existe, el cambio se aplica al momento: nueva medición o stems.
      if (sample && part === 'original') {
        await updateSample(sample.id, { remeasure: true })
        refresh(sample.id)
      }
      if (sample && part === 'stems') {
        await updateSample(sample.id, { hasStems: true })
        refresh(sample.id)
      }
    } catch {
      setUploads((current) => ({ ...current, [part]: { status: 'error' } }))
    }
  }

  const payload = () => ({
    title: fields.title,
    credits: fields.credits,
    origin: fields.origin || null,
    licenseText: fields.licenseText,
    bpm: fields.bpm ? Number(fields.bpm.replace(',', '.')) : null,
    musicalKey: fields.musicalKey || null,
    genreHint: fields.genreHint || null,
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)
    if (!sample && (uploads.original.status !== 'done' || uploads.cover.status !== 'done' || !sampleId)) {
      setMessage({ kind: 'error', text: t('admin.sample.needFiles') })
      return
    }
    setBusy(true)
    try {
      if (sample) {
        await updateSample(sample.id, payload())
        refresh(sample.id)
        setMessage({ kind: 'ok', text: t('admin.sample.saved') })
      } else {
        const body = payload()
        const created = await createSample({
          ...body,
          sampleId: sampleId as string,
          bpm: body.bpm ?? 0,
          musicalKey: (body.musicalKey ?? 'Am') as MusicalKey,
          hasStems: uploads.stems.status === 'done',
        })
        refresh(created.id)
        navigate(`/admin/samples/${created.id}`, { replace: true })
      }
    } catch (cause) {
      setMessage({ kind: 'error', text: cause instanceof ApiClientError ? cause.message : t('admin.error') })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!sample) return
    try {
      await deleteSample(sample.id)
      refresh(sample.id)
      navigate('/admin')
    } catch (cause) {
      setMessage({
        kind: 'error',
        text:
          cause instanceof ApiClientError && cause.code === 'SAMPLE_IN_USE'
            ? t('admin.sample.deleteInUse')
            : t('admin.error'),
      })
    }
  }

  return (
    <div className={styles.editor} data-dense="">
      <section className={styles.section}>
        <h2 className={`bb-label ${styles.heading}`}>{t('admin.sample.files')}</h2>
        <UploadSlot
          label={t('admin.sample.original')}
          part="original"
          state={uploads.original}
          onFile={(file) => void upload('original', file)}
        />
        <UploadSlot
          label={t('admin.sample.cover')}
          part="cover"
          state={uploads.cover}
          onFile={(file) => void upload('cover', file)}
        />
        <UploadSlot
          label={t('admin.sample.stems')}
          part="stems"
          state={uploads.stems}
          onFile={(file) => void upload('stems', file)}
        />
        {sample?.hasStems && (
          <Button
            size="sm"
            variant="outline"
            className={styles.inline}
            onClick={() => void updateSample(sample.id, { hasStems: false }).then(() => refresh(sample.id))}
          >
            {t('admin.sample.removeStems')}
          </Button>
        )}
        {sample && (
          <p className={styles.note}>
            {t('admin.sample.measured', {
              duration: formatDuration(sample.durationMs / 1000),
              loudness:
                sample.loudnessLufs === null
                  ? '—'
                  : t('admin.samples.loudnessValue', { value: sample.loudnessLufs.toFixed(1) }),
            })}
          </p>
        )}
      </section>

      <form className={styles.section} onSubmit={submit} noValidate>
        <h2 className={`bb-label ${styles.heading}`}>{t('admin.sample.fields')}</h2>
        <div className={styles.grid}>
          <TextField
            label={t('admin.sample.titleField')}
            value={fields.title}
            maxLength={80}
            onChange={(e) => set('title')(e.target.value)}
          />
          <TextField
            label={t('admin.sample.credits')}
            value={fields.credits}
            maxLength={160}
            onChange={(e) => set('credits')(e.target.value)}
          />
          <TextField
            label={t('admin.sample.origin')}
            value={fields.origin}
            maxLength={160}
            onChange={(e) => set('origin')(e.target.value)}
          />
          <TextField
            label={t('admin.sample.genre')}
            value={fields.genreHint}
            maxLength={40}
            onChange={(e) => set('genreHint')(e.target.value)}
          />
          <TextField
            label={t('admin.sample.bpm')}
            value={fields.bpm}
            inputMode="decimal"
            onChange={(e) => set('bpm')(e.target.value)}
          />
          <label className={styles.select} htmlFor={keyId}>
            <span className={styles.selectLabel}>{t('admin.sample.key')}</span>
            <select id={keyId} value={fields.musicalKey} onChange={(e) => set('musicalKey')(e.target.value)}>
              <option value="">{t('admin.sample.keyNone')}</option>
              {MUSICAL_KEYS.map((key) => (
                <option key={key} value={key}>
                  {musicalKeyName(key)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <TextAreaField
          label={t('admin.sample.license')}
          value={fields.licenseText}
          maxLength={2000}
          rows={3}
          onChange={(e) => set('licenseText')(e.target.value)}
        />
        {message?.kind === 'error' && <PaperNotice live>{message.text}</PaperNotice>}
        {message?.kind === 'ok' && <Done>{message.text}</Done>}
        <div className={styles.actions}>
          <Button type="submit" variant="cta" loading={busy}>
            {sample ? t('admin.sample.save') : t('admin.sample.create')}
          </Button>
          <Button to="/admin" variant="outline">
            {t('admin.sample.back')}
          </Button>
          {sample && (
            <Button variant="outline" onClick={() => void remove()}>
              {t('admin.sample.delete')}
            </Button>
          )}
        </div>
      </form>

      {sample && <ChopsEditor sample={sample} onSaved={() => refresh(sample.id)} />}
    </div>
  )
}

/** Ocho trozos iguales, dejando un 5 % de margen al final de cada uno. */
function spread(durationMs: number): Chop[] {
  const step = Math.floor(durationMs / CHOPS_COUNT)
  return Array.from({ length: CHOPS_COUNT }, (_, i) => ({
    startMs: i * step,
    endMs: i * step + Math.max(1, Math.floor(step * 0.95)),
  }))
}

const toSeconds = (ms: number) => (ms / 1000).toFixed(2)
const fromSeconds = (text: string) => Math.round(Number(text.replace(',', '.')) * 1000)

/**
 * Editor de los 8 *chops* (`RF-ADM-01`, §3.7.6): la onda medida con las 8 regiones encima; clic en la onda
 * fija el inicio del chop elegido y Mayús+clic, su final. Con el teclado, los campos de cada chop (en
 * segundos). «Escuchar» reproduce el trozo con el MP3 de escucha.
 */
function ChopsEditor({ sample, onSaved }: { sample: AdminSample; onSaved: () => void }) {
  const [chops, setChops] = useState<Chop[]>(
    sample.chops.length === CHOPS_COUNT ? sample.chops : spread(sample.durationMs),
  )
  const [selected, setSelected] = useState(0)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const player = useRef<HTMLAudioElement | null>(null)
  const peaks = decodePeaks(sample.peaks)
  const seconds = sample.durationMs / 1000
  const valid = chops.every(
    (chop) => chop.startMs >= 0 && chop.endMs > chop.startMs && chop.endMs <= sample.durationMs,
  )

  const setChop = (index: number, patch: Partial<Chop>) =>
    setChops((current) => current.map((chop, i) => (i === index ? { ...chop, ...patch } : chop)))

  const play = (chop: Chop) => {
    player.current?.pause()
    const audio = new Audio(sample.streamUrl)
    player.current = audio
    audio.currentTime = chop.startMs / 1000
    void audio.play().catch(() => {})
    window.setTimeout(() => audio.pause(), chop.endMs - chop.startMs)
  }

  const save = async () => {
    setMessage(null)
    if (!valid) {
      setMessage({ kind: 'error', text: t('admin.chops.invalid') })
      return
    }
    setBusy(true)
    try {
      await updateSample(sample.id, { chops })
      onSaved()
      setMessage({ kind: 'ok', text: t('admin.chops.saved') })
    } catch (cause) {
      setMessage({ kind: 'error', text: cause instanceof ApiClientError ? cause.message : t('admin.error') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.section} aria-label={t('admin.chops.title')}>
      <h2 className={`bb-label ${styles.heading}`}>{t('admin.chops.title')}</h2>
      <p className={styles.note}>{t('admin.chops.summary')}</p>
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: atajo de ratón; con el teclado, los campos de cada chop */}
      <div
        className={styles.chopWave}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const ms = Math.round(((event.clientX - box.left) / box.width) * sample.durationMs)
          setChop(selected, event.shiftKey ? { endMs: ms } : { startMs: ms })
        }}
      >
        <Waveform peaks={peaks} height={72} decorative animateIn={false} />
        {chops.map((chop, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: los 8 chops son posiciones fijas
            key={index}
            className={styles.region}
            data-selected={index === selected || undefined}
            style={{
              left: `${(chop.startMs / sample.durationMs) * 100}%`,
              width: `${(Math.max(0, chop.endMs - chop.startMs) / sample.durationMs) * 100}%`,
            }}
          >
            {index + 1}
          </span>
        ))}
      </div>
      <ol className={styles.chopList}>
        {chops.map((chop, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: los 8 chops son posiciones fijas
          <li key={index} className={styles.chopRow} data-selected={index === selected || undefined}>
            <Button
              size="sm"
              variant={index === selected ? 'white' : 'outline'}
              onClick={() => setSelected(index)}
              aria-pressed={index === selected}
            >
              {t('admin.chops.chop', { index: index + 1 })}
            </Button>
            <TextField
              label={t('admin.chops.start')}
              inputMode="decimal"
              value={toSeconds(chop.startMs)}
              onFocus={() => setSelected(index)}
              onChange={(e) => setChop(index, { startMs: fromSeconds(e.target.value) })}
            />
            <TextField
              label={t('admin.chops.end')}
              inputMode="decimal"
              value={toSeconds(chop.endMs)}
              onFocus={() => setSelected(index)}
              onChange={(e) => setChop(index, { endMs: fromSeconds(e.target.value) })}
            />
            <Button
              size="sm"
              variant="outline"
              iconOnly
              icon="triangleRight"
              aria-label={t('admin.chops.play', { index: index + 1 })}
              onClick={() => play(chop)}
            />
          </li>
        ))}
      </ol>
      <p className={styles.note}>{formatDuration(seconds)}</p>
      {message?.kind === 'error' && <PaperNotice live>{message.text}</PaperNotice>}
      {message?.kind === 'ok' && <Done>{message.text}</Done>}
      <div className={styles.actions}>
        <Button variant="cta" loading={busy} onClick={() => void save()}>
          {t('admin.chops.save')}
        </Button>
        <Button variant="outline" onClick={() => setChops(spread(sample.durationMs))}>
          {t('admin.chops.spread')}
        </Button>
      </div>
    </section>
  )
}
