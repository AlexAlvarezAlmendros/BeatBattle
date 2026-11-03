// Capturas del jurado visual de la Fase 7 (tarea 7.35, `RD-VIS-02` (e)) contra una web con la API sembrada con
// `apps/server/src/scripts/seedBattle.ts … season` (la temporada anterior cerrada con su campeona, `prod01`; las selladas
// de la en curso y la de este lunes abierta). Captura el HUD con XP y teselas (en el menú), el banco de recompensas
// (`/dev/recompensas`: el «+5 XP» en vuelo, los avisos de logro, el legendario y la subida de nivel), los avisos que
// trae `me` al cargar, la carta (`/dev/carta`: anverso, reverso y variantes), el perfil, el salón de la fama, la
// temporada (cerrada y en curso), las imágenes OG del perfil y las tarjetas para *stories* del banco; en 1440 × 900,
// 1366 × 657, 1024 × 768, 390 × 844 y 320 × 568 táctiles y, en escritorio, también sin movimiento, en contraste alto,
// con la calidad apagada y en modo serio. El pase, la ceremonia del campeón, el perfil propio con «Compartir mi carta»
// y los emails tienen sus scripts (`pase-f7.mjs`, `season-ceremony-f7.mjs`, `flow-f7-compartir.mjs`, `emails.mjs`):
// el acta del jurado dice cómo se lanzaron.
//
// Chrome del sistema con la GPU real (ANGLE sobre Vulkan) y sin suavizado LCD, como los demás jurados. Para que el HUD
// y las pantallas salgan sin capas encima, la ceremonia del campeón y los avisos pendientes de `me` se quitan de la
// respuesta (salvo en `pendientes`, que los mira) y `POST /api/me/seen` se contesta aquí: así cada pasada ve lo mismo.
//
//   node tools/shot/jury-f7.mjs <origen> <carpeta> [grupos]
// `grupos`: lista separada por comas de `hud`, `recompensas`, `pendientes`, `carta`, `carta-usos` (la bienvenida y
// Ajustes → Perfil), `perfil`, `salon`, `temporada`, `og` y `stories` (por defecto, todos).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const [origin = 'http://localhost:5774', out = '.', only = ''] = process.argv.slice(2)
const ALL = 'hud,recompensas,pendientes,carta,carta-usos,perfil,salon,temporada,og,stories'
const groups = new Set((only || ALL).split(','))
mkdirSync(out, { recursive: true })

