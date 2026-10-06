import { type EntryAudioProblem, entryFormatOf, validateEntryAudio } from '@beatbattle/rules'
import { t } from '../../i18n'
import { formatDuration, formatNumber } from '../../i18n/format'

/** Lo que hace falta de un fichero (`File` lo cumple): su nombre y sus bytes. */
export interface EntryFileLike {
  name: string
  size: number
}

/**
 * Validación del audio en el navegador antes de subir nada (§2.5, `RF-ENT-03`): formato por la
 * extensión, tamaño y la duración ya decodificada. Es la misma regla que aplica el servidor sobre lo que
 * mide Cloudinary (`validateEntryAudio` de `@beatbattle/rules`); aquí solo evita subir lo que se va a
 * rechazar.
 */
export function checkEntryFile(file: EntryFileLike, durationMs: number): EntryAudioProblem | null {
  return validateEntryAudio({ format: entryFormatOf(file.name), sizeBytes: file.size, durationMs })
}

const MIB = 1024 * 1024

/**
 * El motivo, en palabras (§2.18, «Formato no válido» y «Duración fuera de rango»). La duración se
 * redondea hacia el lado del límite que se pasa: 4:00,4 dice «4:01», no «4:00», y 29,6 s dice «0:29».
 */
export function entryProblemMessage(problem: EntryAudioProblem): string {
  switch (problem.code) {
    case 'UNSUPPORTED_FORMAT':
      return t('pages.upload.problems.unsupportedFormat')
    case 'FILE_TOO_LARGE':
      return t('pages.upload.problems.fileTooLarge', {
        size: formatNumber(Math.ceil((problem.sizeBytes / MIB) * 10) / 10, { maximumFractionDigits: 1 }),
      })
    case 'DURATION_OUT_OF_RANGE': {
      const seconds = problem.durationMs / 1000
      return problem.limit === 'max'
        ? t('pages.upload.problems.durationTooLong', { duration: formatDuration(Math.ceil(seconds)) })
        : t('pages.upload.problems.durationTooShort', { duration: formatDuration(Math.floor(seconds)) })
    }
  }
}
