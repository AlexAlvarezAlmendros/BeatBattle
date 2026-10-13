import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import ffmpegStatic from 'ffmpeg-static'

/**
 * Medición de audio en servidor (guía §4.8.4, `RF-STO-04`; spike 1.8): ffmpeg lee el audio por la
 * entrada estándar según llega y, en una sola pasada (`asplit`), mide la sonoridad integrada y el pico
 * real (`ebur128=peak=true`) y saca la señal a 8 kHz mono para la forma de onda. ffmpeg no abre URLs: el
 * binario estático da un fallo de segmento al resolver DNS, así que la descarga la hace Node.
 *
 * Lo usan los samples (Fase 3) y las entradas (Fase 4). Nada de lo que mide sale del navegador.
 */

/** Tramos de la forma de onda (§4.6): 1000, con mínimo y máximo en `Int8` cada uno. */
export const WAVEFORM_BINS = 1000
/** Frecuencia de la señal de la onda: de sobra para 1000 tramos de una pista de minutos. */
const WAVE_RATE = 8000

export interface AudioMeasurement {
  /** Duración de la señal decodificada, en ms. */
  durationMs: number
  /** Sonoridad integrada (BS.1770), o `null` si es silencio. */
  integratedLufs: number | null
  /** Pico real, o `null` si es silencio. */
  truePeakDb: number | null
  /** `WAVEFORM_BINS × [mín, máx]` en `Int8` (−127…127). */
  peaks: Int8Array
}

/** Ruta del ffmpeg: `FFMPEG_PATH` si se da, si no el de `ffmpeg-static`. */
export function defaultFfmpegPath(): string {
  const path = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string | null)
  if (!path) throw new Error('No hay ffmpeg: instala ffmpeg-static o fija FFMPEG_PATH')
  return path
}

type AudioSource = ReadableStream<Uint8Array> | Readable | Uint8Array

function run(source: AudioSource, ffmpegPath: string): Promise<{ pcm: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      '-hide_banner',
      '-nostats',
      '-i',
      'pipe:0',
      '-filter_complex',
      `[0:a]asplit=2[l][w];[l]ebur128=peak=true[lo];[w]aresample=${WAVE_RATE},aformat=channel_layouts=mono:sample_fmts=s16[wo]`,
      '-map',
      '[lo]',
      '-f',
      'null',
      '-',
      '-map',
      '[wo]',
      '-f',
      's16le',
      'pipe:1',
    ])
    const input =
      source instanceof Uint8Array
        ? Readable.from([source])
        : source instanceof Readable
          ? source
          : Readable.fromWeb(source as import('node:stream/web').ReadableStream<Uint8Array>)
    // Si ffmpeg corta la entrada (fichero que no es audio), el `EPIPE` no debe tumbar el proceso.
    input.pipe(child.stdin).on('error', () => {})
    child.stdin.on('error', () => {})
    const pcm: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => pcm.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      // Solo hace falta el final (el resumen de `ebur128`); el resto se descarta para no crecer sin fin.
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg salió con ${code}: ${stderr.slice(-400)}`))
      else resolve({ pcm: Buffer.concat(pcm), stderr })
    })
  })
}

function parseLoudness(stderr: string) {
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'))
  const toNumber = (match: RegExpMatchArray | null) =>
    match ? (match[1] === '-inf' ? null : Number(match[1])) : null
  return {
    integratedLufs: toNumber(summary.match(/I:\s+(-?[\d.]+|-inf)\s+LUFS/)),
    truePeakDb: toNumber(summary.match(/True peak:\s+Peak:\s+(-?[\d.]+|-inf)\s+dBFS/)),
  }
}

/** Mínimo y máximo de cada tramo, en `Int8`. */
export function waveformPeaks(samples: Int16Array, bins = WAVEFORM_BINS): Int8Array {
  const out = new Int8Array(bins * 2)
  const n = samples.length
  for (let b = 0; b < bins && n > 0; b++) {
    const start = Math.min(n - 1, Math.floor((b * n) / bins))
    const end = Math.max(start + 1, Math.floor(((b + 1) * n) / bins))
    let min = 32767
    let max = -32768
    for (let i = start; i < end && i < n; i++) {
      const value = samples[i] as number
      if (value < min) min = value
      if (value > max) max = value
    }
    out[b * 2] = Math.round((min / 32768) * 127)
    out[b * 2 + 1] = Math.round((max / 32768) * 127)
  }
  return out
}

/** Mide un audio (WAV, AIFF, FLAC o MP3) con ffmpeg. Lanza si ffmpeg no lo puede decodificar. */
export async function measureAudio(
  source: AudioSource,
  ffmpegPath: string = defaultFfmpegPath(),
): Promise<AudioMeasurement> {
  const { pcm, stderr } = await run(source, ffmpegPath)
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  if (samples.length === 0) throw new Error('ffmpeg no sacó ninguna muestra: no es un audio')
  return {
    durationMs: Math.round((samples.length / WAVE_RATE) * 1000),
    ...parseLoudness(stderr),
    peaks: waveformPeaks(samples),
  }
}
