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

/**
 * Nada de la puerta se tapa (jurado de la 1.12, `RD-VIS-05`, WCAG 2.4.11): en las ventanas de escritorio
 * más bajas o estrechas (un iPad apaisado, un portátil con zoom del 125 %), el cartel EN JUEGO y el campeón
 * no pisan la columna del título. Se mira con `elementFromPoint` en el centro y cerca de las esquinas de
 * cada pieza: lo de encima tiene que ser ella misma (o algo suyo).
 */
for (const { width, height } of [
  { width: 1024, height: 768 },
  { width: 1100, height: 800 },
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`RD-VIS-05 / WCAG 2.4.11: a ${width} × ${height}, nada de la puerta queda tapado`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await openTitle(page)
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
    )
    const covered = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-title-gate]')
      if (!root) return ['sin puerta']
      const pieces: [string, Element | null][] = [
        ['empezar', root.querySelector('[data-cursor]')],
        ['sin sonido', root.querySelector('[aria-keyshortcuts="S"]')],
        ['pista', root.querySelector('[aria-keyshortcuts="S"]')?.parentElement?.firstElementChild ?? null],
        ['campeón', root.querySelector('[data-title-champion]')],
        ['cartel', root.querySelector('[data-title-bill]')],
        ['lockup', root.querySelector('[data-otp-signature]')],
      ]
      const problems: string[] = []
      for (const [name, element] of pieces) {
        if (!element) {
          problems.push(`${name}: no está`)
          continue
        }
        const box = element.getBoundingClientRect()
        // La pieza se ve entera en la ventana (o se llega desplazando la puerta).
        const points: [number, number][] = [
          [box.left + box.width / 2, box.top + box.height / 2],
          [box.left + 4, box.top + 4],
          [box.right - 4, box.top + 4],
          [box.left + 4, box.bottom - 4],
          [box.right - 4, box.bottom - 4],
        ]
        for (const [x, y] of points) {
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue
          const top = document.elementFromPoint(x, y)
          if (top && !element.contains(top) && !top.contains(element))
            problems.push(
              `${name} tapado en (${Math.round(x)}, ${Math.round(y)}) por ${top.className || top.tagName}`,
            )
        }
      }
      return problems
    })
    expect(covered).toEqual([])
  })
}
