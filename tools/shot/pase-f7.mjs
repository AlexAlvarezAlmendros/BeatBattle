// Capturas del pase de torneo de la carta (tarea 7.23) para decidir «Pase de la carta» (decisión abierta del roadmap):
// la carta colgada en reposo, arrastrada (sujeta con el ratón o con el dedo) y plana (calidad apagada, «reducir
// movimiento», sin WebGL, modo serio, contraste alto y en una columna), girada con C, holo, con el foco en la pieza y el
// detalle a 2×; en 1440 × 900 y en 390 × 844 táctil (ahí la carta es plana; con `bb:pass` = `on`, cómo quedaría colgada,
// con la diagonal de la arena por encima). Contra una web con la API sembrada (`seedBattle.ts … season`), con el Chrome
// del sistema y la GPU real, como `shot.mjs`.
// Uso: node tools/shot/pase-f7.mjs <origen> <carpeta> [nombre…]   (con nombres, solo esas capturas)
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const [origin = 'http://localhost:5480', out = '.', ...only] = process.argv.slice(2)
mkdirSync(out, { recursive: true })

const GPU = ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
const browsers = {}
const browser = async (webgl) => {
  const key = webgl ? 'gpu' : 'nowebgl'
  browsers[key] ??= await chromium.launch({
    channel: 'chrome',
    args: webgl ? GPU : [...GPU, '--disable-webgl'],
  })
  return browsers[key]
}

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

async function open(path, options = {}) {
  const {
    viewport = DESKTOP,
    dpr = 1,
    touch = false,
    storage = {},
    live = true,
    webgl = true,
    ...context
  } = options
  const page = await (await browser(webgl)).newPage({
    viewport,
    deviceScaleFactor: dpr,
    isMobile: touch,
    hasTouch: touch,
    ...context,
  })
  await page.addInitScript((items) => {
    localStorage.setItem('bb:quality', 'alta')
    localStorage.setItem('bb:title', 'off')
    for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value)
  }, storage)
  await page.goto(`${origin}${path}`)
  await page.waitForSelector('[data-producer-card]')
  if (live) await page.waitForSelector('[data-pass-live]', { timeout: 30_000 })
  else await page.waitForTimeout(2500)
  // Que el Escenario haya pintado la carta quieta (la física, dormida).
  await page.waitForTimeout(900)
  return page
}

/** Arrastra la carta desde su esquina de abajo y la deja sujeta (sin soltar) para la captura. */
async function dragMouse(page, dx, dy) {
  const box = await page.locator('[data-producer-card]').boundingBox()
  const x = box.x + box.width * 0.72
  const y = box.y + box.height * 0.82
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 14 })
  await page.waitForTimeout(700)
}

/** Lo mismo con el dedo (eventos táctiles por CDP: Playwright solo sabe tocar). */
async function dragTouch(page, dx, dy) {
  const box = await page.locator('[data-producer-card]').boundingBox()
  const x = box.x + box.width * 0.72
  const y = box.y + box.height * 0.82
  const cdp = await page.context().newCDPSession(page)
  const touch = (type, px, py) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py }] })
  await touch('touchStart', x, y)
  for (let i = 1; i <= 14; i++) {
    await touch('touchMove', x + (dx * i) / 14, y + (dy * i) / 14)
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(700)
}

const shots = [
  { name: 'pase-1440x900-reposo.png', path: '/p/prod01' },
  { name: 'pase-1440x900-arrastre.png', path: '/p/prod01', run: (page) => dragMouse(page, 120, -70) },
  { name: 'pase-1440x900-holo.png', path: '/p/prod02' },
  {
    name: 'pase-1440x900-reverso.png',
    path: '/p/prod01',
    run: async (page) => {
      await page.keyboard.press('c')
      await page.waitForTimeout(2500)
    },
  },
  {
    // El foco en la pieza: Tab hasta «Girar carta» (la carta plana sigue debajo, en el árbol accesible).
    name: 'pase-1440x900-foco.png',
    path: '/p/prod01',
    run: async (page) => {
      await page.getByRole('button', { name: /Girar carta/ }).focus()
      await page.waitForTimeout(300)
    },
  },
  {
    name: 'pase-1440x900-plana-calidad-apagada.png',
    path: '/p/prod01',
    storage: { 'bb:quality': 'apagada' },
    live: false,
  },
  { name: 'pase-1440x900-plana-sin-movimiento.png', path: '/p/prod01', reducedMotion: 'reduce', live: false },
  { name: 'pase-1440x900-plana-sin-webgl.png', path: '/p/prod01', webgl: false, live: false },
  { name: 'pase-1440x900-plana-contraste-alto.png', path: '/p/prod01', forcedColors: 'active', live: false },
  {
    // El modo serio (`<html data-serious>`) a mitad de visita: el pase se va y vuelve la carta plana.
    name: 'pase-1440x900-plana-modo-serio.png',
    path: '/p/prod01',
    run: async (page) => {
      await page.evaluate(() => document.documentElement.setAttribute('data-serious', ''))
      await page.waitForSelector('[data-pass-room]', { state: 'detached' })
      await page.waitForTimeout(400)
    },
  },
  {
    name: 'pase-detalle-2x.png',
    path: '/p/prod01',
    dpr: 2,
    clip: { x: 60, y: 110, width: 380, height: 260 },
  },
  { name: 'pase-390x844-tactil-plana.png', path: '/p/prod01', viewport: PHONE, touch: true, live: false },
  {
    name: 'pase-390x844-tactil-forzado-reposo.png',
    path: '/p/prod01',
    viewport: PHONE,
    touch: true,
    storage: { 'bb:pass': 'on' },
  },
  {
    name: 'pase-390x844-tactil-forzado-arrastre.png',
    path: '/p/prod01',
    viewport: PHONE,
    touch: true,
    storage: { 'bb:pass': 'on' },
    run: (page) => dragTouch(page, 70, -50),
  },
]

for (const { name, path, run, clip, ...options } of shots) {
  if (only.length && !only.includes(name)) continue
  const page = await open(path, options)
  await run?.(page)
  await page.screenshot({ path: join(out, name), clip })
  const state = await page.evaluate(() => ({
    room: Boolean(document.querySelector('[data-pass-room]')),
    live: Boolean(document.querySelector('[data-pass-live]')),
    side: document.querySelector('[data-producer-card]')?.getAttribute('data-side'),
    animating: window.__bbStage?.animating,
    drawCalls: window.__bbStage?.drawCalls,
  }))
  console.log(name, JSON.stringify(state))
  await page.close()
}
for (const instance of Object.values(browsers)) await instance.close()
