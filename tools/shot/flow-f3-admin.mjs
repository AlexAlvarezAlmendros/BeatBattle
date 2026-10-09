// Panel de admin (tarea 3.18, `RF-ADM-01`, `RF-ADM-02`) contra la API de prueba: una cuenta admin sube un
// sample (original y portada con la firma), marca 8 chops, los guarda y programa una semana en un hueco.
// Uso: node tools/shot/flow-f3-admin.mjs <origen> <carpeta> <bd-sqlite> <wav> <png>
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const [origin, out, db, wav, png] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript(() => sessionStorage.setItem('bb:title-seen', 'yes'))
const page = await context.newPage()
const suffix = Date.now().toString(36).slice(-5)
const email = `admin.${suffix}@example.com`
const username = `admin${suffix}`.replace('admin', 'jefa')
const ip = `198.51.100.${(Number.parseInt(suffix, 36) % 200) + 1}`
const signUp = await page.request.post(`${origin}/api/auth/sign-up/email`, {
  data: { email, password: 'lluvia en gràcia 92', name: username, username, callbackURL: '/verificar' },
  headers: { origin, 'x-forwarded-for': ip },
})
if (!signUp.ok()) throw new Error(`registro: ${signUp.status()} ${await signUp.text()}`)
execFileSync('python3', [
  '-c',
  `import sqlite3;c=sqlite3.connect('${db}');c.execute("update user set role='admin' where email=?",('${email}',));c.commit()`,
])
const mail = await (
  await page.request.get(`${origin}/api/test/mailbox?to=${encodeURIComponent(email)}`)
).json()
const link = JSON.stringify(mail).match(/https?:\/\/[^"\s\\]+verify-email\?[^"\s\\]+/)?.[0]
await page.goto(link.replace(/^https?:\/\/[^/]+/, origin))

await page.goto(`${origin}/admin`)
await page.waitForTimeout(1500)
await page.screenshot({ path: `${out}/admin-1440.png`, fullPage: true })
await page.getByRole('link', { name: 'Nuevo sample' }).click()
await page.waitForTimeout(800)
await page.locator('input[data-part="original"]').setInputFiles(wav)
await page.locator('input[data-part="cover"]').setInputFiles(png)
await page.getByText('Subido').nth(1).waitFor({ timeout: 15_000 })
await page.getByLabel('Título').fill('Bruma en El Carmen')
await page.getByLabel('Créditos').fill('Pads y bruma · Other People Sound Lab')
await page.getByLabel('Licencia de uso').fill('Uso libre dentro de la batalla.')
await page.getByLabel('BPM').fill('88')
await page.getByLabel('Tonalidad').selectOption('Em')
await page.screenshot({ path: `${out}/admin-sample-nuevo-1440.png`, fullPage: true })
await page.getByRole('button', { name: 'Crear el sample' }).click()
await page.getByRole('heading', { name: 'Chops del kit de la semana' }).waitFor({ timeout: 15_000 })
// Clic en la onda: el inicio del chop 3 al 50 %.
await page.getByRole('button', { name: 'Chop 3', exact: true }).click()
const wave = await page.locator('[class*="chopWave"]').boundingBox()
await page.mouse.click(wave.x + wave.width * 0.5, wave.y + wave.height / 2)
await page.getByRole('button', { name: 'Repartir en 8 iguales' }).click()
await page.getByRole('button', { name: 'Guardar los chops' }).click()
await page.getByText('Chops guardados.').waitFor()
await page.screenshot({ path: `${out}/admin-chops-1440.png`, fullPage: true })
await page.goto(`${origin}/admin`)
await page.waitForTimeout(1200)
await page.getByText('Programar una semana').waitFor({ timeout: 10_000 })
await page.screenshot({ path: `${out}/admin-antes-de-programar-1440.png`, fullPage: true })
await page.locator('select').nth(1).selectOption({ label: 'Bruma en El Carmen' })
await page.getByRole('button', { name: 'Programar la semana' }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${out}/admin-programada-1440.png`, fullPage: true })
const rows = await page.locator('tbody tr').allInnerTexts()
console.log(rows.slice(0, 6).join('\n'))
await browser.close()
