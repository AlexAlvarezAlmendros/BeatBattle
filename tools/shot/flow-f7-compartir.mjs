// Recorrido de «Mi carta de productor» para stories (tarea 7.28) contra la API con los datos de `seedBattle … season`
// (NODE_ENV=test): las cuatro tarjetas del banco `/dev/carta` guardadas como PNG de 1080 × 1920; el perfil propio a
// 1440 × 900 con «[D] Compartir mi carta», D que descarga el PNG (sin Web Share con ficheros en el Chrome de escritorio)
// y el aviso de «Altavoz»; y el perfil propio a 390 × 844 táctil. Uso:
//   node tools/shot/flow-f7-compartir.mjs <origen> <carpeta-de-capturas> [cuenta]
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const [origin = 'http://localhost:5184', out = '.', username = 'prod05'] = process.argv.slice(2)
const PASSWORD = 'lluvia en gràcia 92'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'],
})
const init = () => {
  localStorage.setItem('bb:title', 'off')
  localStorage.setItem('bb:quality', 'alta')
}

// 1. Las tarjetas del banco, tal cual las pinta el lienzo por CPU.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.addInitScript(init)
  await page.goto(`${origin}/dev/carta`)
  for (const variant of ['standard', 'red', 'holo', 'champion']) {
    const img = page.locator(`img[data-story="${variant}"]`)
    await img.waitFor({ timeout: 20_000 })
    const src = await img.getAttribute('src')
    const file = path.join(out, `stories-banco-${variant}.png`)
    await writeFile(file, Buffer.from(String(src).split(',')[1], 'base64'))
    console.log(file)
  }
  await page.close()
}

async function signedIn(options) {
  const context = await browser.newContext({ acceptDownloads: true, ...options })
  await context.addInitScript(init)
  const page = await context.newPage()
  const res = await page.request.post(`${origin}/api/auth/sign-in/email`, {
    data: { email: `${username}@example.com`, password: PASSWORD },
    headers: { origin },
  })
  if (!res.ok()) throw new Error(`entrar: ${res.status()} ${await res.text()}`)
  return { context, page }
}

// 2. El perfil propio a 1440 × 900: la carta con «[D] Compartir mi carta», D y el aviso del logro.
{
  const { context, page } = await signedIn({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${origin}/p/${username}`)
  await page.getByRole('button', { name: /Compartir mi carta/ }).waitFor()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(out, `perfil-propio-1440x900.png`) })
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    page.keyboard.press('d'),
  ])
  const file = path.join(out, `stories-${username}.png`)
  await download.saveAs(file)
  console.log('descarga:', download.suggestedFilename(), '→', file)
  await page.getByText('Altavoz').first().waitFor({ timeout: 10_000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(out, `perfil-propio-altavoz-1440x900.png`) })
  const me = await (await page.request.get(`${origin}/api/me`)).json()
  console.log('XP tras compartir:', me.data.game.xp)
  await context.close()
}

// 3. El perfil propio a 390 × 844 táctil (sin teclas a la vista: el botón).
{
  const { context, page } = await signedIn({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  await page.goto(`${origin}/p/${username}`)
  await page.getByRole('button', { name: /Compartir mi carta/ }).waitFor()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(out, `perfil-propio-390x844-tactil.png`) })
  await page.getByRole('button', { name: /Compartir mi carta/ }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(out, `perfil-propio-boton-390x844-tactil.png`) })
  await context.close()
}
await browser.close()
