// Capturas del jurado visual de la Fase 4 (tarea 4.20) contra la API de prueba con el seed de semanas:
// `/subir` en cada tamaño (bases, ranura, análisis, hoja, medidor, celebración, edición y retirada, con el
// recorrido de `flow-f4-subir.mjs`), los errores (un fichero que no es audio, uno demasiado largo), sin
// movimiento y en contraste alto, y el banco de portadas. Uso:
//   node tools/shot/jury-f4.mjs <origen> <carpeta>
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const [origin = 'http://localhost:5176', out = '.'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const here = new URL('.', import.meta.url).pathname

// El recorrido completo en cada tamaño (crea su cuenta, sube, edita y retira).
for (const width of ['1440', '1366', '1024', '390', '320']) {
  execFileSync('node', [join(here, 'flow-f4-subir.mjs'), origin, out, width, '1'], { stdio: 'inherit' })
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-lcd-text'],
})

async function account(page) {
  const suffix = Math.random().toString(36).slice(2, 7)
  const email = `jurado4.${suffix}@example.com`
  const username = `jurado4${suffix}`
  await page.request.post(`${origin}/api/auth/sign-up/email`, {
    data: { email, password: 'lluvia en gràcia 92', name: username, username, callbackURL: '/' },
    headers: { origin, 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200) + 1}` },
  })
  const mail = await (
    await page.request.get(`${origin}/api/test/mailbox?to=${encodeURIComponent(email)}`)
  ).json()
  const link = JSON.stringify(mail).match(/https?:\/\/[^"\s\\]+verify-email\?[^"\s\\]+/)?.[0]
  await page.request.get(link.replace(/^https?:\/\/[^/]+/, origin))
  // Las bases, por la API (lo que se juzga aquí es la ranura).
  const current = await (await page.request.get(`${origin}/api/weeks/current`)).json()
  await page.request.post(`${origin}/api/weeks/${current.data.week.slug}/rules`, {
    data: { rulesVersion: 1 },
    headers: { origin },
  })
}

async function slot(
  name,
  { width = 1440, height = 900, touch = false, reduced = false, forced = false } = {},
  act,
) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: touch,
    hasTouch: touch,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    forcedColors: forced ? 'active' : 'none',
  })
  await ctx.addInitScript(() => sessionStorage.setItem('bb:title-seen', 'yes'))
  const page = await ctx.newPage()
  await account(page)
  await page.goto(`${origin}/subir`)
  await page.getByRole('region', { name: 'Inserta tu beat' }).waitFor({ timeout: 15_000 })
  if (act) await act(page)
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(out, `${name}-${width}.png`) })
  await ctx.close()
}

const notAudio = join(out, 'no-es-audio.txt')
writeFileSync(notAudio, 'esto no es un beat')
await slot('error-formato', {}, (page) => page.locator('input[type="file"]').first().setInputFiles(notAudio))
await slot('error-formato', { width: 390, height: 844, touch: true }, (page) =>
  page.locator('input[type="file"]').first().setInputFiles(notAudio),
)
await slot('ranura-contraste', { forced: true })
await slot('ranura-sin-movimiento', { reduced: true })
await slot('foco-teclado', {}, (page) => page.keyboard.press('Tab'))

// El banco de portadas (RD-VIS-04).
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${origin}/dev/portadas`)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(out, 'portadas-1440.png') })
  await ctx.close()
}
await browser.close()
console.log('capturas en', out)
