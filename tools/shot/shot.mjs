#!/usr/bin/env node
// Captura una URL con el Chrome del sistema (GPU real si está disponible) y vuelca la consola.
// Portado de Orchard (`tools/shot/shot.mjs`). Las capturas de referencia de BeatBattle van a 1440 y
// 390 px de ancho (guía §4.16), así que esos son los tamaños por defecto.
//
// Uso: node tools/shot/shot.mjs <url> <salida.png> [opciones]
//   --w=1440 --h=900          tamaño de la ventana (por defecto, escritorio de la guía)
//   --mobile                  390×844 táctil (el móvil de la guía); --w/--h lo sobrescriben
//   --dpr=1                   densidad de píxeles
//   --until=load              load | domcontentloaded | networkidle
//   --wait=1500               espera tras cargar, en ms
//   --full                    página entera en vez de solo la ventana
//   --reduced-motion          emula «reducir movimiento» (calidad apagada del Escenario)
//   --forced-colors           emula el contraste alto (`forced-colors: active`)
//   --touch                   táctil (`hover: none`, `pointer: coarse`) sin cambiar el tamaño
//   --eval="expr"             evalúa una expresión antes de capturar e imprime el resultado
//   --init="js"               ejecuta código antes de que cargue la página (p. ej. fijar sessionStorage)
//   --headed                  con ventana visible
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const [url, out = 'shot.png'] = args.filter((a) => !a.startsWith('--'))
const opt = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...v] = a.slice(2).split('=')
      return [k, v.length ? v.join('=') : true]
    }),
)
if (!url) {
  console.error('Uso: node tools/shot/shot.mjs <url> <salida.png> [--w= --h= --mobile --full --eval=…]')
  process.exit(1)
}

const mobile = Boolean(opt.mobile)
const w = Number(opt.w ?? (mobile ? 390 : 1440))
const h = Number(opt.h ?? (mobile ? 844 : 900))
const browser = await chromium.launch({
  channel: 'chrome',
  headless: !opt.headed,
  args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'],
})
const page = await browser.newPage({
  viewport: { width: w, height: h },
  deviceScaleFactor: Number(opt.dpr ?? 1),
  isMobile: mobile || Boolean(opt.touch),
  hasTouch: mobile || Boolean(opt.touch),
  reducedMotion: opt['reduced-motion'] ? 'reduce' : 'no-preference',
  forcedColors: opt['forced-colors'] ? 'active' : 'none',
})
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
if (opt.init) await page.addInitScript(opt.init)
await page.goto(url, { waitUntil: opt.until ?? 'load' })
await page.waitForTimeout(Number(opt.wait ?? 1500))
if (opt.eval) {
  const r = await page.evaluate(opt.eval)
  if (r !== undefined) console.log('eval:', JSON.stringify(r))
}
await page.screenshot({ path: out, fullPage: Boolean(opt.full) })
if (logs.length) console.log(logs.join('\n'))
await browser.close()
