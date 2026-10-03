#!/usr/bin/env node
/**
 * Pegatina OTP («slap», guía §3.1 «La firma» y §3.3 «Pegatina OTP»): genera la imagen de la firma a
 * partir del logo del sello (`apps/web/public/img/otp-logo.webp`, blanco con contorno negro) con un
 * borde de corte rojo de 4 px (`--bb-red`) y una sombra dura (sin desenfoque, negra al 60 %, la tinta
 * de `--bb-shadow-drop`), en WebP y PNG a 1× y 2×. El logo no se recolorea ni se deforma; el giro de
 * −7° lo pone el componente (`--bb-tilt-sticker`), no la imagen.
 *
 * Se pinta en un canvas 2D del Chrome del sistema (Playwright, como `tools/shot`): el borde es la
 * silueta del logo dilatada un disco de 4 px (unión de la silueta desplazada a todos los puntos del
 * disco), y la sombra, esa misma silueta desplazada (3, 3) px y en negro.
 *
 * Las imágenes y su manifiesto (`apps/web/src/ui/OtpSlap/otp-slap.json`, con el tamaño a 1× que usa
 * el componente para reservar el hueco) se commitean: la build y la CI no necesitan Chrome. Si cambia
 * el logo o estos parámetros, se regeneran con:
 *
 *   node tools/brand/otp-slap.mjs        (o `pnpm brand:slap`)
 *
 * El test `OtpSlap.test.tsx` comprueba que los ficheros existen, que su tamaño es el del manifiesto y
 * que el borde es rojo de marca.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { color } from '../../packages/shared/src/tokens.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const LOGO = path.join(ROOT, 'apps/web/public/img/otp-logo.webp')
const OUT_DIR = path.join(ROOT, 'apps/web/public/img')
const MANIFEST = path.join(ROOT, 'apps/web/src/ui/OtpSlap/otp-slap.json')

/** Parámetros de la pegatina a 1× (px CSS). */
export const SLAP = {
  /** Ancho total a 1×: el de la pegatina más grande (lockup de la pantalla de título, §3.1). */
  width: 120,
  /** Borde de corte rojo (§3.1: 4 px). */
  cut: 4,
  /** Sombra dura: desplazamiento (los de `--bb-shadow-hard-sm`) y tinta (la de `--bb-shadow-drop`). */
  shadowX: 3,
  shadowY: 3,
  shadowInk: 'rgba(0, 0, 0, 0.6)',
  cutInk: color.red,
}

const logoBytes = await readFile(LOGO)
const logoUrl = `data:image/webp;base64,${logoBytes.toString('base64')}`

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><html><body></body></html>')
  const result = await page.evaluate(
    async ({ logoUrl, slap, scales }) => {
      const image = new Image()
      image.src = logoUrl
      await image.decode()
      const ratio = image.naturalHeight / image.naturalWidth
      const logoW = slap.width - 2 * slap.cut - slap.shadowX
      const logoH = logoW * ratio
      const width = slap.width
      const height = Math.ceil(logoH + 2 * slap.cut + slap.shadowY)

      const canvasOf = (w, h) => {
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        return canvas
      }
      const out = {}
      for (const scale of scales) {
        const W = width * scale
        const H = height * scale
        const r = slap.cut * scale
        // 1. Silueta del logo (opaca donde el logo lo es).
        const silhouette = canvasOf(W, H)
        const s = silhouette.getContext('2d')
        s.drawImage(image, r, r, logoW * scale, logoH * scale)
        s.globalCompositeOperation = 'source-in'
        s.fillStyle = slap.cutInk
        s.fillRect(0, 0, W, H)
        // 2. Dilatación por un disco de radio r: la silueta en cada punto entero del disco y en su borde.
        const cut = canvasOf(W, H)
        const c = cut.getContext('2d')
        for (let dy = -r; dy <= r; dy += 1) {
          for (let dx = -r; dx <= r; dx += 1) {
            if (dx * dx + dy * dy <= r * r) c.drawImage(silhouette, dx, dy)
          }
        }
        for (let angle = 0; angle < 360; angle += 3) {
          const a = (angle * Math.PI) / 180
          c.drawImage(silhouette, r * Math.cos(a), r * Math.sin(a))
        }
        // 3. Sombra dura: la misma silueta dilatada, en negro y desplazada.
        const shadow = canvasOf(W, H)
        const h = shadow.getContext('2d')
        h.drawImage(cut, 0, 0)
        h.globalCompositeOperation = 'source-in'
        h.fillStyle = slap.shadowInk
        h.fillRect(0, 0, W, H)
        // 4. Composición: sombra, borde de corte y logo.
        const sticker = canvasOf(W, H)
        const k = sticker.getContext('2d')
        k.drawImage(shadow, slap.shadowX * scale, slap.shadowY * scale)
        k.drawImage(cut, 0, 0)
        k.drawImage(image, r, r, logoW * scale, logoH * scale)
        out[scale] = {
          png: sticker.toDataURL('image/png'),
          webp: sticker.toDataURL('image/webp', 0.92),
          width: W,
          height: H,
        }
      }
      return { width, height, out }
    },
    { logoUrl, slap: SLAP, scales: [1, 2] },
  )

  const files = []
  for (const [scale, image] of Object.entries(result.out)) {
    const suffix = scale === '1' ? '' : `@${scale}x`
    for (const format of ['png', 'webp']) {
      const name = `otp-slap${suffix}.${format}`
      const data = image[format].replace(/^data:image\/\w+;base64,/, '')
      await writeFile(path.join(OUT_DIR, name), Buffer.from(data, 'base64'))
      files.push(name)
      console.log(`${name}  ${image.width}×${image.height}`)
    }
  }
  const manifest = {
    $comment: 'Generado por tools/brand/otp-slap.mjs: no se edita a mano.',
    width: result.width,
    height: result.height,
    cut: SLAP.cut,
    shadow: [SLAP.shadowX, SLAP.shadowY],
    files,
  }
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`otp-slap.json  ${result.width}×${result.height} a 1×`)
} finally {
  await browser.close()
}
