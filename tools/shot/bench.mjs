#!/usr/bin/env node
// Mide FPS, percentil 99, peor fotograma y llamadas de dibujo WebGL durante `secs` segundos
// (guía §4.17, `RNF-PERF-03`). Portado de Orchard (`tools/shot/bench.mjs`): en vez de leer las
// estadísticas de un motor propio, cuenta las llamadas de dibujo envolviendo los `draw*` de WebGL y
// WebGL2 antes de que cargue la página, así funciona con cualquier escena (R3F/three incluido).
//
// Uso: node tools/shot/bench.mjs <url> [segundos=8] [opciones]
//   --w=1920 --h=1080       tamaño de la ventana
//   --mobile                390×844 táctil (el móvil de la guía)
//   --cpu=4                 ralentiza la CPU ×N (emulación de un Android de gama media)
//   --dpr=2.625             densidad de píxeles (por defecto 1; un Android de gama media, ~2,6)
//   --quality=alta          calidad del Escenario a mano (`bb:quality`); sin ella decide la sonda (1.2)
//   --software              WebGL por software (SwiftShader): el peor caso de GPU
//   --warmup=2500           espera antes de medir, en ms
//   --reduced-motion        emula «reducir movimiento»
//   --eval="expr"           evalúa una expresión (puede ser asíncrona) antes de medir: p. ej. pulsar
//                           play o abrir una ceremonia para medir el peor caso
//   --shot=salida.png       captura al terminar
//   --headed                con ventana visible
// Salida: una línea JSON con { frames, fps, p99ms, worstMs, longFrames, drawCallsMax, drawCallsAvg,
// stageFps, quality, renderer }. `fps` es el ritmo de `requestAnimationFrame` (lo que da la página);
// `stageFps`, los fotogramas que pinta de verdad el Escenario (`window.__bbStage.frames`, solo con el
// servidor de desarrollo), que va a su ritmo: 60 como mucho con algo animándose, 30 la trama sola, nada quieto (`renderer` es la GPU que ve WebGL: así se distingue la GPU real de SwiftShader).
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
const [url, secsArg] = args.filter((a) => !a.startsWith('--'))
if (!url) {
  console.error('Uso: node tools/shot/bench.mjs <url> [segundos] [--mobile --cpu=4 --eval=… --shot=…]')
  process.exit(1)
}
const secs = Number(secsArg ?? 8)
const mobile = Boolean(opt.mobile)

const browser = await chromium.launch(
  opt.software
    ? {
        channel: 'chromium',
        headless: !opt.headed,
        args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
      }
    : {
        channel: 'chrome',
        headless: !opt.headed,
        args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'],
      },
)
const page = await browser.newPage({
  viewport: { width: Number(opt.w ?? (mobile ? 390 : 1920)), height: Number(opt.h ?? (mobile ? 844 : 1080)) },
  isMobile: mobile,
  hasTouch: mobile,
  deviceScaleFactor: Number(opt.dpr ?? 1),
  reducedMotion: opt['reduced-motion'] ? 'reduce' : 'no-preference',
})

if (opt.quality) await page.addInitScript((q) => localStorage.setItem('bb:quality', q), String(opt.quality))

// Contador de llamadas de dibujo: se instala antes que cualquier script de la página.
await page.addInitScript(() => {
  window.__benchDraws = 0
  const methods = [
    'drawArrays',
    'drawElements',
    'drawArraysInstanced',
    'drawElementsInstanced',
    'drawRangeElements',
  ]
  for (const proto of [
    globalThis.WebGLRenderingContext?.prototype,
    globalThis.WebGL2RenderingContext?.prototype,
  ]) {
    if (!proto) continue
    for (const name of methods) {
      const original = proto[name]
      if (typeof original !== 'function') continue
      proto[name] = function (...a) {
        window.__benchDraws++
        return original.apply(this, a)
      }
    }
  }
})

if (opt.cpu) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(opt.cpu) })
}

await page.goto(url)
await page.waitForTimeout(Number(opt.warmup ?? 2500))
if (opt.eval) await page.evaluate(opt.eval)

const res = await page.evaluate(async (secs) => {
  const stageStart = window.__bbStage?.frames ?? null
  const times = []
  const draws = []
  let last = performance.now()
  const end = last + secs * 1000
  window.__benchDraws = 0
  await new Promise((resolve) => {
    const step = (t) => {
      times.push(t - last)
      draws.push(window.__benchDraws)
      window.__benchDraws = 0
      last = t
      if (t < end) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
  // El primer intervalo incluye el tiempo hasta el primer fotograma: no cuenta.
  times.shift()
  draws.shift()
  const stageEnd = window.__bbStage?.frames ?? null
  const sorted = [...times].sort((a, b) => a - b)
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  return {
    frames: times.length,
    fps: Math.round((1000 / avg) * 10) / 10,
    // percentil por rango más cercano: con 100 fotogramas es el 99.º, no el máximo
    p99ms: Math.round(sorted[Math.max(0, Math.ceil(sorted.length * 0.99) - 1)] * 10) / 10,
    worstMs: Math.round(sorted.at(-1) * 10) / 10,
    longFrames: times.filter((t) => t > 33.4).length,
    drawCallsMax: Math.max(0, ...draws),
    drawCallsAvg: Math.round((draws.reduce((a, b) => a + b, 0) / Math.max(1, draws.length)) * 10) / 10,
    stageFps: stageStart === null ? null : Math.round(((stageEnd - stageStart) / secs) * 10) / 10,
    quality: sessionStorage.getItem('bb:stage-probe') ?? localStorage.getItem('bb:quality'),
    particles: window.__bbStage?.particles?.alive ?? null,
  }
}, secs)
const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl')
  const info = gl?.getExtension('WEBGL_debug_renderer_info')
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null
})
console.log(JSON.stringify({ ...res, renderer }))
if (opt.shot) await page.screenshot({ path: opt.shot })
await browser.close()
