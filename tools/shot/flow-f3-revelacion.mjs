// Revelación del drop (tarea 3.17): capturas a lo largo de su línea de tiempo, y la variante sin
// movimiento. Uso: node tools/shot/flow-f3-revelacion.mjs <origen> <carpeta> [--mobile]
import { chromium } from '@playwright/test'

const [origin = 'http://localhost:5176', out = '.'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const mobile = process.argv.includes('--mobile')
const size = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
const tag = mobile ? '390' : '1440'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'],
})
for (const reduced of [false, true]) {
  const context = await browser.newContext({
    viewport: size,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  })
  await context.addInitScript(() => sessionStorage.setItem('bb:title-seen', 'yes'))
  const page = await context.newPage()
  await page.goto(`${origin}/`)
  const start = Date.now()
  const marks = reduced ? [800] : [500, 1300, 2300, 3000, 4400]
  for (const ms of marks) {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - start)))
    await page.screenshot({ path: `${out}/revelacion${reduced ? '-sin-movimiento' : ''}-${ms}-${tag}.png` })
  }
  await page.waitForTimeout(reduced ? 2500 : 2200)
  const still = await page.locator('[aria-label^="Nuevo escenario"]').count()
  console.log(reduced ? 'sin movimiento' : 'con movimiento', '· revelación abierta al final:', still)
  await page.reload()
  await page.waitForTimeout(1500)
  console.log('  tras recargar (ya vista):', await page.locator('[aria-label^="Nuevo escenario"]').count())
  await context.close()
}
await browser.close()
