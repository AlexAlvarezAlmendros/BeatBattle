#!/usr/bin/env node
/**
 * Capturas de la galería de emails (guía §4.19.4): abre cada HTML que deja
 * `packages/emails/scripts/gallery.tsx` a 600 px (escritorio) y a 390 px (móvil) y guarda la página entera.
 *
 *   node tools/shot/emails.mjs <carpeta-de-html> <carpeta-de-capturas>
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const [input, output] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome' })
for (const file of (await readdir(input)).filter((f) => f.endsWith('.html') && f !== 'index.html')) {
  for (const width of [600, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } })
    await page.goto(`file://${path.resolve(input, file)}`)
    await page.waitForLoadState('networkidle')
    const name = `${file.replace('.html', '')}-${width}.png`
    await page.screenshot({ path: path.join(output, name), fullPage: true })
    await page.close()
    console.log(name)
  }
}
await browser.close()
