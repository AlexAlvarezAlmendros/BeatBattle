import { readFileSync } from 'node:fs'
import { expect, type Locator, test } from '@playwright/test'
import { open } from './support'

/**
 * Página interior y pie contra el sello (tareas 0.7 y 0.14, `RD-VIS-02`), a 1440 × 900 y a 390 × 844:
 * el título de una página interior se compara con el de `/beats` medido en `otp-metrics.json`, y el
 * pie, con la maqueta del pie del sello (títulos centrados y tarjetas de la misma altura). El alto del
 * título no se compara: lo marca la fuente (el sello pinta Liberation Sans porque no carga Montserrat).
 */

interface OtpPageTitle {
  rect: { x: number; y: number }
  fontSize: number
  fontWeight: string
  letterSpacing: string
  textTransform: string
}

const metrics = JSON.parse(
  readFileSync(new URL('../../docs/planning/evidence/f0/otp/otp-metrics.json', import.meta.url), 'utf8'),
) as { viewports: Record<'desktop' | 'mobile', { beats: { pageTitle: OtpPageTitle } }> }

const read = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return {
      x: rect.x,
      y: rect.y,
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
      textTransform: style.textTransform,
      textAlign: style.textAlign,
    }
  })

for (const viewport of ['desktop', 'mobile'] as const) {
  test.describe(viewport === 'desktop' ? 'escritorio (1440 × 900)' : 'móvil (390 × 844)', () => {
    if (viewport === 'mobile') test.use({ viewport: { width: 390, height: 844 } })

    test(`RD-VIS-02: el título de la página interior es el de /beats del sello (${viewport})`, async ({
      page,
    }) => {
      await open(page, '/como-funciona', 'Cómo funciona')
      const otp = metrics.viewports[viewport].beats.pageTitle
      const title = await read(page.getByRole('main').getByRole('heading', { level: 1 }))
      expect(title.fontSize).toBe(otp.fontSize)
      expect(title.fontWeight).toBe(otp.fontWeight)
      expect(title.letterSpacing).toBe(otp.letterSpacing)
      expect(title.textTransform).toBe(otp.textTransform)
      // Centrado, como todo lo que va en el `.container` del sello (`text-align: center`).
      expect(title.textAlign).toBe('center')
      // A 32 px del borde y a 32 px por debajo de la isla, como en el sello.
      expect(title.x).toBe(otp.rect.x)
      expect(title.y).toBe(otp.rect.y)
    })

    test(`RD-VIS-02: el pie centra los títulos de las tarjetas y las estira a la misma altura (${viewport})`, async ({
      page,
    }) => {
      await open(page, '/como-funciona', 'Cómo funciona')
      const footer = page.getByRole('contentinfo')
      const cards = footer.locator('.site-footer__card')
      await expect(cards).toHaveCount(2)
      for (const title of await footer.locator('.site-footer__card-title').all()) {
        expect(await title.evaluate((element) => getComputedStyle(element).textAlign)).toBe('center')
      }
      const boxes = await cards.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect()),
      )
      const [first, second] = boxes
      // En escritorio van en la misma fila y miden lo mismo; en móvil, una por fila.
      if (viewport === 'desktop') {
        expect(second!.y).toBe(first!.y)
        expect(second!.height).toBe(first!.height)
      } else {
        expect(second!.y).toBeGreaterThan(first!.y + first!.height)
      }
    })
  })
}
