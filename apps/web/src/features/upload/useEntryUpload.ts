import type { EntryAudioProblem } from '@beatbattle/rules'
import type { OwnEntry } from '@beatbattle/shared'
import { useCallback, useRef, useState } from 'react'
import { audio } from '../../audio/engine'
import { t } from '../../i18n'
import { ApiClientError } from '../../net/api'
import { createEntry, signEntryUpload } from '../../net/entries'
import { uploadInChunks } from './chunkedUpload'
import type { EntrySheetResult } from './EntrySheet'
import { entryProblemMessage } from './entryFile'

/** Tipo MIME declarado al firmar, por la extensión si el navegador no da tipo (algunos AIFF). */
const MIME_BY_EXTENSION: Record<string, string> = {
  wav: 'audio/wav',
  wave: 'audio/wav',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
}

export function mimeOf(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[extension] ?? file.type ?? ''
}

/** Ventana con la que se mide la velocidad (ms). */
const SPEED_WINDOW_MS = 3000
/** El progreso suena cada 5 % (`upload.progress`, que además se limita a 3 por segundo). */
const PROGRESS_STEP = 0.05

export type EntryUploadState =
  | { stage: 'idle'; cancelled?: boolean }
  | {
      stage: 'uploading'
      sent: number
      total: number
      /** Bytes por segundo, o `null` mientras no hay medida. */
      speed: number | null
      /** Segundos que faltan, o `null`. */
      remaining: number | null
    }
  | { stage: 'registering'; total: number }
  | { stage: 'done'; entry: OwnEntry }
  | { stage: 'error'; message: string }

/** La frase de un fallo de la subida o del registro (§2.19, en tono de juego pero claro). */
export function uploadErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return t('pages.upload.errors.network')
  switch (error.code) {
    case 'UNSUPPORTED_FORMAT':
    case 'FILE_TOO_LARGE':
    case 'DURATION_OUT_OF_RANGE':
      return error.details && typeof error.details === 'object'
        ? entryProblemMessage(error.details as EntryAudioProblem)
        : t('pages.upload.errors.asset')
    case 'ENTRY_EXISTS':
      return t('pages.upload.errors.exists')
    case 'SUBMISSIONS_CLOSED':
      return t('pages.upload.closed.summary')
    case 'RULES_NOT_ACCEPTED':
      return t('pages.upload.errors.rules')
    case 'UPLOAD_INTENT_INVALID':
      return t('pages.upload.errors.intent')
    case 'ENTRY_ASSET_INVALID':
      return t('pages.upload.errors.asset')
    case 'RATE_LIMITED':
      return t('pages.upload.errors.rateLimited')
    case 'EMAIL_NOT_VERIFIED':
      return t('pages.upload.errors.unverified')
    case 'NETWORK_ERROR':
      return t('pages.upload.errors.network')
    default:
      return t('pages.upload.errors.unknown')
  }
}

/**
 * La subida y el registro de la entrada (§2.5, pasos 5 y 6; §4.7.4; tarea 4.16): firma, portada propia si
 * la hay, el audio por trozos directo al almacenamiento con el tamaño que da la firma (3 intentos por trozo,
 * `RF-ENT-12`), progreso real con velocidad y tiempo restante, «Cancelar» que aborta el XHR (`RF-ENT-07`)
 * y el registro en el servidor, que verifica y mide. El progreso suena cada 5 % y, al terminar,
 * `upload.done`.
 */
export function useEntryUpload() {
  const [state, setState] = useState<EntryUploadState>({ stage: 'idle' })
  const controller = useRef<AbortController | null>(null)

  const start = useCallback(
    async (input: { weekSlug: string; file: File; durationMs: number; sheet: EntrySheetResult }) => {
      const abort = new AbortController()
      controller.current = abort
      const { signal } = abort
      const { weekSlug, file, durationMs, sheet } = input
      setState({ stage: 'uploading', sent: 0, total: file.size, speed: null, remaining: null })
      try {
        let coverIntentId: string | undefined
        if (sheet.cover) {
          const coverSigned = await signEntryUpload(
            { kind: 'entryCover', weekSlug, mime: sheet.cover.type as 'image/png', bytes: sheet.cover.size },
            signal,
          )
          await uploadInChunks({
            file: sheet.cover,
            uploadUrl: coverSigned.uploadUrl,
            fields: coverSigned.fields,
            chunkBytes: coverSigned.chunkBytes,
            signal,
          })
          coverIntentId = coverSigned.intentId
        }
        const signed = await signEntryUpload(
          {
            kind: 'entry',
            weekSlug,
            mime: mimeOf(file) as 'audio/wav',
            bytes: file.size,
            durationMs,
          },
          signal,
        )
        const samples: { at: number; sent: number }[] = []
        let nextStep = PROGRESS_STEP
        await uploadInChunks({
          file,
          uploadUrl: signed.uploadUrl,
          fields: signed.fields,
          chunkBytes: signed.chunkBytes,
          signal,
          onProgress: (sent, total) => {
            const now = performance.now()
            samples.push({ at: now, sent })
            while (samples.length > 2 && now - (samples[0]?.at ?? now) > SPEED_WINDOW_MS) samples.shift()
            const first = samples[0]
            const elapsed = first ? (now - first.at) / 1000 : 0
            const speed = first && elapsed > 0.25 ? (sent - first.sent) / elapsed : null
            const remaining = speed && speed > 0 ? (total - sent) / speed : null
            setState({ stage: 'uploading', sent, total, speed, remaining })
            const fraction = total > 0 ? sent / total : 0
            if (fraction >= nextStep) {
              audio.play('upload.progress', { progress: fraction })
              nextStep = Math.floor(fraction / PROGRESS_STEP) * PROGRESS_STEP + PROGRESS_STEP
            }
          },
        })
        setState({ stage: 'registering', total: file.size })
        const entry = await createEntry(
          weekSlug,
          { intentId: signed.intentId, ...(coverIntentId ? { coverIntentId } : {}), ...sheet.fields },
          signal,
        )
        audio.play('upload.done')
        setState({ stage: 'done', entry })
        return entry
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
          setState({ stage: 'idle', cancelled: true })
          return null
        }
        setState({ stage: 'error', message: uploadErrorMessage(error) })
        return null
      } finally {
        if (controller.current === abort) controller.current = null
      }
    },
    [],
  )

  const cancel = useCallback(() => controller.current?.abort(), [])
  const reset = useCallback(() => setState({ stage: 'idle' }), [])

  return { state, start, cancel, reset }
}
