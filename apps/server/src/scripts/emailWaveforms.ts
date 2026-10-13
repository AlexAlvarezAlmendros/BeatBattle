/**
 * Las ondas de ejemplo de la galería de emails (tarea 4.20): el PNG de `GET /api/email/waveform` para los
 * ejemplos del recibo (con clip, como su pico real de +0,4 dBTP) y del audio sustituido (sin clip, −1,2
 * dBTP), con el mismo codificador que el servidor. Se guardan con el nombre de su versión (`v` de la URL
 * del ejemplo), que es lo que sirve `tools/shot/emails.mjs` al capturar.
 *
 *   pnpm --filter @beatbattle/server exec tsx src/scripts/emailWaveforms.ts <carpeta>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { waveformPng } from '../media/waveformPng'

/** 1000 tramos `[mín, máx]` de un beat: golpes cada 1/32 y, si `clip`, cuatro que tocan el máximo. */
function peaks(clip: boolean): Int8Array {
  const out = new Int8Array(2000)
  for (let bin = 0; bin < 1000; bin++) {
    const phase = (bin % 31) / 31
    const level = Math.round(40 + 70 * (1 - phase) * (0.75 + 0.25 * Math.sin(bin / 37)))
    const peak = clip && bin % 250 === 0 ? 127 : Math.min(118, level)
    out[bin * 2] = -peak
    out[bin * 2 + 1] = peak
  }
  return out
}

const [dir = 'ondas'] = process.argv.slice(2)
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'a1b2c3d4e5f6.png'), waveformPng(peaks(true)))
writeFileSync(join(dir, 'f6e5d4c3b2a1.png'), waveformPng(peaks(false)))
console.log('ondas en', dir)