const SIZES = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x657', width: 1366, height: 657 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '390x844-tactil', width: 390, height: 844, touch: true },
  { name: '320x568-tactil', width: 320, height: 568, touch: true },
]
const DESKTOP = SIZES[0]
const PHONE = SIZES[3]
/** Las variantes de escritorio: sin movimiento, contraste alto, calidad apagada y modo serio. */
const MODES = [
  { name: 'sin-movimiento', reduced: true },
  { name: 'contraste', forced: true },
  { name: 'apagada', quality: 'apagada' },
  { name: 'serio', serious: true },
]
const PASSWORD = 'lluvia en gràcia 92'

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-lcd-text'],
})
const ip = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`

/**
 * Un contexto con el tamaño y el modo pedidos. `account`, con sesión; `quiet`, `me` sin la ceremonia del campeón ni los
 * avisos pendientes (el HUD con su XP y sus teselas, sin capas encima).
 */
async function open(
  size,
  { account = null, quality = 'alta', reduced = false, forced = false, serious = false, quiet = true } = {},
) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    isMobile: Boolean(size.touch),
    hasTouch: Boolean(size.touch),
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    forcedColors: forced ? 'active' : 'none',
    acceptDownloads: true,
  })
  await ctx.addInitScript(
    ([quality, serious]) => {
      localStorage.setItem('bb:title', 'off')
      localStorage.setItem('bb:quality', quality)
      // La revelación del drop y la oferta de la ceremonia de la semana, ya vistas.
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
  await page.route('**/api/me/seen', (route) => route.fulfill({ status: 204, body: '' }))
  if (quiet)
    await page.route('**/api/me', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch()
      const body = await response.json()
      if (body?.data?.game) {
        body.data.game.seasonCeremony = null
        body.data.game.unseenAchievements = []
        body.data.game.levelSeen = body.data.game.level
      }
      return route.fulfill({ response, json: body })
    })
  if (account) {
    const res = await page.request.post(`${origin}/api/auth/sign-in/email`, {
      headers: { origin, 'x-forwarded-for': ip() },
      data: { email: `${account}@example.com`, password: PASSWORD },
    })
    if (!res.ok()) throw new Error(`entrar como ${account}: ${res.status()}`)
  }
  return { ctx, page, logs }
}

const done = async ({ ctx, logs }, name) => {
  if (logs.length) console.log(`${name}:\n  ${[...new Set(logs)].join('\n  ')}`)
  await ctx.close()
}

/**
 * Abre `path`, espera a `ready` (un selector) y a que se asiente, y captura la ventana; con `full` (por defecto, en
 * táctil), también el resto de la página **desplazándola** pantalla a pantalla (`-p2`, `-p3`…), como la ve quien la
 * recorre: la captura de página entera de Chrome deja la barra de controles fija a media página y no es lo que se ve.
 */
async function capture(size, name, path, { ready = 'main h1', wait = 1500, full, run, ...options } = {}) {
  const session = await open(size, options)
  const { page } = session
  await page.goto(`${origin}${path}`)
  await page.locator(ready).first().waitFor({ state: 'attached', timeout: 30_000 })
  await page.waitForTimeout(wait)
  await run?.(page)
  await page.screenshot({ path: join(out, `${name}-${size.name}.png`) })
  if (full ?? size.touch) {
    // Lo que tapa la barra de controles no cuenta como visto: cada pantalla avanza el alto de la ventana menos la barra.
    const step = await page.evaluate(() => {
      const bar = document.querySelector('[data-controls-bar], footer')
      return Math.max(200, innerHeight - (bar?.getBoundingClientRect().height ?? 60) - 24)
    })
    for (let screen = 2; screen <= 8; screen++) {
      const moved = await page.evaluate((step) => {
        const before = scrollY
        scrollBy(0, step)
        return scrollY > before
      }, step)
      if (!moved) break
      await page.waitForTimeout(500)
      await page.screenshot({ path: join(out, `${name}-p${screen}-${size.name}.png`) })
    }
  }
  console.log(`${name}-${size.name}`)
  await done(session, `${name}-${size.name}`)
}

/** Una pantalla en los cinco tamaños y, en escritorio, en los cuatro modos. */
async function everywhere(name, path, options = {}) {
  for (const size of SIZES) await capture(size, name, path, options)
  for (const mode of MODES) await capture(DESKTOP, `${name}-${mode.name}`, path, { ...options, ...mode })
}

// El HUD con XP, nivel y las teselas de temporada y racha, en el menú (`prod05`: nivel 10, «Productor», racha ×7).
if (groups.has('hud')) await everywhere('hud-menu', '/', { account: 'prod05', ready: '[data-otp-signature]' })

// El banco de la capa de juego: el «+5 XP» en vuelo, la subida de nivel, tres placas y la cola, y el legendario.
if (groups.has('recompensas')) {
  const bench = async (size, name, mode = {}) => {
    const fire = async (page, key, anchorText) => {
      await page.evaluate(
        ([key, anchorText]) => {
          const anchor = anchorText
            ? [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(anchorText))
            : null
          window.__bbRewards?.[key]?.(anchor)
        },
        [key, anchorText],
      )
    }
    const frame = async (key, moment, ms, anchorText) => {
      const session = await open(size, mode)
      const { page } = session
      await page.goto(`${origin}/dev/recompensas`)
      await page.waitForFunction(() => Boolean(window.__bbRewards))
      await page.waitForTimeout(1200)
      await fire(page, key, anchorText)
      await page.waitForTimeout(ms)
      await page.screenshot({ path: join(out, `${name}-${moment}-${size.name}.png`) })
      console.log(`${name}-${moment}-${size.name}`)
      await done(session, `${name}-${moment}-${size.name}`)
    }
    await frame('vote', 'xp-sube', 260, 'Votar')
    await frame('vote', 'xp-vuela', 640, 'Votar')
    await frame('level', 'nivel', 1800)
    await frame('stack', 'logros', 1400)
    await frame('legendary', 'legendario', 1400)
  }
  for (const size of SIZES) await bench(size, 'recompensas')
  for (const mode of MODES) await bench(DESKTOP, `recompensas-${mode.name}`, mode)
}

// Lo que trae `me` al cargar (sin quitarlo): los logros del sellado sin ver, en una pantalla sin ceremonia.
if (groups.has('pendientes'))
  for (const size of [DESKTOP, PHONE])
    await capture(size, 'pendientes-al-cargar', '/temporada/2026-T4', {
      account: 'prod05',
      quiet: false,
      ready: '[data-notice]',
      wait: 900,
      full: false,
    })

// La carta en el banco: las cuatro variantes, anverso y reverso (la plana de `RF-GAME-07`, HTML).
if (groups.has('carta')) {
  for (const size of [DESKTOP, SIZES[2], PHONE, SIZES[4]])
    await capture(size, 'carta-banco', '/dev/carta', {
      ready: '[data-producer-card]',
      wait: 2500,
      full: true,
    })
  for (const mode of MODES)
    await capture(DESKTOP, `carta-banco-${mode.name}`, '/dev/carta', {
      ready: '[data-producer-card]',
      wait: 2500,
      full: true,
      ...mode,
    })
}

// El perfil: la campeona (pase 3D), una roja, una estándar y un jurado sin entradas; y la cuadrícula de logros abierta.
if (groups.has('perfil')) {
  await everywhere('perfil-campeona', '/p/prod01', { ready: '[data-producer-card]', wait: 3000 })
  for (const [name, user] of [
    ['perfil-roja', 'prod05'],
    ['perfil-estandar', 'prod06'],
    ['perfil-jurado', 'jurado3'],
  ])
    for (const size of [DESKTOP, PHONE, SIZES[4]])
      await capture(size, name, `/p/${user}`, { ready: '[data-producer-card]', wait: 3000 })
  // Con sesión: el HUD y el perfil propio (D para stories), y los logros con el cursor.
  for (const size of [DESKTOP, SIZES[2]])
    await capture(size, 'perfil-propio-logros', '/p/prod05', {
      account: 'prod05',
      ready: '[data-producer-card]',
      wait: 3000,
      full: true,
      run: async (page) => {
        const option = page.getByRole('option').first()
        await option.focus()
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(400)
      },
    })
}

// Los otros sitios de la carta plana: la bienvenida y la vista previa de Ajustes → Perfil (más pequeña que en el perfil).
if (groups.has('carta-usos'))
  for (const size of SIZES) {
    await capture(size, 'bienvenida', '/bienvenida', {
      account: 'prod05',
      ready: '[data-producer-card]',
      wait: 2500,
    })
    await capture(size, 'ajustes-perfil', '/ajustes/perfil', {
      account: 'prod05',
      ready: '[data-producer-card]',
    })
  }

if (groups.has('salon')) await everywhere('salon', '/salon-de-la-fama', { account: 'prod05' })

if (groups.has('temporada')) {
  await everywhere('temporada-cerrada', '/temporada/2026-T3', { account: 'prod05' })
  for (const size of [DESKTOP, PHONE, SIZES[4]])
    await capture(size, 'temporada-en-curso', '/temporada/2026-T4', { account: 'prod05' })
}

// Las imágenes OG del perfil (1200 × 630) de cada variante, tal cual las sirve la API.
if (groups.has('og'))
  for (const user of ['prod01', 'prod02', 'prod05', 'prod06', 'jurado3']) {
    const res = await fetch(`${origin}/api/og/profile/${user}.png`)
    writeFileSync(join(out, `og-perfil-${user}.png`), Buffer.from(await res.arrayBuffer()))
    console.log(`og-perfil-${user}: ${res.status}`)
  }

// Las tarjetas para *stories* del banco (1080 × 1920), pintadas por CPU.
if (groups.has('stories')) {
  const session = await open(DESKTOP)
  await session.page.goto(`${origin}/dev/carta`)
  for (const variant of ['standard', 'red', 'holo', 'champion']) {
    const img = session.page.locator(`img[data-story="${variant}"]`)
    await img.waitFor({ timeout: 20_000 })
    const src = await img.getAttribute('src')
    writeFileSync(join(out, `stories-${variant}.png`), Buffer.from(String(src).split(',')[1], 'base64'))
    console.log(`stories-${variant}`)
  }
  await done(session, 'stories')
}

await browser.close()
console.log(`Capturas en ${out}`)
