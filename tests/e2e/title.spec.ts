import { expect, type Page, test } from '@playwright/test'
import { expectNoAxeViolations } from './support'

/**
 * Pantalla de título «PULSA PARA EMPEZAR» (guía §3.8.1, tarea 1.13). La configuración de las pruebas la
 * apaga (`bb:title` = `off`) para que no tape cada página; aquí se vuelve a encender.
 */
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => window.localStorage.removeItem('bb:title'))
})

const gate = (page: Page) => page.getByRole('dialog', { name: 'Beat Battle, un juego de Other People' })

async function openTitle(page: Page) {
  await page.goto('/dev/menu')
  await expect(gate(page)).toBeVisible()
  // Tras el arranque «[OTP.] PRESENTA», el foco va a «Pulsa para empezar».
  await expect(page.getByRole('button', { name: 'Pulsa para empezar' })).toBeFocused({ timeout: 5000 })
}

test('§3.8.1: la primera vez en la sesión sale la puerta; con Intro se entra al menú y al recargar ya no sale', async ({
  page,
}) => {
  await openTitle(page)
  await page.keyboard.press('Enter')
  await expect(gate(page)).toHaveCount(0)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Beat Battle')
  await page.reload()
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Beat Battle')
  await page.waitForTimeout(500)
  await expect(gate(page)).toHaveCount(0)
})

test('§3.8.1: «Entrar sin sonido» entra con el sonido apagado', async ({ page }) => {
  await openTitle(page)
  await page.getByRole('button', { name: /Entrar sin sonido/ }).click()
  await expect(gate(page)).toHaveCount(0)
  expect(await page.evaluate(() => window.localStorage.getItem('bb:sound'))).toBe('off')
})

test('RNF-A11Y-02: axe sin violaciones WCAG 2.2 AA en la pantalla de título', async ({ page }) => {
  await openTitle(page)
  await expectNoAxeViolations(page)
})

for (const { width, height, touch } of [
  { width: 1440, height: 900, touch: false },
  { width: 390, height: 844, touch: true },
  { width: 320, height: 568, touch: false },
]) {
  test.describe(`${width} × ${height}${touch ? ' táctil' : ''}`, () => {
    test.use({ viewport: { width, height }, isMobile: touch, hasTouch: touch })

    test('RD-VIS-02 b / WCAG 1.4.10: la puerta no se sale de lado y lleva la firma del sello', async ({
      page,
    }) => {
      await openTitle(page)
      const overflow = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('[data-title-gate]')
        return root ? root.scrollWidth - root.clientWidth : -1
      })
      expect(overflow).toBe(0)
      // La del pie (la otra va en el *lockup*, «by [OTP.]»).
      const signature = gate(page).locator('footer [data-otp-signature]')
      await signature.scrollIntoViewIfNeeded()
      await expect(signature).toBeVisible()
    })
  })
}
