// Renderiza efectos del catálogo *offline* en Chrome (el mismo código que suena, `apps/web/src/audio/offline.ts`
// servido por Vite en desarrollo), mide su pico y duración y los guarda en WAV para escucharlos.
// Uso: node tools/shot/sfx-wav.mjs <origen> <carpeta> [id…]   (ids por defecto: los de la subida, 4.17)
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const [origin = 'http://localhost:5173', out = '.', ...rest] = process.argv.slice(2)
const ids = rest.length
  ? rest
  : ['upload.hover', 'upload.drop', 'upload.progress', 'upload.done', 'ann.newbeat']
const SAMPLE_RATE = 48_000
mkdirSync(out, { recursive: true })

/** WAV PCM de 16 bits, mono. */
function wav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((value, i) => {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), i * 2)
  })
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
await page.goto(origin)
const results = await page.evaluate(
  async ({ ids }) => {
    const offline = await import(/* @vite-ignore */ '/src/audio/offline.ts')
    const out = {}
    for (const id of ids) {
      const metrics = await offline.renderSfx(id)
      out[id] = { metrics, samples: await offline.renderSfxSamples(id) }
    }
    // El progreso de la subida, del 5 % al 100 %, una nota cada 5 % separadas 1/3 s (el tope del motor).
    const steps = []
    for (let step = 1; step <= 20; step++)
      steps.push(await offline.renderSfxSamples('upload.progress', undefined, step / 20))
    out['upload.progress.escala'] = { metrics: null, steps }
    return out
  },
  { ids },
)
for (const [id, result] of Object.entries(results)) {
  if (result.steps) {
    const gap = Math.round(SAMPLE_RATE / 3)
    const all = new Float32Array(gap * result.steps.length + SAMPLE_RATE)
    result.steps.forEach((samples, index) => {
      samples.forEach((value, i) => {
        all[index * gap + i] += value
      })
    })
    writeFileSync(join(out, `${id}.wav`), wav(all))
    continue
  }
  writeFileSync(join(out, `${id}.wav`), wav(result.samples))
  const m = result.metrics
  console.log(
    `${id}\tpico ${m.peakDb.toFixed(1)} dBFS (Anexo D ${m.levelDb})\tsuena ${m.activeSeconds.toFixed(3)} s (nominal ${m.duration})`,
  )
}
await browser.close()
