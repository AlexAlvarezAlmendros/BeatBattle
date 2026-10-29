import { expect, type Page, test } from '@playwright/test'
import { collectErrors, expectCursor, expectNoAxeViolations, open, settle } from './support'

/**
 * Las páginas de la capa de juego (Fase 7, tareas 7.22 y 7.24–7.26): la carta de productor (la plana de
 * `RF-GAME-07`), el perfil completo, el salón de la fama y la temporada, en el navegador de verdad. La API de estas
 * páginas se sirve con datos fijos (`page.route`): lo que se prueba aquí es la pantalla (teclado, accesibilidad, tamaño
 * del texto); lo que la API cuenta —solo semanas selladas, sin fugas del voto ciego— lo prueba el servidor
 * (`gamePublic.test.ts`, `hallOfFame.test.ts`, `seasons.test.ts`). `/p/aina` es la cuenta de verdad de los E2E.
 */

const KAIRO = { username: 'kairo.wav', displayName: 'Kairo.wav', avatarUrl: null }
const AINA = { username: 'aina', displayName: 'aina', avatarUrl: null }

const history = [42, 41, 40, 39, 38, 37, 36].map((weekNumber, index) => ({
  weekSlug: `2026-w${weekNumber}`,
  weekNumber,
  entryId: `e-${weekNumber}`,
  alias: 'Faro Errante',
  title: `Neón en Sants ${weekNumber}`,
  cover: { kind: 'generative', seed: weekNumber },
  votes: 30 + index,
  position: [1, 4, 2, null, 1, 7, 3][index] ?? null,
  scoreMilli: 4600 - index * 70,
}))

const PROFILE = {
  username: 'kairo.wav',
  displayUsername: 'kairo.wav',
  cardNumber: 42,
  joinedAt: Date.UTC(2026, 2, 10),
  xp: 9000,
  bio: 'Flips de soul con 808 de barrio.',
  city: 'Sants, Barcelona',
  links: { instagram: 'https://instagram.com/kairo.wav' },
  accent: 'red',
  avatarUrl: null,
  game: {
    level: 13,
    stats: {
      bestPosition: 1,
      streak: { current: 3, best: 6 },
      meanScoreMilli: 4180,
      goldenEars: 4,
      votesCast: 312,
      season: { id: '2026-T4', points: 58, position: 3 },
    },
    history,
    achievements: ['first_vote', 'streak_3', 'podium', 'win', 'season_champ', 'night_owl'].map((id) => ({
      id,
      unlockedAt: Date.UTC(2026, 8, 1),
    })),
    showcase: ['season_champ', 'win', 'streak_3'],
  },
}

const HALL = {
  weeklyWinners: history
    .filter((row) => row.position === 1)
    .map(({ weekSlug, weekNumber, entryId, alias, title, cover }) => ({
      weekSlug,
      weekNumber,
      entryId,
      alias,
      title,
      cover,
      producer: KAIRO,
    })),
  seasonChampions: [{ seasonId: '2026-T3', producers: [AINA, KAIRO] }],
  records: {
    mostWins: { producer: KAIRO, value: 2 },
    longestStreak: { producer: null, value: 6 },
    bestScore: { producer: AINA, scoreMilli: 4702, weekSlug: '2026-w40', entryId: 'e-40' },
    mostVotesCast: { producer: AINA, value: 120 },
  },
}

const SEASON = {
  season: { id: '2026-T3', sealedWeeks: 13, closed: true },
  rows: [AINA, KAIRO, null, KAIRO].map((producer, index) => ({
    position: index + 1,
    producer,
    points: 200 - index * 30,
    wins: index === 0 ? 3 : 0,
    podiums: index < 3 ? 4 : 1,
    weeks: 12,
    meanScoreMilli: 4100 - index * 90,
  })),
}

/** Sirve una respuesta fija de la API (`{ data }`). */
async function serve(page: Page, path: string, data: unknown) {
  await page.route(`**${path}`, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) }),
  )
}

/** Textos visibles por debajo de 12 px (`RD-VIS-05`), como `text-size.spec.ts`. */
function smallTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const small: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim()
      const element = node.parentElement
      if (!text || !element || element.closest('svg, .sr-only, [hidden]')) continue
      const style = getComputedStyle(element)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      const box = element.getBoundingClientRect()
      if (box.width < 2 || box.height < 2) continue
      const size = Number.parseFloat(style.fontSize)
      if (size < 12) small.push(`${size}px «${text.slice(0, 40)}»`)
    }
    return small
  })
}

