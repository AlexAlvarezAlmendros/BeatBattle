// Spike 1.8 (guía §4.8.4, `RF-STO-04`): una función de Vercel con `ffmpeg-static` que lee el original de
// Cloudinary por URL firmada y, en una sola pasada, mide la sonoridad integrada y el pico real (`ebur128`)
// y la forma de onda de 1000 tramos. Devuelve también los tiempos y si el arranque fue en frío.
//
// La descarga la hace Node y ffmpeg lee de su entrada estándar: el ffmpeg estático (`ffmpeg-static`) da un
// fallo de segmento al resolver DNS en algunos sistemas (lo daba en local al abrir la URL), y así ffmpeg no
// toca la red.
//
// GET /api/measure?token=<SPIKE_TOKEN>&publicId=<public_id>&format=wav
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { v2 as cloudinary } from 'cloudinary'
import ffmpegPath from 'ffmpeg-static'

const BINS = 1000
/** Frecuencia de la señal de la onda: de sobra para 1000 tramos de una pista de minutos. */
const WAVE_RATE = 8000
const bootedAt = Date.now()
let warm = false

function run(body) {
  return new Promise((resolve, reject) => {
    const args = [
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
    ]
    const child = spawn(ffmpegPath, args)
    // La descarga entra por la entrada estándar, a trozos, según llega.
    Readable.fromWeb(body)
      .pipe(child.stdin)
      .on('error', () => {})
    const pcm = []
    let stderr = ''
    child.stdout.on('data', (chunk) => pcm.push(chunk))
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0)
        reject(new Error(`ffmpeg salió con ${code} (${child.signalCode}): ${stderr.slice(-600)}`))
      else resolve({ pcm: Buffer.concat(pcm), stderr })
    })
  })
}

function parseLoudness(stderr) {
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'))
  const integrated = summary.match(/I:\s+(-?[\d.]+|-inf)\s+LUFS/)
  const peak = summary.match(/True peak:\s+Peak:\s+(-?[\d.]+|-inf)\s+dBFS/)
  const toNumber = (m) => (m ? (m[1] === '-inf' ? null : Number(m[1])) : null)
  return { integratedLufs: toNumber(integrated), truePeakDbfs: toNumber(peak) }
}

function waveform(pcm) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  const out = new Int8Array(BINS * 2)
  const n = samples.length
  for (let b = 0; b < BINS && n > 0; b++) {
    const start = Math.min(n - 1, Math.floor((b * n) / BINS))
    const end = Math.max(start + 1, Math.floor(((b + 1) * n) / BINS))
    let min = 32767
    let max = -32768
    for (let i = start; i < end && i < n; i++) {
      if (samples[i] < min) min = samples[i]
      if (samples[i] > max) max = samples[i]
    }
    out[b * 2] = Math.round((min / 32768) * 127)
    out[b * 2 + 1] = Math.round((max / 32768) * 127)
  }
  return { bins: BINS, seconds: n / WAVE_RATE, peakBin: Math.max(...out) }
}

export default async function handler(req, res) {
  const startedAt = Date.now()
  const coldStart = !warm
  warm = true
  const query = new URL(req.url, 'http://localhost').searchParams
  if (!process.env.SPIKE_TOKEN || query.get('token') !== process.env.SPIKE_TOKEN) {
    res.statusCode = 401
    res.end('{"error":"token"}')
    return
  }
  const publicId = query.get('publicId')
  if (!publicId || !/^beatbattle-dev\/spike\/[\w-]+$/.test(publicId)) {
    res.statusCode = 422
    res.end('{"error":"publicId"}')
    return
  }
  try {
    const url = cloudinary.url(publicId, {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      resource_type: 'video',
      type: 'authenticated',
      sign_url: true,
      secure: true,
      format: query.get('format') ?? 'wav',
      urlAnalytics: false,
    })
    const ffmpegStarted = Date.now()
    const download = await fetch(url)
    if (!download.ok || !download.body) throw new Error(`Cloudinary respondió ${download.status}`)
    const bytes = Number(download.headers.get('content-length')) || null
    const { pcm, stderr } = await run(download.body)
    const ffmpegMs = Date.now() - ffmpegStarted
    const loudness = parseLoudness(stderr)
    const wave = waveform(pcm)
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        coldStart,
        msSinceBoot: startedAt - bootedAt,
        ffmpegMs,
        bytes,
        totalMs: Date.now() - startedAt,
        ...loudness,
        waveform: wave,
        region: process.env.VERCEL_REGION ?? null,
        memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      }),
    )
  } catch (error) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(error.message ?? error).slice(0, 800) }))
  }
}
