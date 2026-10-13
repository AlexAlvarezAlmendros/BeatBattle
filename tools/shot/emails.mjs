#!/usr/bin/env node
/**
 * Capturas de la galería de emails (guía §4.19.4): abre cada HTML que deja
 * `packages/emails/scripts/gallery.tsx` a 600 px (escritorio) y a 390 px (móvil) y guarda la página entera.
 * Con una carpeta de ondas (`apps/server/src/scripts/emailWaveforms.ts`), la onda de los recibos de ejemplo
 * se sirve desde allí por su versión (`?v=`), y el QR del ejemplo, de `qr.png`, en vez de pedirlos a la web
 * de producción; la tarjeta de resultado, de `card.png`. Chrome va sin
 * suavizado LCD, para que no cuente como color fuera de la paleta (acta F3, M12; acta F4, M10).
 *
 *   node tools/shot/emails.mjs <carpeta-de-html> <carpeta-de-capturas> [carpeta-de-ondas]
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const [input, output, waveforms] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-lcd-text'] })
for (const file of (await readdir(input)).filter((f) => f.endsWith('.html') && f !== 'index.html')) {
  for (const width of [600, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } })
    if (waveforms)
      await page.route('**/api/email/waveform/*', (route) => {
        const version = new URL(route.request().url()).searchParams.get('v')
        return route.fulfill({ path: path.join(waveforms, `${version}.png`), contentType: 'image/png' })
      })
    if (waveforms)
      await page.route('**/api/email/qr/*', (route) =>
        route.fulfill({ path: path.join(waveforms, 'qr.png'), contentType: 'image/png' }),
      )
    // La tarjeta de resultado (6.10) de los ejemplos, de `card.png` (la pinta `media/resultCard`).
    if (waveforms)
      await page.route('**/api/og/result/**', (route) =>
        route.fulfill({ path: path.join(waveforms, 'card.png'), contentType: 'image/png' }),
      )
    await page.goto(`file://${path.resolve(input, file)}`)
    await page.waitForLoadState('networkidle')
    const name = `${file.replace('.html', '')}-${width}.png`
    await page.screenshot({ path: path.join(output, name), fullPage: true })
    await page.close()
    console.log(name)
  }
}
await browser.close()
