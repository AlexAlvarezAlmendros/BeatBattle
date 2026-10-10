// Recorrido de `/subir` (tarea 4.14) contra una API de prueba con el seed de semanas: entra con una cuenta
// verificada, acepta las bases, suelta un WAV generado (140 BPM, La menor) y captura la ranura, el análisis
// girando y el resultado fijado. Uso: node tools/shot/flow-f4-subir.mjs <origen> <carpeta> [ancho]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const [origin = 'http://localhost:5176', out = '.', width = '1440'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const touch = Number(width) < 700

/** WAV mono de 16 bits: bombo a `bpm` y un acorde de La menor (A3, C4, E4), `seconds` segundos. */
function beatWav({ seconds = 36, bpm = 140, rate = 22_050 } = {}) {
  const n = seconds * rate
  const data = Buffer.alloc(n * 2)
  const beat = Math.round((60 / bpm) * rate)
  const chord = [220, 261.63, 329.63]
  for (let i = 0; i < n; i++) {
    const sinceBeat = i % beat
    const kick =
      sinceBeat < rate * 0.12
        ? Math.sin(2 * Math.PI * (60 - sinceBeat / 80) * (sinceBeat / rate)) *
          Math.exp(-sinceBeat / (rate * 0.04))
        : 0
    const pad = chord.reduce((sum, f) => sum + Math.sin((2 * Math.PI * f * i) / rate), 0) / chord.length
    const value = Math.max(-1, Math.min(1, 0.6 * kick + 0.25 * pad))
    data.writeInt16LE(Math.round(value * 32767), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const wavPath = join(out, 'beat-140-am.wav')
writeFileSync(wavPath, beatWav())

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-lcd-text'],
})
const ctx = await browser.newContext({
  viewport: touch ? { width: Number(width), height: 844 } : { width: Number(width), height: 900 },
  isMobile: touch,
  hasTouch: touch,
})
await ctx.addInitScript(() => {
  sessionStorage.setItem('bb:title-seen', 'yes')
  for (const slug of ['2026-w41', '2026-w42', '2026-w43']) localStorage.setItem(`bb:drop-seen:${slug}`, 'yes')
})
const page = await ctx.newPage()
const suffix = Math.random().toString(36).slice(2, 7)
const email = `subir.${suffix}@example.com`
const username = `subir${suffix}`
await page.request.post(`${origin}/api/auth/sign-up/email`, {
  data: { email, password: 'lluvia en gràcia 92', name: username, username, callbackURL: '/' },
  headers: { origin, 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200) + 1}` },
})
const mail = await (
  await page.request.get(`${origin}/api/test/mailbox?to=${encodeURIComponent(email)}`)
).json()
const link = JSON.stringify(mail).match(/https?:\/\/[^"\s\\]+verify-email\?[^"\s\\]+/)?.[0]
await page.request.get(link.replace(/^https?:\/\/[^/]+/, origin))

const shot = (name) => page.screenshot({ path: join(out, `${name}-${width}.png`) })
await page.goto(`${origin}/subir`)
await page.waitForTimeout(1800)
await shot('subir-bases')
await page.getByRole('button', { name: 'Leer las bases' }).click()
await page.waitForTimeout(500)
await page.getByText(/Acepto las bases/).click()
await page.getByRole('button', { name: /Aceptar las bases/ }).click()
await page.waitForTimeout(1200)
await shot('subir-ranura')
await page.locator('input[type="file"]').setInputFiles(wavPath)
await page.waitForTimeout(350)
await shot('subir-analizando')
await page
  .getByText('BPM y tonalidad sugeridos')
  .or(page.getByText('No hemos podido sugerir'))
  .waitFor({ timeout: 60_000 })
await page.waitForTimeout(400)
await shot('subir-analizado')
console.log('chips:', await page.locator('[class*="chips"]').last().innerText())
await browser.close()
