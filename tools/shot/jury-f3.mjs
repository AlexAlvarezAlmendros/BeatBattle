// Capturas del jurado visual de la Fase 3 (tarea 3.21) contra una API de prueba con el seed de semanas
// (`seed:weeks`) y el buzón en memoria. Uso: node tools/shot/jury-f3.mjs <origen> <carpeta> <bd-sqlite>
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const [origin = 'http://localhost:5176', out = '.', db] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const SIZES = {
  1440: { width: 1440, height: 900 },
  1280: { width: 1280, height: 720 },
  1366: { width: 1366, height: 657 },
  1024: { width: 1024, height: 768 },
  390: { width: 390, height: 844, touch: true },
  320: { width: 320, height: 568, touch: true },
}
/** Después de la última semana del seed: el calendario está vacío. */
const EMPTY_AT = Date.UTC(2027, 5, 1, 12)

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-lcd-text'],
})

async function context(
  size,
  { title = false, reduced = false, forced = false, now = null, seen = true } = {},
) {
  const s = SIZES[size]
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    isMobile: Boolean(s.touch),
    hasTouch: Boolean(s.touch),
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    forcedColors: forced ? 'active' : 'none',
  })
  await ctx.addInitScript(
    ({ title, seen }) => {
      if (!title) sessionStorage.setItem('bb:title-seen', 'yes')
      if (seen)
        for (const slug of ['2026-w41', '2026-w42', '2026-w43', '2026-w44'])
          localStorage.setItem(`bb:drop-seen:${slug}`, 'yes')
    },
    { title, seen },
  )
  if (now !== null)
    await ctx.route('**/api/**', (route) =>
      route.continue({ headers: { ...route.request().headers(), 'x-bb-test-now': String(now) } }),
    )
  return ctx
}

async function shot(name, size, path, options = {}, prepare = null) {
  const ctx = await context(size, options)
  const page = await ctx.newPage()
  await page.goto(`${origin}${path}`)
  await page.waitForTimeout(options.wait ?? 2200)
  if (prepare) await prepare(page)
  await page.screenshot({ path: `${out}/${name}-${size}.png` })
  await ctx.close()
}

async function account(ctx, admin = false) {
  const page = await ctx.newPage()
  const suffix = Math.random().toString(36).slice(2, 7)
  const email = `jurado.${suffix}@example.com`
  const username = `jurado${suffix}`
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`
  await page.request.post(`${origin}/api/auth/sign-up/email`, {
    data: { email, password: 'lluvia en gràcia 92', name: username, username, callbackURL: '/' },
    headers: { origin, 'x-forwarded-for': ip },
  })
  if (admin && db)
    execFileSync('python3', [
      '-c',
      `import sqlite3;c=sqlite3.connect('${db}');c.execute("update user set role='admin' where email=?",('${email}',));c.commit()`,
    ])
  const mail = await (
    await page.request.get(`${origin}/api/test/mailbox?to=${encodeURIComponent(email)}`)
  ).json()
  const link = JSON.stringify(mail).match(/https?:\/\/[^"\s\\]+verify-email\?[^"\s\\]+/)?.[0]
  await page.request.get(link.replace(/^https?:\/\/[^/]+/, origin))
  return { page, email }
}

for (const size of [1440, 1366, 1024, 390, 320]) {
  await shot('menu', size, '/')
  await shot('ficha', size, '/semana/2026-w41')
}
for (const size of [1440, 1024, 390, 320]) {
  await shot('titulo', size, '/', { title: true })
  await shot('vacio', size, '/', { now: EMPTY_AT })
}
for (const size of [1440, 1024, 390]) {
  await shot('revelacion', size, '/', { seen: false, wait: 3300 })
}
for (const size of [1440, 390]) {
  await shot('alerta', size, '/alerta?token=jurado-token-de-prueba-123')
  await shot('como-funciona', size, '/como-funciona', {}, (page) =>
    page
      .getByText('Avísame del próximo drop')
      .last()
      .scrollIntoViewIfNeeded({ timeout: 2000 })
      .catch(() => {}),
  )
  await shot('revelacion-sin-movimiento', size, '/', { seen: false, reduced: true, wait: 900 })
  // Con sesión: el modal de las bases.
  const ctx = await context(size)
  const { page } = await account(ctx)
  await page.goto(`${origin}/semana/2026-w41`)
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Pillar el sample' }).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/bases-${size}.png` })
  await ctx.close()
}
await shot('menu-contraste', 1440, '/', { forced: true })
await shot('ficha-contraste', 1440, '/semana/2026-w41', { forced: true })
await shot('vacio-contraste', 1440, '/', { forced: true, now: EMPTY_AT })
await shot('revelacion-contraste', 1440, '/', { forced: true, seen: false, wait: 3300 })
for (const size of [1440, 1024, 390]) {
  const ctx = await context(size)
  const { page } = await account(ctx, true)
  await page.goto(`${origin}/admin`)
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${out}/admin-${size}.png` })
  const edit = page.getByRole('link', { name: /^Editar/ }).first()
  await edit.click()
  await page.waitForTimeout(1500)
  await page.getByRole('region', { name: 'Chops del kit de la semana' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/admin-chops-${size}.png` })
  if (size === 1440) {
    // Un chop inválido: lo que no es un número se dice en la fila.
    const field = page.getByLabel('Inicio (s)').first()
    await field.fill('abc')
    await field.blur()
    await page.getByRole('button', { name: 'Guardar los chops' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${out}/admin-chops-invalido-${size}.png` })
  }
  await ctx.close()
}
// Sexto pase: la revelación en tira (no vuelve a empezar), el menú mientras carga la semana y el título largo.
{
  const ctx = await context(1440, { seen: false })
  const page = await ctx.newPage()
  await page.goto(`${origin}/`)
  const start = Date.now()
  for (const at of [500, 1300, 2300, 3000, 3600, 4400, 5500]) {
    await page.waitForTimeout(Math.max(0, at - (Date.now() - start)))
    await page.screenshot({ path: `${out}/revelacion-tira-${at}-1440.png` })
  }
  await ctx.close()
}
for (const size of [1440, 390]) {
  const ctx = await context(size)
  await ctx.route('**/api/weeks/current', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    await route.continue()
  })
  const page = await ctx.newPage()
  await page.goto(`${origin}/`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}/menu-cargando-${size}.png` })
  await ctx.close()
}
await shot('menu-largo', 1440, '/dev/menu?largo')
await shot('menu-largo', 1280, '/dev/menu?largo')
await browser.close()
console.log('capturas en', out)
