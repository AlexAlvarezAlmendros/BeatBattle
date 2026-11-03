import { expect, type Page, test } from '@playwright/test'
import { recordAnimations, runningLoops } from './motion'
import { collectErrors, expectNoAxeViolations, open, settle } from './support'

/**
 * La capa de juego sin espectáculo (guía §3.10, tarea 7.34): con la calidad **apagada**, **sin sonido**, con «reducir
 * movimiento» y en **modo serio** a la vez se pierde espectáculo, nunca información (`RNF-A11Y-03`, `RNF-A11Y-05`).
 *
 * - El banco `/dev/recompensas` (la sesión de muestra del HUD): el «+5 XP», los avisos de logro (también el
 *   legendario y cuatro a la vez) y la subida de nivel salen con su texto, sin chispas ni estampas, sin moverse y sin
 *   fundidos de más de 200 ms; y cada uno se dice una vez en la región viva (`RNF-A11Y-07`).
 * - El perfil completo (datos fijos, como `game-pages.spec.ts`): la carta plana, sin pase ni su trozo, que C gira con
 *   un fundido; el reverso, con el QR y la dirección, pasa axe.
 * - El salón de la fama y la temporada, sin bucles ni movimiento.
 */

/** Sirve una respuesta fija de la API (`{ data }`). */
async function serve(page: Page, path: string, data: unknown) {
  await page.route(`**${path}`, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) }),
  )
}

/** Un PNG de 1 × 1 negro. */
const QR_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg=='

const KAIRO = { username: 'kairo.wav', displayName: 'Kairo.wav', avatarUrl: null }
const AINA = { username: 'aina', displayName: 'aina', avatarUrl: null }

