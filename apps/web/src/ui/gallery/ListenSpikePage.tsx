import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { DocumentTitle } from '../../app/DocumentTitle'
import { audio } from '../../audio/engine'
import { renderTestBeatWav } from '../../audio/testBeat'
import { uploadInChunks } from '../../features/upload/chunkedUpload'
import { formatNumber, t } from '../../i18n'
import { apiFetch } from '../../net/api'
import { Button } from '../Button'
import { Frame } from '../Frame'
import styles from './ListenSpikePage.module.css'

const SignedUploadSchema = z.object({
  id: z.string(),
  uploadUrl: z.string(),
  publicId: z.string(),
  fields: z.record(z.string(), z.string()),
})
const ResourceSchema = z.object({
  bytes: z.number(),
  format: z.string(),
  durationSeconds: z.number().nullable(),
  stream: z.object({ status: z.string(), bytes: z.number().nullable() }),
})
const StreamSchema = z.object({ url: z.string() })
const ChecksSchema = z.object({
  unsignedOriginalStatus: z.number(),
  stream: z.object({
    status: z.number(),
    contentType: z.string().nullable(),
    allowOrigin: z.string().nullable(),
  }),
  streamKbps: z.number().nullable(),
})

type Log = { key: string; text: string; ok?: boolean }

/** Espera entre consultas del derivado (ms) y cuánto se espera como mucho. */
const POLL_MS = 1000
const POLL_MAX_MS = 120_000

/**
 * `/dev/escucha` — spike de Cloudinary (tarea 1.7, guía §4.8). Solo en desarrollo y con `pnpm dev:all`
 * (la API con las credenciales de Cloudinary en `apps/server/.env`). Sube un WAV (el ritmo de prueba de 60
 * s, ~10 MB, o uno propio) **por trozos y firmado** como `authenticated`, espera al derivado `f_mp3,br_192k`
 * (`eager`) y mide cuánto tarda, lo reproduce con su URL firmada por el bus de música (con
 * `crossOrigin="anonymous"`: el analizador lo ve y la trama de la arena reacciona) y enseña las
 * comprobaciones del servidor: el original sin firma da 401, el derivado lleva CORS y ~192 kb/s.
 */
