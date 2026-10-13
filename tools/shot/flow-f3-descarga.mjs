// Recorrido de la descarga del sample (tarea 3.16) contra la API de prueba (NODE_ENV=test, buzón en memoria):
// registro → verificación → ficha → «Pillar el sample» → bases → descarga. Uso:
//   node tools/shot/flow-f3-descarga.mjs <origen> <carpeta-de-capturas> <slug>
import { chromium } from '@playwright/test'

const [origin = 'http://localhost:5174', out = '.', slug = '2026-w41'] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
await context.addInitScript(() => sessionStorage.setItem('bb:title-seen', 'yes'))
const page = await context.newPage()
const suffix = Date.now().toString(36).slice(-5)
const email = `ficha.${suffix}@example.com`
const username = `ficha${suffix}`
const ip = `198.51.100.${(Number.parseInt(suffix, 36) % 200) + 1}`
const api = (path, body) =>
  page.request.post(`${origin}${path}`, { data: body, headers: { origin, 'x-forwarded-for': ip } })

const signUp = await api('/api/auth/sign-up/email', {
  email,
  password: 'lluvia en gràcia 92',
  name: username,
  username,
  callbackURL: '/verificar',
})
if (!signUp.ok()) throw new Error(`registro: ${signUp.status()} ${await signUp.text()}`)
const mail = await (
  await page.request.get(`${origin}/api/test/mailbox?to=${encodeURIComponent(email)}`)
).json()
const link = JSON.stringify(mail).match(/https?:\/\/[^"\s\\]+verify-email\?[^"\s\\]+/)?.[0]
if (!link) throw new Error('sin enlace de verificación')
await page.goto(link.replace(/^https?:\/\/[^/]+/, origin))
await page.goto(`${origin}/semana/${slug}`)
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Pillar el sample' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/bases-1440.png` })
await page.getByRole('button', { name: 'Aceptar y descargar' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/bases-falta-casilla-1440.png` })
await page.getByRole('button', { name: /Acepto las bases/ }).click()
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 10_000 }),
  page.getByRole('button', { name: 'Aceptar y descargar' }).click(),
])
console.log('descarga:', download.suggestedFilename())
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/descarga-1440.png` })
// La segunda vez ya no pide las bases.
const [again] = await Promise.all([
  page.waitForEvent('download', { timeout: 10_000 }),
  page.getByRole('button', { name: 'Pillar el sample' }).click(),
])
console.log('segunda descarga sin modal:', again.suggestedFilename())
await browser.close()