const history = [42, 41, 40, 39, 38, 37].map((weekNumber, index) => ({
  weekSlug: `2026-w${weekNumber}`,
  weekNumber,
  entryId: `e-${weekNumber}`,
  alias: 'Faro Errante',
  title: `Neón en Sants ${weekNumber}`,
  cover: { kind: 'generative', seed: weekNumber },
  votes: 30 + index,
  position: [1, 4, 2, null, 1, 3][index] ?? null,
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
  links: {},
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
    achievements: ['first_vote', 'streak_3', 'podium', 'win', 'season_champ'].map((id) => ({
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
  rows: [AINA, KAIRO, null].map((producer, index) => ({
    position: index + 1,
    producer,
    points: 200 - index * 30,
    wins: index === 0 ? 3 : 0,
    podiums: 3,
    weeks: 12,
    meanScoreMilli: 4100 - index * 90,
  })),
}

/** Calidad apagada y sin sonido antes de cargar la app; el modo serio, en cuanto existe `<html>` (como lo pone Opciones). */
async function quiet(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('bb:quality', 'apagada')
    localStorage.setItem('bb:sound', 'off')
    const serious = () => document.documentElement?.setAttribute('data-serious', '')
    if (document.documentElement) serious()
    else
      new MutationObserver((_, observer) => {
        if (!document.documentElement) return
        serious()
        observer.disconnect()
      }).observe(document, { childList: true })
  })
  await page.addInitScript(recordAnimations)
}

/** Lo que dice la región viva de las recompensas, en orden (los textos llevan espacios duros: «+5 XP»). */
const said = async (page: Page) =>
  (await page.getByRole('log', { name: 'Recompensas' }).locator('p').allTextContents()).map((text) =>
    text.replace(/\s+/g, ' '),
  )

/** Nada se mueve, nada dura más de 200 ms y no queda ningún bucle (Anexo E, §3.6). */
async function expectStill(page: Page) {
  await settle(page)
  expect(await runningLoops(page)).toEqual([])
  const recorded = await page.evaluate(() => window.__bbAnimations)
  expect(recorded.filter((animation) => animation.iterations === Infinity)).toEqual([])
  expect(recorded.filter((animation) => animation.moves)).toEqual([])
  expect(recorded.filter((animation) => animation.duration > 200)).toEqual([])
}

test.use({ reducedMotion: 'reduce' })

test.describe('§3.10: la capa de juego con calidad apagada, sin sonido, sin movimiento y en modo serio', () => {
  test('RNF-A11Y-03 / RNF-A11Y-05 / RNF-A11Y-07: el «+XP», los avisos y la subida de nivel dicen todo sin moverse ni destellar', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await quiet(page)
    await open(page, '/dev/recompensas', 'Recompensas (banco)')
    await expect(page.locator('html')).toHaveAttribute('data-serious', '')
    // Sin Escenario: la arena estática.
    await expect(page.locator('[data-stage] canvas')).toHaveCount(0)
    const meter = page.getByRole('banner').getByRole('meter', { name: 'Experiencia' })
    const before = Number(await meter.getAttribute('aria-valuenow'))

    await page.getByRole('button', { name: 'Votar (+5 XP)' }).click()
    await expect(page.locator('[data-float-xp]')).toHaveText(/\+5\sXP/)
    await expect(meter).toHaveAttribute('aria-valuenow', String(before + 5))
    await expect.poll(() => said(page)).toEqual(['+5 XP'])

    // El legendario: al centro con su placa (nombre, condición, rareza y XP), sin chispas ni anunciador.
    await page.getByRole('button', { name: 'Logro legendario' }).click()
    const legendary = page.locator('[data-notice="legendary"]')
    await expect(legendary).toContainText('Platino')
    await expect(legendary).toContainText('Gana 3 semanas.')
    await expect(legendary).toContainText('Legendario')
    await expect(legendary).toContainText('+300 XP')
    await expect(legendary.locator('[data-fx]')).toHaveCount(0)
    await expect(legendary.getByText('¡LOGRO LEGENDARIO!')).toBeHidden()
    await expect.poll(() => said(page)).toEqual(['+5 XP', 'Logro conseguido: Platino, Legendario, +300 XP'])
    // Cualquier tecla lo quita (una letra sin atajo: Espacio pulsaría otra vez el botón con el foco).
    await page.keyboard.press('z')
    await expect(legendary).toHaveCount(0)

    // La subida de nivel: el sello sin estampa y el texto.
    await page.getByRole('button', { name: 'Subir de nivel' }).click()
    const level = page.locator('[data-notice="level"]')
    // (El nivel siguiente al de la sesión de muestra después del voto y del legendario.)
    await expect(level).toContainText(/Subes al nivel \d+/)
    const reached = (await level.textContent())?.match(/Subes al nivel (\d+)/)?.[1]
    await expect(level.locator('[data-stamp]')).toHaveCount(0)
    await expect.poll(async () => (await said(page)).at(-1)).toMatch(new RegExp(`^¡Nivel ${reached}!`))
    await page.keyboard.press('z')
    await expect(level).toHaveCount(0)

    // Cuatro logros a la vez: tres placas y la cuarta después; cada uno se dice una vez.
    await page.getByRole('button', { name: 'Cuatro logros a la vez' }).click()
    await expect(page.locator('[data-notice="achievement"]')).toHaveCount(3)
    await expect
      .poll(async () => (await said(page)).filter((text) => text.startsWith('Logro conseguido')).length)
      .toBe(3)
    await expectNoAxeViolations(page)
    await expectStill(page)
    // El banco no tiene cuenta de verdad: el visto de cada aviso (`POST /api/me/seen`) da 401 y nada más.
    expect(errors.filter((error) => !error.includes('status of 401'))).toEqual([])
  })

  test('RF-GAME-07 / RNF-A11Y-03: el perfil enseña la carta plana sin pedir el pase, C la gira con un fundido y el reverso pasa axe', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    const passChunk: string[] = []
    page.on('request', (request) => {
      if (/PassView|rapier/i.test(request.url())) passChunk.push(request.url())
    })
    await quiet(page)
    await serve(page, '/api/profiles/kairo.wav', PROFILE)
    // El QR del reverso: el PNG del servidor (de esta cuenta de mentira, uno cualquiera).
    await page.route('**/api/profiles/kairo.wav/qr.png', (route) =>
      route.fulfill({ contentType: 'image/png', body: Buffer.from(QR_PNG, 'base64') }),
    )
    await page.setViewportSize({ width: 1440, height: 2000 })
    await open(page, '/p/kairo.wav', 'kairo.wav')
    const card = page.locator('[data-producer-card]')
    await expect(card).toHaveAttribute('data-flat')
    await expect(page.locator('[data-pass-room]')).toHaveCount(0)
    // La información de la carta, entera: nombre, nivel, rango y cifras.
    await expect(card).toHaveAccessibleName(/kairo\.wav/i)
    await expect(card.getByRole('img', { name: 'Nivel 13' })).toBeVisible()
    await expect(card.locator('[data-face="front"] dd')).toHaveText([/^\d+$/, /^\d+$/, /^\d+$/])
    await page.keyboard.press('c')
    await expect(card).toHaveAttribute('data-side', 'back')
    await expect(card.locator('[data-face="back"]')).toBeVisible()
    await expect(card.getByRole('img', { name: 'Código QR del perfil de kairo.wav' })).toBeVisible()
    await expect(card.locator('[data-face="back"]')).toContainText('/p/kairo.wav')
    await expectNoAxeViolations(page)
    await expectStill(page)
    expect(passChunk).toEqual([])
    expect(errors).toEqual([])
  })

  for (const { path, heading, api, data } of [
    { path: '/salon-de-la-fama', heading: 'Salón de la fama', api: '/api/hall-of-fame', data: HALL },
    {
      path: '/temporada/2026-T3',
      heading: 'Temporada T3 de 2026',
      api: '/api/seasons/2026-T3/standings',
      data: SEASON,
    },
  ])
    test(`RNF-A11Y-03: ${path} no deja bucles ni movimiento y enseña sus datos`, async ({ page }) => {
      await quiet(page)
      await serve(page, api, data)
      await open(page, path, heading)
      await expect(page.getByRole('main')).toContainText('aina')
      await expectStill(page)
    })
})
