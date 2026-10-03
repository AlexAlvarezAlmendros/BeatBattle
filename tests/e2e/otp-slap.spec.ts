import { expect, type Page, test } from '@playwright/test'
import { open } from './support'

/**
 * Pegatina OTP (`RD-VIS-02` a, guía §3.1 «La firma» y §3.3; tarea 0.28, segundo pase del jurado): el
 * borde de corte es el rojo de marca exacto en lo que pinta el navegador. Se decodifica en un canvas 2D
 * por CPU la imagen que elige el `<picture>` de la firma (la WebP, a 1× y a 2×) y las PNG de reserva:
 *
 * - todo píxel opaco con r = 255 y g = 0 es rgb(255, 0, 60) (`--bb-red`);
 * - el resto de la arista negro–rojo (g = 0: el contorno del logo fundido con el borde) tiene el azul
 *   a 60/255 del rojo (±1 por el redondeo);
 * - el borde existe: es más del 10 % de los píxeles opacos.
 *
 * La captura de pantalla no sirve para esto: la pegatina va girada −7° y escalada, y el remuestreo
 * mezcla el borde con lo que tiene al lado.
 */

const RED = [255, 0, 60] as const

interface SlapStats {
  opaque: number
  red: number
  /** Colores opacos fuera del rojo exacto o de la arista negro–rojo, con cuántos píxeles. */
  off: [string, number][]
}

function slapStats(page: Page, src: string): Promise<SlapStats> {
  return page.evaluate(
    async ({ src, red }) => {
      const image = new Image()
      image.src = src
      await image.decode()
      const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(image, 0, 0)
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let opaque = 0
      let exact = 0
      const off = new Map<string, number>()
      for (let i = 0; i < px.length; i += 4) {
        const [r, g, b, a] = [px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!]
        if (a !== 255) continue
        opaque += 1
        if (r === red[0] && g === red[1] && b === red[2]) exact += 1
        else if (g === 0 && (r === 255 || Math.abs(b - (red[2] * r) / 255) > 1)) {
          const key = `rgb(${r}, ${g}, ${b})`
          off.set(key, (off.get(key) ?? 0) + 1)
        }
      }
      return { opaque, red: exact, off: [...off].sort((x, y) => y[1] - x[1]) }
    },
    { src, red: RED },
  )
}

function expectExactCut(stats: SlapStats, name: string) {
  expect(stats.off, name).toEqual([])
  expect(stats.red / stats.opaque, name).toBeGreaterThan(0.1)
}

for (const scale of [1, 2]) {
  test.describe(`densidad ${scale}×`, () => {
    test.use({ deviceScaleFactor: scale })

    test(`RD-VIS-02 a: la pegatina que pinta el navegador a ${scale}× tiene el borde en --bb-red exacto`, async ({
      page,
    }) => {
      await open(page, '/', 'Beat Battle')
      const image = page.locator('[data-otp-signature] img').first()
      await expect(image).toBeVisible()
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete)).toBe(true)
      const src = await image.evaluate((img: HTMLImageElement) => img.currentSrc)
      expect(src).toMatch(scale === 1 ? /\/img\/otp-slap\.webp$/ : /\/img\/otp-slap@2x\.webp$/)
      expectExactCut(await slapStats(page, src), src)
    })
  })
}

test('RD-VIS-02 a: las PNG de reserva de la pegatina tienen el borde en --bb-red exacto', async ({
  page,
}) => {
  await open(page, '/', 'Beat Battle')
  for (const file of ['/img/otp-slap.png', '/img/otp-slap@2x.png']) {
    expectExactCut(await slapStats(page, file), file)
  }
})
