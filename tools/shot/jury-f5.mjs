// Capturas del jurado visual de la Fase 5 (tarea 5.22) contra una API sembrada con
// `apps/server/src/scripts/seedBattle.ts`: «ELIGE ENTRADA», la ficha, el Modo Jurado (escuchando y con las
// estrellas despiertas), la barra del reproductor y la puerta del jurado, en los tamaños de referencia; sin
// movimiento y en contraste alto, los de escritorio. Uso:
//   node tools/shot/jury-f5.mjs <origen> <carpeta> <semana> [cuenta]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const [origin = 'http://localhost:5176', out = '.', slug = '2026-w42', account = 'jurado1@example.com'] =
  process.argv.slice(2)
mkdirSync(out, { recursive: true })

const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1366', width: 1366, height: 657 },
  { name: '1024', width: 1024, height: 768 },
  { name: '390', width: 390, height: 844, touch: true },
  { name: '320', width: 320, height: 568, touch: true },
]

const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--ignore-gpu-blocklist',
    '--use-angle=vulkan',
    '--enable-features=Vulkan',
    '--disable-lcd-text',
    '--autoplay-policy=no-user-gesture-required',
  ],
})
const ip = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`

async function context(size, { signedIn = true, reduced = false, forced = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    isMobile: Boolean(size.touch),
    hasTouch: Boolean(size.touch),
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    forcedColors: forced ? 'active' : 'none',
  })
  await ctx.addInitScript(() => {
    localStorage.setItem('bb:title', 'off')
    const getItem = Storage.prototype.getItem
    Storage.prototype.getItem = function (key) {
      return key.startsWith('bb:drop-seen:') ? 'yes' : getItem.call(this, key)
    }
  })
  const page = await ctx.newPage()
  if (signedIn) {
    const res = await page.request.post(`${origin}/api/auth/sign-in/email`, {
      headers: { origin, 'x-forwarded-for': ip() },
      data: { email: account, password: 'lluvia en gràcia 92' },
    })
    if (!res.ok()) throw new Error(`entrar: ${res.status()}`)
  }
  return { ctx, page }
}

const shot = (page, name, size, full = false) =>
  page.screenshot({ path: join(out, `${name}-${size.name}.png`), fullPage: full || Boolean(size.touch) })

const entries = (await (await fetch(`${origin}/api/weeks/${slug}/entries`)).json()).data.entries
const target = entries[2]

for (const size of SIZES) {
  // «ELIGE ENTRADA», con el cursor movido una casilla.
  {
    const { ctx, page } = await context(size)
    await page.goto(`${origin}/semana/${slug}/entradas`)
    await page.getByRole('option').nth(2).waitFor()
    await page.waitForTimeout(800)
    await shot(page, 'seleccion', size)
    // La barra del reproductor: Intro en la enfocada y, en otra pantalla, la barra.
    await page.getByRole('option').nth(1).click()
    await page.waitForTimeout(600)
    await page.evaluate(() => {
      history.pushState({}, '', '/como-funciona')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    await page.waitForTimeout(1500)
    await shot(page, 'reproductor', size, false)
    await ctx.close()
  }
  // La ficha.
  {
    const { ctx, page } = await context(size)
    await page.goto(`${origin}/e/${target.id}`)
    await page.waitForTimeout(1500)
    await shot(page, 'ficha', size)
    await ctx.close()
  }
  // El Modo Jurado: escuchando y, a los 31 s, con las estrellas despiertas.
  {
    const { ctx, page } = await context(size)
    await page.goto(`${origin}/`)
    await page.waitForTimeout(700)
    await page.evaluate(() => {
      history.pushState({}, '', '/jurado')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    await page.waitForTimeout(2500)
    await shot(page, 'jurado-escuchando', size)
    if (size.name === '1440' || size.name === '390') {
      await page.waitForTimeout(30_000)
      await shot(page, 'jurado-despierto', size)
    }
    await ctx.close()
  }
}

// La puerta del jurado sin cuenta, y escritorio sin movimiento y en contraste alto.
for (const size of [SIZES[0], SIZES[3]]) {
  const { ctx, page } = await context(size, { signedIn: false })
  await page.goto(`${origin}/jurado`)
  await page.waitForTimeout(1500)
  await shot(page, 'jurado-puerta', size)
  await ctx.close()
}
for (const [mode, options] of [
  ['sin-movimiento', { reduced: true }],
  ['contraste', { forced: true }],
]) {
  for (const [name, path] of [
    ['seleccion', `/semana/${slug}/entradas`],
    ['ficha', `/e/${target.id}`],
  ]) {
    const { ctx, page } = await context(SIZES[0], options)
    await page.goto(`${origin}${path}`)
    await page.waitForTimeout(1500)
    await shot(page, `${name}-${mode}`, SIZES[0])
    await ctx.close()
  }
  const { ctx, page } = await context(SIZES[0], options)
  await page.goto(`${origin}/`)
  await page.waitForTimeout(700)
  await page.evaluate(() => {
    history.pushState({}, '', '/jurado')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.waitForTimeout(2500)
  await shot(page, `jurado-${mode}`, SIZES[0])
  await ctx.close()
}
await browser.close()
console.log('listo')
