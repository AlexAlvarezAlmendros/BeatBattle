// Medición de destellos con píxeles reales (guía §3.5, `RNF-A11Y-04`, WCAG 2.3.1; tareas 1.6 y 7.34). Abre una página
// (por defecto, el banco del Escenario sin el vinilo con el ritmo de prueba a 160 BPM) y captura una zona tan deprisa
// como puede durante `segundos`: de cada captura, la luminancia relativa media (sRGB → lineal → Y de WCAG). Cuenta los
// destellos (pares de cambios opuestos de ≥ 0,1 con el más oscuro por debajo de 0,80, en la peor ventana de 1 s) y saca
// la oscilación de la luminancia.
//
// Uso: node tools/shot/flashes.mjs [url=http://localhost:5173/dev/escenario?vinilo=no] [segundos=6]
//   --dpr=2                 densidad de píxeles
//   --out=medicion.json     guarda las muestras
//   --sin-ritmo             sin encender el ritmo (la referencia: la trama quieta)
//   --clip=x,y,ancho,alto   la zona que se mide (por defecto, la cuña del banco)
//   --eval="expr"           lo que destella, lanzado al empezar a medir (p. ej. `__bbRewards.legendary()` en
//                           `/dev/recompensas`); con él no se enciende el ritmo
//   --repetir=ms            vuelve a lanzar `--eval` cada tanto mientras mide (el peor caso: avisos seguidos)
//   --sin-escenario         no espera a que el Escenario pinte (páginas sin cuña o con la calidad apagada)
// Salida: una línea JSON con { samples, rateHz, min, max, swing, flashesPerSecond, renderer }.
import { writeFileSync } from 'node:fs'
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
const [url = 'http://localhost:5173/dev/escenario?vinilo=no', secsArg] = args.filter(
  (a) => !a.startsWith('--'),
)
const secs = Number(secsArg ?? 6)

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: Number(opt.dpr ?? 1),
})
await context.addInitScript(() => localStorage.setItem('bb:quality', 'alta'))
const page = await context.newPage()
await page.addInitScript(() => localStorage.setItem('bb:title', 'off'))
await page.goto(url)
if (!opt['sin-escenario'])
  await page.waitForFunction(() => document.querySelector('[data-stage-live]') !== null, null, {
    timeout: 30_000,
  })
// `--sin-ritmo`: la misma medición sin música, para comparar (la trama, quieta). Con `--eval`, lo que se mide es otra cosa.
if (!opt['sin-ritmo'] && !opt.eval) await page.getByRole('button', { name: /Ritmo de prueba/ }).click()
// Que el paso bajo llegue a su régimen (y la página, a su reposo).
await page.waitForTimeout(1500)

// Por defecto, la cuña del banco: la mitad derecha de la ventana, sin el HUD ni la barra.
const [cx, cy, cw, ch] = String(opt.clip ?? '760,140,640,520')
  .split(',')
  .map(Number)
const clip = { x: cx, y: cy, width: cw, height: ch }
const trigger = () => (opt.eval ? page.evaluate(String(opt.eval)) : Promise.resolve())
const shots = []
const start = Date.now()
await trigger()
let fired = Date.now()
while (Date.now() - start < secs * 1000) {
  const t = (Date.now() - start) / 1000
  shots.push({ t, png: (await page.screenshot({ clip })).toString('base64') })
  if (opt.repetir && Date.now() - fired >= Number(opt.repetir)) {
    fired = Date.now()
    await trigger()
  }
}

const luminances = await page.evaluate(
  async (pngs) => {
    const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const out = []
    for (const png of pngs) {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob()
      const bitmap = await createImageBitmap(blob)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(bitmap, 0, 0)
      const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
      let sum = 0
      for (let i = 0; i < data.length; i += 4) {
        sum +=
          0.2126 * linear(data[i] / 255) +
          0.7152 * linear(data[i + 1] / 255) +
          0.0722 * linear(data[i + 2] / 255)
      }
      out.push(sum / (data.length / 4))
    }
    return out
  },
  shots.map((shot) => shot.png),
)
const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl')
  const info = gl?.getExtension('WEBGL_debug_renderer_info')
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null
})
await browser.close()

const samples = shots.map((shot, i) => ({ t: shot.t, luminance: luminances[i] }))

// El mismo criterio que `maxFlashesPerSecond` de `@beatbattle/audio` (WCAG 2.3.1).
function maxFlashesPerSecond(series) {
  const first = series[0]
  if (!first) return 0
  const transitions = []
  let low = first.luminance
  let high = first.luminance
  let direction = 0
  const turn = (t, to, from) =>
    Math.abs(to - from) >= 0.1 && Math.min(to, from) < 0.8 ? (transitions.push(t), true) : false
  for (const { t, luminance } of series.slice(1)) {
    if (direction === 0) {
      if (luminance > low && turn(t, luminance, low)) {
        direction = 1
        high = luminance
      } else if (luminance < high && turn(t, luminance, high)) {
        direction = -1
        low = luminance
      } else {
        low = Math.min(low, luminance)
        high = Math.max(high, luminance)
      }
    } else if (direction > 0) {
      if (luminance >= high) high = luminance
      else if (turn(t, luminance, high)) {
        direction = -1
        low = luminance
      }
    } else if (luminance <= low) low = luminance
    else if (turn(t, luminance, low)) {
      direction = 1
      high = luminance
    }
  }
  let most = 0
  for (const [index, start] of transitions.entries()) {
    most = Math.max(most, transitions.slice(index).filter((t) => t - start < 1).length)
  }
  return Math.floor(most / 2)
}

const values = samples.map((sample) => sample.luminance)
const result = {
  samples: samples.length,
  rateHz: Number((samples.length / secs).toFixed(1)),
  min: Number(Math.min(...values).toFixed(5)),
  max: Number(Math.max(...values).toFixed(5)),
  swing: Number((Math.max(...values) - Math.min(...values)).toFixed(5)),
  flashesPerSecond: maxFlashesPerSecond(samples),
  renderer,
}
if (opt.out)
  writeFileSync(
    opt.out,
    `${JSON.stringify({ ...result, url, clip, eval: opt.eval ?? null, samples }, null, 2)}\n`,
  )
console.log(JSON.stringify(result))
