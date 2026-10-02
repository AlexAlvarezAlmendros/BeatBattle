import { readFileSync } from 'node:fs'
import { expect, type Locator, test } from '@playwright/test'
import { open } from './support'

/**
 * Botones del hero de la home (tareas 0.7 y 0.8, `RD-VIS-02`): son el `Button` base en su tamaño
 * `hero` y tienen que medir lo que el CTA del hero del sello (`docs/planning/evidence/f0/otp/`), a
 * 1440 × 900 y a 390 × 844. El alto no se compara: lo marca la fuente (el sello pinta Liberation Sans
 * porque no carga Montserrat; ver el README de la evidencia de la 0.7).
 */

interface OtpButton {
  rect: { width: number }
  fontSize: number
  fontWeight: string
  letterSpacing: string
  padding: string
  borderRadius: string
  boxShadow: string
  border: string
  backgroundColor: string
}

const metrics = JSON.parse(
  readFileSync(new URL('../../docs/planning/evidence/f0/otp/otp-metrics.json', import.meta.url), 'utf8'),
) as { viewports: Record<'desktop' | 'mobile', { home: { ctaPrimary: OtpButton; ctaGhost: OtpButton } }> }

const read = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      width: element.getBoundingClientRect().width,
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
      padding: style.padding,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      border: style.border,
      backgroundColor: style.backgroundColor,
    }
  })

for (const viewport of ['desktop', 'mobile'] as const) {
  test(`RD-VIS-02: los botones del hero miden lo del sello (${viewport})`, async ({ page }) => {
    if (viewport === 'mobile') await page.setViewportSize({ width: 390, height: 844 })
    await open(page, '/', 'Beat Battle')
    const otp = metrics.viewports[viewport].home
    const hero = page.getByRole('region', { name: 'Beat Battle' })
    const primary = hero.getByRole('link', { name: 'Avísame del próximo drop' })
    const ghost = hero.getByRole('link', { name: 'Cómo funciona', exact: true })
    await expect(primary).toHaveAttribute('data-variant', 'cta')
    await expect(ghost).toHaveAttribute('data-variant', 'outline')

    for (const [button, reference] of [
      [await read(primary), otp.ctaPrimary],
      [await read(ghost), otp.ctaGhost],
    ] as const) {
      expect(button.fontSize).toBe(reference.fontSize)
      expect(button.fontWeight).toBe(reference.fontWeight)
      expect(button.letterSpacing).toBe(reference.letterSpacing)
      expect(button.padding).toBe(reference.padding)
      expect(button.borderRadius).toBe(reference.borderRadius)
      // En móvil, los dos a lo ancho de la columna de 320 px, como en el sello.
      if (viewport === 'mobile') expect(button.width).toBe(reference.rect.width)
    }
    const [primaryStyle, ghostStyle] = [await read(primary), await read(ghost)]
    // Halo del CTA (`--bb-shadow-cta`, el del sello). El fondo es `--bb-red-cta` por AA (§3.1).
    expect(primaryStyle.boxShadow).toBe(otp.ctaPrimary.boxShadow)
    // Contorno al 30 % sobre el velo del cristal, con o sin refracción.
    expect(ghostStyle.border).toBe(otp.ctaGhost.border)
    expect(ghostStyle.backgroundColor).toBe(otp.ctaGhost.backgroundColor)
  })
}
