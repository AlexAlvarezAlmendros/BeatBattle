// Validación del audio de una entrada (guía §2.5, `RF-ENT-03`): formato, tamaño y duración. La misma
// regla en el navegador (antes de subir nada) y en el servidor (sobre lo que mide Cloudinary, que es lo
// que vale: `RF-ENT-05`). Pura: recibe los datos ya medidos.

import { type ENTRY_FORMATS, ENTRY_MAX_BYTES, ENTRY_MAX_DURATION_MS, ENTRY_MIN_DURATION_MS } from './balance'
import { assertFiniteAtLeast } from './internal/guards'

export type EntryFormat = (typeof ENTRY_FORMATS)[number]

/** Lo que se sabe del audio: el formato (o `null` si no es ninguno de los admitidos), los bytes y la duración. */
export interface EntryAudio {
  format: EntryFormat | null
  sizeBytes: number
  durationMs: number
}

/**
 * Motivo de rechazo, con su código de error estable (§4.10) y los datos para el mensaje: la duración
 * fuera de rango dice la que tiene y el límite que se pasa («Tu beat dura 4:12. El máximo son 4 minutos.»).
 */
export type EntryAudioProblem =
  | { code: 'UNSUPPORTED_FORMAT' }
  | { code: 'FILE_TOO_LARGE'; sizeBytes: number; maxBytes: number }
  | { code: 'DURATION_OUT_OF_RANGE'; durationMs: number; limit: 'min' | 'max'; limitMs: number }

const EXTENSIONS: Record<string, EntryFormat> = {
  wav: 'wav',
  wave: 'wav',
  aif: 'aiff',
  aiff: 'aiff',
  flac: 'flac',
  mp3: 'mp3',
}

/** Formato de una entrada por la extensión del fichero (sin distinguir mayúsculas); `null` si no se admite. */
export function entryFormatOf(fileName: string): EntryFormat | null {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0) return null
  return EXTENSIONS[fileName.slice(dot + 1).toLowerCase()] ?? null
}

/**
 * Primer motivo de rechazo del audio de una entrada, en el orden en que se comprueba en el navegador
 * (formato, tamaño y, ya decodificado, duración), o `null` si vale. Los límites están incluidos: 30 s y
 * 4 min justos valen.
 */
export function validateEntryAudio({ format, sizeBytes, durationMs }: EntryAudio): EntryAudioProblem | null {
  assertFiniteAtLeast(sizeBytes, 0, 'sizeBytes')
  assertFiniteAtLeast(durationMs, 0, 'durationMs')
  if (format === null) return { code: 'UNSUPPORTED_FORMAT' }
  if (sizeBytes > ENTRY_MAX_BYTES) return { code: 'FILE_TOO_LARGE', sizeBytes, maxBytes: ENTRY_MAX_BYTES }
  if (durationMs < ENTRY_MIN_DURATION_MS) {
    return { code: 'DURATION_OUT_OF_RANGE', durationMs, limit: 'min', limitMs: ENTRY_MIN_DURATION_MS }
  }
  if (durationMs > ENTRY_MAX_DURATION_MS) {
    return { code: 'DURATION_OUT_OF_RANGE', durationMs, limit: 'max', limitMs: ENTRY_MAX_DURATION_MS }
  }
  return null
}
