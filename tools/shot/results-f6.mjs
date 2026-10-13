// Capturas del jurado visual de la Fase 6 (tareas 6.15–6.22) contra una API sembrada con
// `apps/server/src/scripts/seedBattle.ts … sealed`: la página de resultados (sin sesión y con la de alguien
// que participó), en los tamaños de referencia; sin movimiento y en contraste alto, la de escritorio. Uso:
//   node tools/shot/results-f6.mjs <origen> <carpeta> <semana sellada> [páginas]
// `páginas`: lista separada por comas de `resultados` y `ceremonia` (por defecto, todas).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const [origin = 'http://localhost:5176', out = '.', slug = '2026-w41', only = ''] = process.argv.slice(2)
const pages = new Set((only || 'resultados,ceremonia').split(','))
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
  args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-lcd-text'],
})
const ip = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`

async function context(size, { account = null, reduced = false, forced = false } = {}) {
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
  if (account) {
    const res = await page.request.post(`${origin}/api/auth/sign-in/email`, {
      headers: { origin, 'x-forwarded-for': ip() },
      data: { email: `${account}@example.com`, password: 'lluvia en gràcia 92' },
    })
    if (!res.ok()) throw new Error(`entrar: ${res.status()}`)
  }
  return { ctx, page }
}

const shot = (page, name, size, full = false) =>
  page.screenshot({ path: join(out, `${name}-${size.name}.png`), fullPage: full || Boolean(size.touch) })

const results = (await (await fetch(`${origin}/api/weeks/${slug}/results`)).json()).data
// Alguien de mitad de tabla, para «TU RESULTADO».
const middle = results.rows[Math.floor(results.rows.length / 2)].entry.producer.username

if (pages.has('resultados'))
  for (const size of SIZES) {
    for (const [name, account] of [
      ['resultados', null],
      ['resultados-participante', middle],
    ]) {
      const { ctx, page } = await context(size, { account })
      await page.goto(`${origin}/semana/${slug}/resultados`)
      await page.getByRole('region', { name: 'Podio' }).waitFor()
      await page.waitForTimeout(1200)
      await shot(page, name, size)
      if (size.name === '1440' && account) await shot(page, `${name}-entera`, size, true)
      await ctx.close()
    }
    if (size.name === '1440')
      for (const [name, options] of [
        ['resultados-sin-movimiento', { reduced: true }],
        ['resultados-contraste', { forced: true }],
      ]) {
        const { ctx, page } = await context(size, { account: middle, ...options })
        await page.goto(`${origin}/semana/${slug}/resultados`)
        await page.getByRole('region', { name: 'Podio' }).waitFor()
        await page.waitForTimeout(1200)
        await shot(page, name, size)
        await ctx.close()
      }
  }

// La ceremonia (6.17): fotogramas en los momentos clave de su línea de tiempo, sin movimiento también.
if (pages.has('ceremonia'))
  for (const size of [SIZES[0], SIZES[3]])
    for (const reduced of [false, true]) {
      const { ctx, page } = await context(size, { account: middle, reduced })
      await page.goto(`${origin}/semana/${slug}/resultados?ceremonia`)
      await page.getByRole('dialog').waitFor()
      const started = Date.now()
      for (const [name, ms] of [
        ['luces', 1000],
        ['rafaga', 4200],
        ['foco-3', 7300],
        ['sello-3', 7900],
        ['nombre-3', 9000],
        ['nombre-2', 13_500],
        ['campeon', 20_300],
        ['tu-resultado', 24_000],
      ]) {
        await page.waitForTimeout(Math.max(0, ms - (Date.now() - started)))
        await shot(page, `ceremonia-${name}${reduced ? '-sin-movimiento' : ''}`, size)
      }
      await ctx.close()
    }

await browser.close()
console.log(`Capturas en ${out}`)
