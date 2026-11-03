// Capturas de la ceremonia del campeón de temporada (tarea 7.27, guía §3.8.15) contra una API sembrada con
// `apps/server/src/scripts/seedBattle.ts … season` (la temporada anterior cerrada con su campeona, `prod01`). Entra con
// una cuenta, abre el menú (o los resultados de la última semana de la temporada cerrada) y captura los momentos de la
// línea de tiempo; después, los avisos de logro que esperaban y salen al cerrarse. `POST /api/me/seen` se contesta
// aquí con un 204 sin llegar a la API, así cada pasada la vuelve a ver. Uso:
//   node tools/shot/season-ceremony-f7.mjs <origen> <carpeta> [pasadas]
// `pasadas`: lista separada por comas de `alta`, `apagada`, `movil`, `reducido`, `serio`, `contraste`, `jurado`,
// `resultados` y `bajo` (por defecto, todas).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const [origin = 'http://localhost:5185', out = '.', only = ''] = process.argv.slice(2)
const ALL = 'alta,apagada,movil,reducido,serio,contraste,jurado,resultados,bajo'
const runs = new Set((only || ALL).split(','))
mkdirSync(out, { recursive: true })

const DESKTOP = { name: '1440x900', width: 1440, height: 900 }
const LOW = { name: '1366x657', width: 1366, height: 657 }
const PHONE = { name: '390x844-touch', width: 390, height: 844, touch: true }

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-lcd-text'],
})
const ip = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`

async function open(size, { account, quality = 'alta', reduced = false, forced = false, serious = false }) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    isMobile: Boolean(size.touch),
    hasTouch: Boolean(size.touch),
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    forcedColors: forced ? 'active' : 'none',
  })
  await ctx.addInitScript(
    ([quality, serious]) => {
      localStorage.setItem('bb:title', 'off')
      localStorage.setItem('bb:quality', quality)
      // La revelación del drop y la oferta de la ceremonia de la semana, ya vistas: aquí se mira la de temporada.
      const getItem = Storage.prototype.getItem
      Storage.prototype.getItem = function (key) {
        return key.startsWith('bb:drop-seen:') || key.startsWith('bb:ceremony-seen:')
          ? 'yes'
          : getItem.call(this, key)
      }
      if (serious)
        document.addEventListener('DOMContentLoaded', () =>
          document.documentElement.setAttribute('data-serious', ''),
        )
    },
    [quality, serious],
  )
  const page = await ctx.newPage()
  const logs = []
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') logs.push(`[error] ${message.text()}`)
  })
  // Las semanas ya vistas también en el servidor (la home pregunta por la oferta de la ceremonia de la semana).
  await page.route('**/api/me/seen', (route) => route.fulfill({ status: 204, body: '' }))
  const res = await page.request.post(`${origin}/api/auth/sign-in/email`, {
    headers: { origin, 'x-forwarded-for': ip() },
    data: { email: `${account}@example.com`, password: 'lluvia en gràcia 92' },
  })
  if (!res.ok()) throw new Error(`entrar como ${account}: ${res.status()}`)
  return { ctx, page, logs }
}

/**
 * Abre `path` con el reloj de la página parado y captura los momentos de la ceremonia (ms desde que sale la capa):
 * el reloj avanza a mano hasta cada uno (así la placa, que dura 0,4 s, sale entera) y después se espera de verdad a que
 * acaben las transiciones CSS. Al final, el reloj vuelve a correr.
 */
async function frames(
  size,
  name,
  options,
  path = '/',
  moments = [
    ['placa', 150],
    ['carta', 700],
    ['cifras', 1700],
  ],
) {
  const { ctx, page, logs } = await open(size, options)
  await page.clock.install()
  // La clasificación de la temporada es lo primero que pide la ceremonia: con ella en la mano, se para el reloj y la capa
  // sale parada en su primer instante.
  let release
  const asked = new Promise((resolve) => {
    page.route('**/api/seasons/*/standings', (route) => {
      release = () => route.continue()
      resolve()
    })
  })
  await page.goto(`${origin}${path}`)
  await asked
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(new Date(now + 250))
  release()
  const dialog = page.locator('[data-season-ceremony]')
  await dialog.waitFor({ timeout: 20_000 })
  let at = 0
  for (const [moment, ms] of moments) {
    if (ms > at) await page.clock.runFor(ms - at)
    at = Math.max(at, ms)
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(out, `7.27-${name}-${moment}-${size.name}.png`) })
  }
  await page.clock.resume()
  return { ctx, page, logs, dialog }
}

const done = async ({ ctx, logs }, name) => {
  if (logs.length) console.log(`${name}:\n  ${logs.join('\n  ')}`)
  await ctx.close()
}

if (runs.has('alta')) {
  // La campeona, con la calidad alta: la ceremonia entera, se cierra sola y sale su «¡LOGRO LEGENDARIO!».
  const run = await frames(DESKTOP, 'campeona', { account: 'prod01' }, '/', [
    ['placa', 150],
    ['carta', 700],
    ['cifras', 1700],
    ['final', 5600],
  ])
  await run.dialog.waitFor({ state: 'detached', timeout: 10_000 })
  await done(run, 'alta')
  // Los avisos que esperaban (§3.8.8) salen al cerrarse: los logros del sellado, en el orden del catálogo. Con el reloj
  // de verdad (con el de Playwright, las animaciones de Motion de los avisos empiezan tarde y no se ven).
  const real = await open(DESKTOP, { account: 'prod01' })
  await real.page.goto(`${origin}/`)
  const dialog = real.page.locator('[data-season-ceremony]')
  await dialog.waitFor({ timeout: 20_000 })
  await real.page.waitForTimeout(1500)
  await real.page.screenshot({ path: join(out, `7.27-campeona-sin-avisos-durante-${DESKTOP.name}.png`) })
  await dialog.waitFor({ state: 'detached', timeout: 10_000 })
  await real.page.locator('[data-notice]').first().waitFor({ timeout: 10_000 })
  await real.page.waitForTimeout(900)
  await real.page.screenshot({ path: join(out, `7.27-campeona-despues-avisos-${DESKTOP.name}.png`) })
  await done(real, 'avisos')
}

if (runs.has('apagada')) {
  const run = await frames(DESKTOP, 'campeona-apagada', { account: 'prod01', quality: 'apagada' })
  await done(run, 'apagada')
}

if (runs.has('movil')) {
  const run = await frames(PHONE, 'campeona', { account: 'prod01' })
  await done(run, 'movil')
}

if (runs.has('reducido')) {
  const run = await frames(DESKTOP, 'campeona-sin-movimiento', { account: 'prod01', reduced: true })
  await done(run, 'reducido')
}

if (runs.has('serio')) {
  const run = await frames(DESKTOP, 'campeona-serio', { account: 'prod01', serious: true })
  await done(run, 'serio')
}

if (runs.has('contraste')) {
  const run = await frames(DESKTOP, 'campeona-contraste', { account: 'prod01', forced: true }, '/', [
    ['cifras', 1700],
  ])
  await done(run, 'contraste')
}

if (runs.has('jurado')) {
  // Quien no es campeón la ve igual, dicha de la campeona; y se salta con una tecla.
  const run = await frames(DESKTOP, 'jurado', { account: 'jurado1' }, '/', [['cifras', 1700]])
  await run.page.keyboard.press('ArrowDown')
  await run.dialog.waitFor({ state: 'detached', timeout: 2000 })
  await run.page.waitForTimeout(400)
  await run.page.screenshot({ path: join(out, `7.27-jurado-saltada-${DESKTOP.name}.png`) })
  await done(run, 'jurado')
}

if (runs.has('resultados') || runs.has('bajo')) {
  // La última semana de la temporada cerrada: la de su último lunes (la del campeón en el salón de la fama).
  const hall = (await (await fetch(`${origin}/api/hall-of-fame`)).json()).data
  const season = hall.seasonChampions[0]?.seasonId
  const standings = (await (await fetch(`${origin}/api/seasons/${season}/standings`)).json()).data
  console.log(`temporada ${season}: ${standings.season.sealedWeeks} semanas selladas`)
  const archive = (await (await fetch(`${origin}/api/weeks`)).json()).data
  // La temporada de una semana es la de su lunes (§2.9): el lunes de la semana ISO del slug.
  const seasonOfSlug = (slug) => {
    const [y, w] = slug.split('-w').map(Number)
    const january4 = Date.UTC(y, 0, 4)
    const weekday = (new Date(january4).getUTCDay() + 6) % 7
    const monday = new Date(january4 + ((w - 1) * 7 - weekday) * 86_400_000)
    return `${monday.getUTCFullYear()}-T${Math.floor(monday.getUTCMonth() / 3) + 1}`
  }
  const last = archive.weeks.find((week) => seasonOfSlug(week.slug) === season)?.slug
  console.log(`última semana de ${season}: ${last}`)
  if (runs.has('resultados') && last) {
    const run = await frames(DESKTOP, 'resultados', { account: 'prod02' }, `/semana/${last}/resultados`, [
      ['carta', 700],
    ])
    await done(run, 'resultados')
  }
  if (runs.has('bajo')) {
    const run = await frames(LOW, 'campeona', { account: 'prod01' }, '/', [['cifras', 1700]])
    await done(run, 'bajo')
  }
}

await browser.close()
console.log(`Capturas en ${out}`)
