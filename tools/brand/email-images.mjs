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
 * Deja en `apps/web/public/img/email/` `logo@2x.png`, `otp-slap@2x.png` y `header@2x.png` (la cabecera
 * entera: la cuña granate con el logo y la pegatina), y sus medidas a 1× en
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
      /**
       * La cabecera entera (§3.8.12, jurado de la 2.25): la cuña granate con su diagonal roja y blanca, como
       * la arena, y encima el logo con la pegatina a su lado (el lockup «by OTP.»), sobre negro propio.
       * Los colores salen de los tokens de la web (`getComputedStyle`), nunca de números sueltos.
       */
      const header = (width) => {
        const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
        const scale = 2
        const logoW = logo.width
        const logoH = logo.height
        const slapW = slap.naturalWidth / 2
        const slapH = slap.naturalHeight / 2
        const canvas = document.createElement('canvas')
        canvas.width = width * scale
        canvas.height = logoH + 4 * pad * scale
        const ctx = canvas.getContext('2d')
        const h = canvas.height
        const w = canvas.width
        ctx.fillStyle = token('--bb-black')
        ctx.fillRect(0, 0, w, h)
        // La cuña: de la izquierda hasta la diagonal, que sube hacia la derecha (17° de la vertical).
        const slope = Math.tan((17 * Math.PI) / 180) * h
        const top = logoW + 4 * pad * scale + slapW + slope
        ctx.fillStyle = token('--bb-wine-2')
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(top, 0)
        ctx.lineTo(top - slope, h)
        ctx.lineTo(0, h)
        ctx.closePath()
        ctx.fill()
        // La diagonal: el trazo rojo y, a su lado, el blanco fino.
        const stroke = (color, offset, lineWidth) => {
          ctx.strokeStyle = color
          ctx.lineWidth = lineWidth
          ctx.beginPath()
          ctx.moveTo(top + offset, 0)
          ctx.lineTo(top - slope + offset, h)
          ctx.stroke()
        }
        stroke(token('--bb-red'), 4 * scale, 5 * scale)
        stroke(token('--bb-white'), 11 * scale, 1.5 * scale)
        // El logo y, al pie de su derecha, la pegatina (el lockup de la web).
        ctx.drawImage(logo, 2 * pad * scale, 2 * pad * scale, logoW, logoH)
        ctx.drawImage(slap, 2 * pad * scale + logoW + 2 * pad, h - 2 * pad * scale - slapH, slapW, slapH)
        return {
          data: canvas.toDataURL('image/png'),
          width: canvas.width / scale,
          height: canvas.height / scale,
        }
      }
      return {
        logo: onBlack(logo, logo.width, logo.height),
        slap: onBlack(slap, slap.naturalWidth, slap.naturalHeight),
        header: header(568),
      }
    },
    { pad: PAD, slapUrl },
  )
  await mkdir(OUT, { recursive: true })
  const manifest = {}
  for (const [name, image] of Object.entries(images)) {
    const file = { logo: 'logo@2x.png', slap: 'otp-slap@2x.png', header: 'header@2x.png' }[name]
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
