#!/usr/bin/env node
/**
 * Imágenes de la cabecera de los emails (guía §3.8.12, tarea 2.13): el **logo del juego** (con su
 * extrusión, como imagen para que sobreviva a cualquier cliente) y la **pegatina OTP**, las dos sobre
 * **fondo negro propio**: un cliente que invierte colores en modo oscuro no las rompe (§3.8.12).
 *
 * El logo sale del `GameLogo` real de la web (el mismo canvas que pinta el menú), así que necesita el
 * servidor de desarrollo (`pnpm dev`). Se pinta a 2× del ancho con el que lo enseña el email:
 *
 *   node tools/brand/email-images.mjs [http://localhost:5173]
 *
 * Deja en `apps/web/public/img/email/` `logo@2x.png` y `otp-slap@2x.png`, y sus medidas a 1× en
 * `packages/emails/src/images.json` (las usa la cabecera para el `width`/`height` de cada `<img>`). Las
 * imágenes se commitean: la build y la CI no necesitan Chrome.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = path.join(ROOT, 'apps/web/public/img/email')
const MANIFEST = path.join(ROOT, 'packages/emails/src/images.json')
const BASE = process.argv[2] ?? 'http://localhost:5173'

/** Ancho a 1× del logo en la cabecera de 600 px, y el margen negro alrededor (px a 1×). */
const LOGO_WIDTH = 280
const PAD = 8

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.addInitScript(() => localStorage.setItem('bb:title', 'off'))
  await page.goto(`${BASE}/dev/menu`)
  await page.waitForSelector('[data-game-logo="full"] canvas')
  // El logo, a su ancho del email: el `ResizeObserver` del componente lo repinta a 2×.
  await page.evaluate((width) => {
    const host = document.querySelector('[data-game-logo="full"]')
    host.style.width = `${width}px`
    host.style.maxWidth = 'none'
  }, LOGO_WIDTH)
  await page.waitForFunction(
    (width) => document.querySelector('[data-game-logo="full"] canvas')?.width === width * 2,
    LOGO_WIDTH,
    { timeout: 10_000 },
  )
  const slapUrl = `data:image/png;base64,${(await readFile(path.join(ROOT, 'apps/web/public/img/otp-slap@2x.png'))).toString('base64')}`
  const images = await page.evaluate(
    async ({ pad, slapUrl }) => {
      /** Copia una imagen sobre negro con margen; devuelve el PNG y su tamaño a 1×. */
      const onBlack = (source, w, h) => {
        const canvas = document.createElement('canvas')
        canvas.width = w + 4 * pad
        canvas.height = h + 4 * pad
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(source, 2 * pad, 2 * pad, w, h)
        return { data: canvas.toDataURL('image/png'), width: canvas.width / 2, height: canvas.height / 2 }
      }
      const logo = document.querySelector('[data-game-logo="full"] canvas')
      const slap = new Image()
      slap.src = slapUrl
      await slap.decode()
      return {
        logo: onBlack(logo, logo.width, logo.height),
        slap: onBlack(slap, slap.naturalWidth, slap.naturalHeight),
      }
    },
    { pad: PAD, slapUrl },
  )
  await mkdir(OUT, { recursive: true })
  const manifest = {}
  for (const [name, image] of Object.entries(images)) {
    const file = name === 'logo' ? 'logo@2x.png' : 'otp-slap@2x.png'
    await writeFile(path.join(OUT, file), Buffer.from(image.data.split(',')[1], 'base64'))
    manifest[name] = {
      path: `/img/email/${file}`,
      width: Math.round(image.width),
      height: Math.round(image.height),
    }
    console.log(`${file}: ${manifest[name].width}×${manifest[name].height} a 1×`)
  }
  await writeFile(
    MANIFEST,
    `${JSON.stringify({ $comment: 'Generado por tools/brand/email-images.mjs: no se edita a mano.', ...manifest }, null, 2)}\n`,
  )
} finally {
  await browser.close()
}
