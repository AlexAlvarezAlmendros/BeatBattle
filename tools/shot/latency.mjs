// Latencia de un efecto desde el clic (guía §3.7, `RD-SND-05`: < 30 ms en escritorio; tarea 1.11). En la
// página, un clic real (Playwright) dispara `ui.press` en el motor; se mide:
//   evento → play: desde la marca de tiempo del evento (`event.timeStamp`) hasta que el motor programa el
//                  efecto (`performance.now()` en el `play`)
//   + `AudioContext.baseLatency` (lo que tarda el contexto en entregar un bloque)
//   + `AudioContext.outputLatency` (lo que tarda el sistema en sacarlo por el altavoz)
// Necesita el servidor de desarrollo (`window.__bbAudio`).
//
// Uso: node tools/shot/latency.mjs [url=http://localhost:5173/dev/escenario] [clics=20] [--headed] [--cpu=4]
//      [--hint=interactive|balanced|<segundos>]
// Salida: una línea JSON con la mediana y el p95 de cada parte y del total, y el dispositivo de salida.
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...v] = a.slice(2).split('=')
      return [k, v.length ? v.join('=') : true]
    }),
)
const [url = 'http://localhost:5173/dev/escenario', clicksArg] = args.filter((a) => !a.startsWith('--'))
const clicks = Number(clicksArg ?? 20)

const browser = await chromium.launch({ channel: 'chrome', headless: !opt.headed })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
if (opt.cpu) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(opt.cpu) })
}
// `--hint=interactive|balanced|playback|<segundos>` fuerza el `latencyHint` del contexto, para comparar
// configuraciones con la misma salida del sistema.
if (opt.hint) {
  const hint = Number.isNaN(Number(opt.hint)) ? opt.hint : Number(opt.hint)
  await page.addInitScript((latencyHint) => {
    const Native = window.AudioContext
    window.AudioContext = class extends Native {
      constructor(options = {}) {
        super({ ...options, latencyHint })
      }
    }
  }, hint)
}
await page.addInitScript(() => {
  window.__latency = []
  document.addEventListener(
    'pointerdown',
    (event) => {
      const engine = window.__bbAudio
      if (!engine) return
      engine.unlock()
      const ctx = engine.context
      const original = engine.play.bind(engine)
      let at = null
      engine.play = (...a) => {
        at = performance.now()
        return original(...a)
      }
      engine.play('ui.press')
      engine.play = original
      if (at !== null && ctx)
        window.__latency.push({
          handler: at - event.timeStamp,
          base: (ctx.baseLatency ?? 0) * 1000,
          output: (ctx.outputLatency ?? 0) * 1000,
          state: ctx.state,
        })
    },
    { capture: true },
  )
})
await page.goto(url)
await page.waitForFunction(() => !!window.__bbAudio, null, { timeout: 30_000 })
// El primer clic crea el contexto (y lo pone en marcha); se mide a partir del segundo.
await page.mouse.click(20, 400)
await page.waitForTimeout(500)
for (let i = 0; i < clicks; i++) {
  await page.mouse.click(20 + i, 400)
  await page.waitForTimeout(150)
}
const samples = (await page.evaluate(() => window.__latency)).slice(1)
const sink = await page.evaluate(() => window.__bbAudio?.context?.sinkId ?? 'default')
await browser.close()

const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1))]
  return { median: Number(at(0.5).toFixed(2)), p95: Number(at(0.95).toFixed(2)) }
}
console.log(
  JSON.stringify({
    clicks: samples.length,
    running: samples.every((s) => s.state === 'running'),
    handlerMs: stats(samples.map((s) => s.handler)),
    baseMs: stats(samples.map((s) => s.base)),
    outputMs: stats(samples.map((s) => s.output)),
    // La parte de la app (`RD-SND-05`: < 10 ms): del evento a que el bloque sale del contexto.
    appMs: stats(samples.map((s) => s.handler + s.base)),
    totalMs: stats(samples.map((s) => s.handler + s.base + s.output)),
    sink,
  }),
)
