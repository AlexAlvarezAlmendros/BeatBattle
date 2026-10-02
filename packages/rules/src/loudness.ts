// Igualación de sonoridad de la reproducción (guía §1.3, §2.6, Anexo G): cada entrada suena a
// −14 LUFS integrados, medidos en servidor, para que un master más fuerte no gane por sonar más
// fuerte. La ganancia solo atenúa: nunca sube por encima de 0 dB (`RF-PLAY-03`).

import { PLAYBACK_GAIN_MAX_DB, TARGET_LOUDNESS_LUFS } from './balance'
import { assertFinite } from './internal/guards'

/**
 * Ganancia de reproducción en dB: `min(0, −14 − lufs)` (Anexo G).
 *
 * @param integratedLufs Sonoridad integrada medida de la entrada. `-Infinity` (silencio digital)
 *   es válido y da 0 dB; `NaN` y `+Infinity` son errores de medición y lanzan `RangeError`.
 * @param targetLufs Sonoridad objetivo (Anexo B: −14 LUFS).
 */
export function playbackGainDb(integratedLufs: number, targetLufs: number = TARGET_LOUDNESS_LUFS): number {
  if (Number.isNaN(integratedLufs) || integratedLufs === Number.POSITIVE_INFINITY) {
    throw new RangeError(`integratedLufs debe ser un número o -Infinity (recibido: ${integratedLufs})`)
  }
  assertFinite(targetLufs, 'targetLufs')
  return Math.min(PLAYBACK_GAIN_MAX_DB, targetLufs - integratedLufs)
}