export function ListenSpikePage() {
  const [file, setFile] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [log, setLog] = useState<Log[]>([])
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [id, setId] = useState<string | null>(null)
  const player = useRef<HTMLAudioElement>(null)
  const push = (entry: Log) =>
    setLog((current) => [...current.filter((item) => item.key !== entry.key), entry])

  useEffect(() => {
    const element = player.current
    if (!streamUrl || !element) return
    audio.unlock()
    // Un ritmo de prueba, no una entrada: la trama puede leerlo.
    return audio.attachElement(element, { blind: false })
  }, [streamUrl])

  const generate = async () => {
    setBusy(true)
    const wav = await renderTestBeatWav(60)
    setFile(wav)
    push({
      key: 'file',
      text: t('dev.listen.generated', {
        size: formatNumber(wav.size / 1024 / 1024, { maximumFractionDigits: 1 }),
      }),
    })
    setBusy(false)
  }

  const run = async () => {
    if (!file) return
    setBusy(true)
    setStreamUrl(null)
    try {
      const signed = await apiFetch('/api/dev/storage/uploads', {
        method: 'POST',
        body: {},
        schema: SignedUploadSchema,
      })
      setId(signed.id)
      push({ key: 'sign', text: t('dev.listen.signed', { publicId: signed.publicId }), ok: true })
      const started = performance.now()
      await uploadInChunks({
        file,
        uploadUrl: signed.uploadUrl,
        fields: signed.fields,
        onProgress: (sent, total) => setProgress(sent / total),
      })
      const uploaded = performance.now()
      push({
        key: 'upload',
        text: t('dev.listen.uploaded', { seconds: ((uploaded - started) / 1000).toFixed(1) }),
        ok: true,
      })
      let resource = await apiFetch(`/api/dev/storage/resources/${signed.id}`, { schema: ResourceSchema })
      while (resource.stream.status !== 'processed' && performance.now() - uploaded < POLL_MAX_MS) {
        await new Promise((wait) => setTimeout(wait, POLL_MS))
        resource = await apiFetch(`/api/dev/storage/resources/${signed.id}`, { schema: ResourceSchema })
      }
      const eagerOk = resource.stream.status === 'processed'
      push({
        key: 'eager',
        text: eagerOk
          ? t('dev.listen.eager', { seconds: ((performance.now() - uploaded) / 1000).toFixed(1) })
          : t('dev.listen.eagerTimeout'),
        ok: eagerOk,
      })
      const { url } = await apiFetch(`/api/dev/storage/resources/${signed.id}/stream`, {
        schema: StreamSchema,
      })
      setStreamUrl(url)
      const checks = await apiFetch(`/api/dev/storage/resources/${signed.id}/checks`, {
        schema: ChecksSchema,
      })
      push({
        key: 'unsigned',
        text: t('dev.listen.unsigned', { status: checks.unsignedOriginalStatus }),
        ok: checks.unsignedOriginalStatus === 401 || checks.unsignedOriginalStatus === 404,
      })
      push({
        key: 'cors',
        text: t('dev.listen.cors', {
          status: checks.stream.status,
          type: checks.stream.contentType ?? '—',
          origin: checks.stream.allowOrigin ?? '—',
        }),
        ok: checks.stream.status === 200 && checks.stream.allowOrigin !== null,
      })
      push({
        key: 'kbps',
        text: t('dev.listen.kbps', { kbps: checks.streamKbps ?? '—' }),
        ok: checks.streamKbps !== null && Math.abs(checks.streamKbps - 192) <= 20,
      })
    } catch (error) {
      push({ key: 'error', text: String(error instanceof Error ? error.message : error), ok: false })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!id) return
    await apiFetch(`/api/dev/storage/resources/${id}`, {
      method: 'DELETE',
      body: {},
      schema: z.object({ removed: z.literal(true) }),
    })
    push({ key: 'remove', text: t('dev.listen.removed'), ok: true })
    setStreamUrl(null)
    setId(null)
  }

  return (
    <div className={styles.page}>
      <DocumentTitle page={t('dev.listen.title')} />
      <h1 className="sr-only">{t('dev.listen.title')}</h1>
      <Frame as="section" className={styles.panel} aria-labelledby="listen-steps">
        <h2 id="listen-steps" className="bb-label">
          {t('dev.listen.steps')}
        </h2>
        <p className={styles.intro}>{t('dev.listen.intro')}</p>
        <div className={styles.row}>
          <Button variant="outline" onClick={generate} disabled={busy}>
            {t('dev.listen.generate')}
          </Button>
          <label className={styles.file}>
            {t('dev.listen.pick')}
            <input
              type="file"
              accept="audio/wav,audio/x-wav,audio/aiff,audio/flac,audio/mpeg"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <Button onClick={run} disabled={busy || !file}>
            {t('dev.listen.run')}
          </Button>
          <Button variant="outline" onClick={remove} disabled={busy || !id}>
            {t('dev.listen.remove')}
          </Button>
        </div>
        {progress !== null && (
          <progress
            className={styles.progress}
            value={progress}
            max={1}
            aria-label={t('dev.listen.progress')}
          />
        )}
        <ol className={styles.log} aria-live="polite">
          {log.map((entry) => (
            <li key={entry.key} data-ok={entry.ok === undefined ? undefined : String(entry.ok)}>
              {entry.text}
            </li>
          ))}
        </ol>
        {streamUrl && (
          // biome-ignore lint/a11y/useMediaCaption: un ritmo de prueba sin voz
          <audio ref={player} className={styles.player} controls crossOrigin="anonymous" src={streamUrl} />
        )}
      </Frame>
    </div>
  )
}