test.describe('la carta plana (RF-GAME-07)', () => {
  test.describe('con «reducir movimiento»', () => {
    test.use({ reducedMotion: 'reduce' })

    test('RF-GAME-07: con «reducir movimiento» se ve la carta plana, sin giro ni inclinación, y C cambia de cara', async ({
      page,
    }) => {
      const errors = collectErrors(page)
      await open(page, '/p/aina', 'aina')
      const card = page.locator('[data-producer-card]')
      await expect(card).toHaveAttribute('data-flat')
      await expect(card).not.toHaveAttribute('data-tilt')
      expect(await card.evaluate((element) => getComputedStyle(element).rotate)).toBe('none')
      expect(
        await card
          .locator('[data-face="front"]')
          .evaluate((element) => getComputedStyle(element.parentElement!).transform),
      ).toBe('none')
      await page.keyboard.press('c')
      await expect(card).toHaveAttribute('data-side', 'back')
      await expect(card.locator('[data-face="back"]')).toBeVisible()
      await expect(card.locator('[data-face="front"]')).toBeHidden()
      // El QR del perfil, con su trozo diferido.
      await expect(card.locator('svg[data-qr="ready"]')).toBeAttached()
      expect(errors).toEqual([])
    })
  })

  test('§3.4.4: con movimiento, la carta sigue al puntero y C la gira media vuelta', async ({ page }) => {
    await open(page, '/p/aina', 'aina')
    const card = page.locator('[data-producer-card]')
    await expect(card).toHaveAttribute('data-tilt')
    await expect(card).not.toHaveAttribute('data-flat')
    await page.getByRole('button', { name: 'Girar carta' }).click()
    await expect(card).toHaveAttribute('data-side', 'back')
    await expect(page.getByRole('button', { name: 'Girar carta' })).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('el perfil completo (RF-PRF-01)', () => {
  test.beforeEach(async ({ page }) => {
    await serve(page, '/api/profiles/kairo.wav', PROFILE)
  })

  test('RF-PRF-01 / RF-GAME-05: teselas, historial y logros; la rejilla de logros se recorre con flechas y L la despliega', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await open(page, '/p/kairo.wav', 'kairo.wav')
    await expect(page.getByRole('article', { name: /de campeón de temporada/ })).toBeVisible()
    const history = page.getByRole('region', { name: 'Historial de combates' })
    await expect(history.getByRole('link')).toHaveCount(5)
    await history.getByRole('button', { name: 'Ver los 7 combates' }).click()
    await expect(history.getByRole('link')).toHaveCount(7)
    const grid = page.getByRole('listbox', { name: 'Logros' })
    const options = grid.getByRole('option')
    await expect(options).toHaveCount(12)
    await options.first().focus()
    await expectCursor(options.first())
    await page.keyboard.press('ArrowRight')
    await expectCursor(options.nth(1))
    await expect(page.getByText('Clasifica 3 semanas seguidas.')).toBeVisible()
    await page.keyboard.press('l')
    await expect(options).toHaveCount(36)
    await expect(options.last()).toHaveAttribute('aria-label', /^Logro oculto, raro, sin conseguir: /)
    expect(errors).toEqual([])
  })

  test('RNF-A11Y-02: el perfil con semanas selladas pasa axe (WCAG 2.2 AA)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 2000 })
    await open(page, '/p/kairo.wav', 'kairo.wav')
    await expectNoAxeViolations(page)
  })

  test.describe('móvil (390 × 844)', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('RD-VIS-05: ningún texto de menos de 12 px en el perfil con semanas selladas', async ({ page }) => {
      await open(page, '/p/kairo.wav', 'kairo.wav')
      await settle(page)
      expect(await smallTexts(page)).toEqual([])
    })
  })
})

test.describe('salón de la fama y temporada (RF-ARC-02, RF-ARC-03)', () => {
  test.beforeEach(async ({ page }) => {
    await serve(page, '/api/hall-of-fame', HALL)
    await serve(page, '/api/seasons/2026-T3/standings', SEASON)
  })

  test('RF-ARC-02: los campeones semana a semana son una parada que se recorre con ← →; las placas llevan a su temporada', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await open(page, '/salon-de-la-fama', 'Salón de la fama')
    const winners = page.getByRole('menu', { name: 'Campeones semana a semana' }).getByRole('menuitem')
    await expect(winners).toHaveCount(2)
    await winners.first().focus()
    await expectCursor(winners.first())
    await page.keyboard.press('ArrowRight')
    await expectCursor(winners.nth(1))
    await expect(winners.nth(1)).toHaveAttribute('href', '/semana/2026-w38/resultados')
    await page.getByRole('region', { name: 'Campeones de temporada' }).getByRole('link').click()
    await expect(page).toHaveURL('/temporada/2026-T3')
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Temporada T3 de 2026')
    expect(errors).toEqual([])
  })

  test('RF-ARC-03: la clasificación se recorre con ↑ ↓ y el podio dice el campeón de la temporada cerrada', async ({
    page,
  }) => {
    await open(page, '/temporada/2026-t3', 'Temporada T3 de 2026')
    await expect(page).toHaveURL('/temporada/2026-T3')
    await expect(page.getByRole('region', { name: 'Podio · T3 de 2026' })).toContainText('Campeón')
    const first = page.getByRole('table').getByRole('link', { name: 'aina' })
    await first.focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('table').getByRole('link', { name: 'Kairo.wav' }).first()).toBeFocused()
  })

  test('RNF-A11Y-02: el salón y la temporada con datos pasan axe (WCAG 2.2 AA)', async ({ page }) => {
    // Con todo a la vista: con datos, la página se desplaza y lo que queda a medias bajo la barra fija (un
    // botón del pie) contaría como un objetivo tapado, cosa que el desplazamiento ya resuelve (§3.4.1).
    await page.setViewportSize({ width: 1440, height: 2600 })
    await open(page, '/salon-de-la-fama', 'Salón de la fama')
    await expectNoAxeViolations(page)
    await open(page, '/temporada/2026-T3', 'Temporada T3 de 2026')
    await expectNoAxeViolations(page)
  })

  test.describe('móvil (390 × 844)', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('RD-VIS-05: ningún texto de menos de 12 px en el salón y la temporada con datos', async ({
      page,
    }) => {
      await open(page, '/salon-de-la-fama', 'Salón de la fama')
      await settle(page)
      expect(await smallTexts(page)).toEqual([])
      await open(page, '/temporada/2026-T3', 'Temporada T3 de 2026')
      await settle(page)
      expect(await smallTexts(page)).toEqual([])
    })
  })
})
