import { type APIRequestContext, expect, type Page, test } from '@playwright/test'
import { type Account, battleContext, type Clock, CRON_SECRET, PASSWORD } from './battle'
import { playSeason, type SeasonPlayer, type SeasonWeek } from './game'
import { runSuffix, testIp } from './support'

/**
 * E2E del hito de la Fase 7 (guía §5, tarea 7.33): una temporada de 13 semanas jugada de punta a punta con la API local,
 * el almacenamiento falso, el reloj de prueba y el `Mailer` en memoria. Recorre lo que los demás E2E de la capa de juego
 * no cubren:
 *
 * - la subida en la pantalla da su XP («+125 XP» en la celebración, el medidor del HUD sube y sale su logro);
 * - el sellado de la última semana reparte el XP de resultado y el oído de oro (en el libro de XP de la exportación, en
 *   `me` y en «TU RESULTADO») y cierra la temporada con su campeón, su ceremonia en los resultados (7.27) y los avisos
 *   que esperaban, con la subida de nivel una sola vez (recargar no repite nada);
 * - `season.wrap` (7.30) y `game.progress` (7.29) llegan al buzón de prueba, y el de progreso se captura;
 * - re-sellar sin cambios y reprocesar no duplican XP, logros ni emails;
 * - el salón de la fama, la temporada y el perfil del campeón con datos de verdad, con el teclado; la carta del perfil,
 *   3D colgada de su pase y plana con «reducir movimiento».
 *
 * Lo que ya cubren otros: el «+5 XP» al votar, el medidor y la subida de nivel una vez (`game.spec.ts`); rangos, logros de
 * cada rareza, comodín, la ceremonia en el menú y el reprocesado de una temporada corta (`game-data.spec.ts`); las
 * páginas con datos fijos (`game-pages.spec.ts`) y el pase 3D (`pass.spec.ts`); el re-sellado del snapshot
 * (`results.spec.ts`).
 *
 * La temporada es la 2035-T2 (del 2 de abril al 25 de junio de 2035; nada más en la BD de los E2E cae ahí). Sella todo
 * lo que haya cerrado antes, así que va en su propio proyecto, detrás de `e2e-game` (`playwright.config.ts`).
 */

test.describe.configure({ mode: 'serial' })

/** Los 13 lunes de la 2035-T2. */
const MONDAYS = Array.from({ length: 13 }, (_, w) =>
  new Date(Date.UTC(2035, 3, 2 + 7 * w)).toISOString().slice(0, 10),
)
/** Lunes 2 de julio de 2035 a las 19:00 en Madrid (UTC+2): el `tick` del progreso del día que sella la última. */
const PROGRESS_AT = Date.UTC(2035, 6, 2, 17, 0)

/** Las capturas van a la salida de la prueba. */
const shot = (name: string) => test.info().outputPath(name)

/** El medidor de XP del HUD. */
const xpMeter = (page: Page) => page.getByRole('banner').getByRole('meter', { name: 'Experiencia' })

/** Como `formatNumber` de la web (es-ES). */
const formatXp = (n: number) => new Intl.NumberFormat('es-ES').format(n)

/** Un beat de 32 s a 140 BPM (bombo y acorde), en WAV de 16 bits a 22,05 kHz: lo que se sube en la pantalla. */
function beat(): Buffer {
  const rate = 22_050
  const frames = rate * 32
  const data = Buffer.alloc(frames * 2)
  const step = Math.round((60 / 140) * rate)
  for (let i = 0; i < frames; i++) {
    const since = i % step
    const kick =
      since < rate * 0.12 ? Math.sin(2 * Math.PI * 55 * (since / rate)) * Math.exp(-since / (rate * 0.04)) : 0
    const pad = [220, 261.63, 329.63].reduce((sum, f) => sum + Math.sin((2 * Math.PI * f * i) / rate), 0) / 3
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, 0.6 * kick + 0.25 * pad)) * 32767), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

interface LedgerRow {
  kind: string
  ref: string
  week: string | null
  amount: number
  createdAt: number
}

/** Lo que dice de su capa de juego una cuenta: `me` y su libro de XP y sus logros (de la exportación, `RF-PRF-05`). */
interface GameSnapshot {
  xp: number
  level: number
  ledger: LedgerRow[]
  achievements: { id: string; week: string | null; unlockedAt: number }[]
}

const rowKey = (row: LedgerRow) => `${row.kind}|${row.ref}`
const total = (rows: readonly LedgerRow[]) => rows.reduce((sum, row) => sum + row.amount, 0)

/** El XP del libro por tipo y semana (lo que un re-sellado sin cambios tiene que dejar igual). */
function sums(rows: readonly LedgerRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const key = `${row.kind}|${row.week ?? '-'}`
    out[key] = (out[key] ?? 0) + row.amount
  }
  return out
}

/** Un día: el `tick` del día siguiente a la misma hora (las 19:00, fuera de las horas de silencio). */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Llama al `tick` con el reloj `now` hasta que `done` diga que ya está y devuelve el instante del último. La BD de los E2E
 * es compartida y esto va lo último: la cola trae lo que dejaron los demás, cada pasada envía 40 por prioridad (el
 * resumen de temporada va de los últimos) y, si se agota el cupo de 24 h (`RF-NOTIF-17`), lo que queda se aplaza; entonces
 * el siguiente `tick` es el del día siguiente.
 */
async function tickUntil(
  request: APIRequestContext,
  now: number,
  done: () => Promise<boolean>,
  tries = 60,
): Promise<number> {
  let at = now
  for (let i = 0; i < tries; i++) {
    const tick = await request.get('/api/cron/tick', {
      headers: { authorization: `Bearer ${CRON_SECRET}`, 'x-bb-test-now': String(at) },
    })
    expect(tick.ok(), await tick.text()).toBe(true)
    if (await done()) return at
    if (((await tick.json()).data.drain?.deferred ?? 0) > 0) at += DAY_MS
  }
  throw new Error('el tick no ha enviado lo esperado')
}

interface Mail {
  subject: string
  text: string
  html: string
  count: number
}

async function mailbox(request: APIRequestContext, to: string, query: { contains?: string; text?: string }) {
  const params = new URLSearchParams({ to, ...query })
  const res = await request.get(`/api/test/mailbox?${params}`)
  expect(res.ok(), await res.text()).toBe(true)
  return (await res.json()).data as Mail | null
}

test('hito de la Fase 7: XP de la subida y del sellado, temporada de 13 semanas con campeón, ceremonia, season.wrap y game.progress, sin duplicados', async ({
  browser,
  baseURL,
}) => {
  // Unos 2 min en local; en la CI, con la CPU modesta y el render por software, bastante más.
  test.setTimeout(900_000)
  const base = baseURL as string
  const clock: Clock = { api: 0 }
  const headers = () => ({ origin: base, 'x-bb-test-now': String(clock.api) })
  const data = async (who: Account, path: string) => {
    const res = await who.page.request.get(path, { headers: headers() })
    expect(res.ok(), `${path}: ${await res.text()}`).toBe(true)
    return (await res.json()).data
  }
  const snapshot = async (who: Account): Promise<GameSnapshot> => {
    const me = await data(who, '/api/me')
    const { game } = await data(who, '/api/me/export')
    return {
      xp: me.game.xp,
      level: me.game.level,
      ledger: game.xpEvents,
      achievements: game.achievements.map(
        ({ id, week, unlockedAt }: GameSnapshot['achievements'][number]) => ({
          id,
          week,
          unlockedAt,
        }),
      ),
    }
  }

  // ── La temporada: 8 productores y 2 jurados, 13 semanas; la primera entrada del productor 0, en la pantalla ──────
  const season = await playSeason(browser, base, {
    mondays: MONDAYS,
    run: `h${runSuffix()}`,
    ip: (slot) => testIp(200 + slot),
    clock,
    seal: false,
    submit: async ({ p, w, who, week }) => (p === 0 && w === 0 ? uploadInPage(who, week) : null),
  })
  expect(season.seasonId).toBe('2035-T2')
  expect(season.weeks).toHaveLength(13)
  const [hero, second] = season.producers as [SeasonPlayer, SeasonPlayer, ...SeasonPlayer[]]
  const juror = season.jury[0] as Account
  const last = season.weeks.at(-1) as SeasonWeek

  /** RF-GAME-08 / §3.8.5: la subida en la pantalla, con su «+XP» y el medidor del HUD. */
  async function uploadInPage(who: Account, week: SeasonWeek): Promise<string> {
    let id = ''
    await test.step('RF-GAME-08 / RF-GAME-05: la subida da su XP: «+125 XP» en la celebración, el medidor sube y sale su logro', async () => {
      const page = who.page
      await page.clock.install({ time: clock.api })
      // Antes: el logro de descargar el sample (25 XP).
      const before = (await data(who, '/api/me')).game.xp as number
      await page.goto('/subir')
      await expect(xpMeter(page)).toHaveAttribute('aria-valuenow', String(before))
      await expect(page.getByRole('region', { name: 'Inserta tu beat' })).toBeVisible()
      await page
        .locator('input[type="file"][accept*="wav"]')
        .setInputFiles({ name: 'flip-del-hito.wav', mimeType: 'audio/wav', buffer: beat() })
      await page.getByLabel('Título').fill('Flip del hito')
      await page.getByRole('button', { name: /Trap/ }).first().click()
      await page.getByRole('button', { name: /He usado el sample/ }).click()
      const created = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith(`/api/weeks/${week.slug}/entries`),
      )
      await page.getByRole('button', { name: /Entrar en la batalla/ }).click()
      const response = await created
      expect(response.status(), await response.text()).toBe(201)
      const body = (await response.json()).data as {
        id: string
        game: { xp: number; achievements: string[] }
      }
      // La primera de la semana: 100 de subir y 25 de ser la primera; los logros, aparte (su aviso).
      expect(body.game.achievements).toContain('first_entry')
      await expect(page.getByText(/Ya estás en la batalla #/)).toBeVisible({ timeout: 60_000 })
      await expect(page.locator('section p').filter({ hasText: /^\+125\sXP$/ })).toBeVisible()
      const after = (await data(who, '/api/me')).game.xp as number
      expect(after).toBe(before + body.game.xp)
      await expect(xpMeter(page)).toHaveAttribute('aria-valuenow', String(after), { timeout: 10_000 })
      await expect(page.locator('[data-notice="achievement"]', { hasText: 'Primera piedra' })).toBeVisible()
      await page.screenshot({ path: shot('7.33-subida-xp-1440x900.png') })
      // Fuera de la pantalla mientras la temporada sigue por la API (nada que lea con el reloj que avanza).
      await page.goto('about:blank')
      id = body.id
    })
    return id
  }

  const before = { hero: await snapshot(hero), juror: await snapshot(juror) }
  let sealed = before
  let heroGame = { xp: 0, goldenEar: false, seasonPoints: 0 }
  let jurorGame = heroGame

  await test.step('RF-GAME-01 / RF-GAME-06: el sellado de la última semana reparte el XP de resultado y el oído de oro, una vez', async () => {
    // La primera lectura tras el cierre de votos la sella (y con ella, la temporada).
    clock.api = last.voteEndsAt + 60_000
    jurorGame = (await data(juror, `/api/weeks/${last.slug}/results`)).myGame
    heroGame = (await data(hero, `/api/weeks/${last.slug}/results`)).myGame
    sealed = { hero: await snapshot(hero), juror: await snapshot(juror) }
    for (const who of ['hero', 'juror'] as const) {
      const fresh = sealed[who].ledger.filter(
        (row) => !before[who].ledger.some((old) => rowKey(old) === rowKey(row)),
      )
      // El libro y su caché (`me`) cuadran; lo nuevo es todo de la semana sellada, y nada de antes ha cambiado.
      expect(total(sealed[who].ledger), who).toBe(sealed[who].xp)
      expect(sealed[who].xp - before[who].xp, who).toBe(total(fresh))
      expect(new Set(fresh.map((row) => row.week)), who).toEqual(new Set([last.slug]))
      expect(sealed[who].ledger.filter((row) => !fresh.includes(row))).toEqual(before[who].ledger)
      const game = who === 'hero' ? heroGame : jurorGame
      expect(total(fresh.filter((row) => row.kind === 'result' || row.kind === 'golden_ear')), who).toBe(
        game.xp,
      )
    }
    // El campeón: el 1.º (500 × su racha de 13 semanas), 25 puntos y el logro de campeón de temporada.
    expect(heroGame.xp).toBeGreaterThan(500)
    expect(heroGame).toMatchObject({ goldenEar: false, seasonPoints: 25 })
    expect(sealed.hero.achievements.map((a) => a.id)).toContain('season_champ')
    expect(before.hero.achievements.map((a) => a.id)).not.toContain('season_champ')
    // El jurado 0 vota las 8 con el criterio del resto: el oído de oro (75 XP, sin entrada ni resultado).
    expect(jurorGame).toEqual({ xp: 75, goldenEar: true, seasonPoints: 0 })
    const standings = await data(hero, `/api/seasons/${season.seasonId}/standings`)
    expect(standings.season).toEqual({ id: '2035-T2', sealedWeeks: 13, closed: true })
    expect(standings.rows[0]).toMatchObject({ position: 1, wins: 13, producer: { username: hero.username } })
  })

  await test.step('RF-RES-08 / RF-GAME-06: «TU RESULTADO» del jurado dice el XP del oído de oro', async () => {
    const page = juror.page
    await page.goto(`/semana/${last.slug}/resultados`)
    const mine = page.getByRole('region', { name: 'Tu resultado' })
    await expect(mine).toContainText(`+${formatXp(jurorGame.xp)} XP`)
    await expect(mine).toContainText(/Oído de oro\s*Sí/)
    await page.screenshot({ path: shot('7.33-resultado-jurado-1440x900.png') })
  })

  await test.step('RF-ARC-05 / RF-GAME-09: en los resultados, la ceremonia del campeón; al cerrarla, su logro y la subida de nivel, una vez', async () => {
    // En otra pestaña sin el reloj falso de la subida (con él, las salidas de Motion se quedan a medias tras el salto de
    // tres meses y los avisos no se van de la pantalla).
    const context = await battleContext(browser, base, testIp(251), clock)
    const page = await context.newPage()
    // Si la ceremonia no sale (no ha podido cargar la clasificación o la carta), lo dice la consola.
    const logs: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') logs.push(message.text())
    })
    const signedIn = await page.request.post('/api/auth/sign-in/email', {
      headers: headers(),
      data: { email: hero.email, password: PASSWORD },
    })
    expect(signedIn.ok(), await signedIn.text()).toBe(true)
    const levelSeen = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/seen') && r.request().postDataJSON()?.kind === 'level',
      { timeout: 90_000 },
    )
    await page.goto(`/semana/${last.slug}/resultados`)
    const ceremony = page.getByRole('dialog', { name: 'Ceremonia del campeón de la temporada T2 de 2035' })
    // Con la máquina muy cargada, el trozo diferido de la ceremonia (en desarrollo, módulo a módulo) tarda.
    await expect(ceremony, logs.join('\n')).toBeVisible({ timeout: 30_000 })
    await expect(
      ceremony.getByText('¡Eres el campeón de la temporada T2 de 2035!', { exact: true }),
    ).toBeVisible()
    await expect(ceremony).toContainText('13 victorias')
    // §3.8.8: los avisos esperan a que se cierre.
    await expect(page.locator('[data-notice]')).toHaveCount(0)
    await page.screenshot({ path: shot('7.33-ceremonia-campeon-1440x900.png') })
    await page.keyboard.press('Escape')
    await expect(ceremony).toHaveCount(0)
    // El legendario de campeón de temporada, al centro, y la subida de nivel del sellado (detrás de los demás logros).
    await expect(page.locator('[data-notice="legendary"]', { hasText: 'Campeón de temporada' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.locator('[data-notice="level"]')).toContainText(`Subes al nivel ${sealed.hero.level}`, {
      timeout: 60_000,
    })
    expect((await levelSeen).ok()).toBe(true)
    // Todo visto en el servidor: cada aviso lo marca al salir (con la máquina cargada, los últimos tardan).
    await expect
      .poll(
        async () => {
          const { game } = await data(hero, '/api/me')
          return [game.unseenAchievements, game.levelSeen, game.seasonCeremony]
        },
        { timeout: 20_000 },
      )
      .toEqual([[], sealed.hero.level, null])
    // «TU RESULTADO» del campeón: 1.º, el XP del sellado y sus puntos de temporada.
    const mine = page.getByRole('region', { name: 'Tu resultado' })
    await expect(mine).toContainText('1.º')
    await expect(mine).toContainText(`+${formatXp(heroGame.xp)} XP`)
    await expect(mine).toContainText(`${heroGame.seasonPoints} PTS`)
    // Recargar no repite ni la ceremonia ni los avisos.
    await page.reload()
    await expect(page.getByRole('region', { name: 'Tu resultado' })).toBeVisible()
    await page.waitForTimeout(1500)
    await expect(page.locator('[data-season-ceremony]')).toHaveCount(0)
    await expect(page.locator('[data-notice]')).toHaveCount(0)
    await context.close()
  })

  await test.step('RF-NOTIF-15 / RF-NOTIF-03: el tick de las 19:00 manda «Tu temporada en cifras» y el progreso del día (capturado)', async () => {
    clock.api = PROGRESS_AT
    const request = hero.page.request
    clock.api = await tickUntil(request, clock.api, async () => {
      const wrap = await mailbox(request, hero.email, { contains: '¡Campeón de la T2 de 2035!' })
      const juryWrap = await mailbox(request, juror.email, { contains: 'Tu T2 de 2035 en cifras' })
      const progress = await mailbox(request, hero.email, { text: 'Tu progreso del' })
      return Boolean(wrap && juryWrap && progress)
    })
    const wrap = (await mailbox(request, hero.email, { contains: '¡Campeón de la T2 de 2035!' })) as Mail
    expect(wrap.count).toBe(1)
    expect(wrap.text).toMatch(/Temporada T2 de 2035 · cerrada/i)
    expect(wrap.text).toMatch(/Semanas jugadas\s*13/i)
    const juryWrap = (await mailbox(request, juror.email, { contains: 'Tu T2 de 2035 en cifras' })) as Mail
    expect(juryWrap.count).toBe(1)
    expect(juryWrap.text).toContain(`Campeón: ${hero.username}.`)
    // `game.progress`: el día que se sella la última, el logro legendario de campeón (y lo que gane con él).
    const progress = (await mailbox(request, hero.email, { text: 'Tu progreso del' })) as Mail
    expect(progress.count).toBe(1)
    expect(progress.subject).toMatch(/^(Nuevo rango: |Logros? desbloqueados?: )/)
    expect(progress.text).toMatch(/Logro legendario · \+300 XP/i)
    expect(progress.text).toMatch(/Campeón de temporada/i)
    // Capturado: el HTML tal y como sale.
    const capture = await browser.newPage({ viewport: { width: 680, height: 1200 } })
    await capture.setContent(progress.html, { waitUntil: 'load' })
    await capture.screenshot({ path: shot('7.33-game-progress.png'), fullPage: true })
    await capture.close()
  })

  await test.step('RF-RES-06 / RF-GAME-01: re-sellar sin cambios no toca el XP, los logros, el campeón ni los emails', async () => {
    clock.api += 5 * 60_000
    const before = await data(hero, `/api/weeks/${last.slug}/results`)
    const resealed = await season.admin.page.request.post(`/api/admin/weeks/${last.slug}/reseal`, {
      headers: headers(),
    })
    expect(resealed.ok(), await resealed.text()).toBe(true)
    const after = await data(hero, `/api/weeks/${last.slug}/results`)
    expect(after.week.revision).toBe(before.week.revision + 1)
    expect(
      after.rows.map((row: { entry: { id: string }; result: { position: number | null } }) => [
        row.entry.id,
        row.result.position,
      ]),
    ).toEqual(
      before.rows.map((row: { entry: { id: string }; result: { position: number | null } }) => [
        row.entry.id,
        row.result.position,
      ]),
    )
    expect(after.myGame).toEqual(heroGame)
    expect((await data(juror, `/api/weeks/${last.slug}/results`)).myGame).toEqual(jurorGame)
    for (const [who, account] of [
      ['hero', hero],
      ['juror', juror],
    ] as const) {
      const now = await snapshot(account)
      expect(now.xp, who).toBe(sealed[who].xp)
      expect(total(now.ledger), who).toBe(now.xp)
      expect(sums(now.ledger), who).toEqual(sums(sealed[who].ledger))
      expect(now.achievements, who).toEqual(sealed[who].achievements)
    }
    const standings = await data(hero, `/api/seasons/${season.seasonId}/standings`)
    expect(standings.season).toEqual({ id: '2035-T2', sealedWeeks: 13, closed: true })
    expect(standings.rows[0]).toMatchObject({ position: 1, producer: { username: hero.username } })
    // El cierre de temporada del re-sellado no vuelve a encolar el resumen (su clave de idempotencia), ni el progreso.
    const request = hero.page.request
    await tickUntil(request, clock.api, async () => true, 1)
    expect((await mailbox(request, hero.email, { contains: '¡Campeón de la T2 de 2035!' }))?.count).toBe(1)
    expect((await mailbox(request, juror.email, { contains: 'Tu T2 de 2035 en cifras' }))?.count).toBe(1)
    expect((await mailbox(request, hero.email, { text: 'Tu progreso del' }))?.count).toBe(1)
  })

  await test.step('RF-GAME-01: reprocesar la historia sobre lo que escribieron los ganchos en vivo no añade nada', async () => {
    const everyone = [...season.producers, ...season.jury]
    const all = async () => {
      const out: [string, number, LedgerRow[], GameSnapshot['achievements']][] = []
      for (const who of everyone) {
        const now = await snapshot(who)
        out.push([
          who.username,
          now.xp,
          [...now.ledger].sort((a, b) => rowKey(a).localeCompare(rowKey(b))),
          now.achievements,
        ])
      }
      return out
    }
    const before = await all()
    const res = await hero.page.request.post('/api/test/game/reprocess', { headers: headers() })
    expect(res.ok(), await res.text()).toBe(true)
    expect((await res.json()).data).toMatchObject({ applied: true })
    expect(await all()).toEqual(before)
  })

  await test.step('RF-ARC-02 / RF-ARC-03: el salón de la fama y la temporada, con el teclado', async () => {
    const page = second.page
    await page.goto('/salon-de-la-fama')
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Salón de la fama')
    // Los campeones semana a semana, del más reciente: las dos últimas de la temporada, con ← →.
    const winners = page.getByRole('menu', { name: 'Campeones semana a semana' }).getByRole('menuitem')
    await winners.first().focus()
    await expect(winners.first()).toHaveAttribute('href', `/semana/${last.slug}/resultados`)
    await expect(winners.first()).toContainText(hero.username)
    await page.keyboard.press('ArrowRight')
    await expect(winners.nth(1)).toBeFocused()
    await expect(winners.nth(1)).toHaveAttribute('href', `/semana/${season.weeks[11]?.slug}/resultados`)
    // La placa de la temporada, con su campeón, lleva a su clasificación con Intro.
    const plate = page
      .getByRole('region', { name: 'Campeones de temporada' })
      .getByRole('link', { name: /T2 de 2035/ })
    await expect(plate).toContainText(hero.username)
    await plate.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/temporada/2035-T2')
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Temporada T2 de 2035')
    await expect(page.getByRole('region', { name: 'Podio · T2 de 2035' })).toContainText('Campeón')
    await expect(page.getByRole('region', { name: 'Podio · T2 de 2035' })).toContainText(hero.username)
    const table = page.getByRole('table')
    await table.getByRole('link', { name: hero.username, exact: true }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(table.getByRole('link', { name: second.username, exact: true })).toBeFocused()
    await page.screenshot({ path: shot('7.33-temporada-1440x900.png') })
  })

  await test.step('RF-GAME-07: el perfil del campeón, con su carta de campeón colgada del pase y plana con «reducir movimiento»', async () => {
    const context = await battleContext(browser, base, testIp(250), clock)
    await context.addInitScript(() => {
      window.localStorage.setItem('bb:quality', 'alta')
      window.localStorage.setItem('bb:title', 'off')
    })
    const page = await context.newPage()
    await page.goto(`/p/${hero.username}`)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(hero.username)
    const card = page.locator('[data-producer-card]')
    await expect(card).toHaveAttribute('data-variant', 'champion')
    const webgl = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null
    })
    if (webgl) {
      await expect(page.locator('[data-pass-room]')).toHaveAttribute('data-pass-live', { timeout: 30_000 })
      await page.screenshot({ path: shot('7.33-perfil-campeon-pase-1440x900.png') })
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await expect(card).toHaveAttribute('data-variant', 'champion')
    await expect(card).toHaveAttribute('data-flat')
    await page.waitForTimeout(1500)
    await expect(page.locator('[data-pass-room]')).toHaveCount(0)
    await page.keyboard.press('c')
    await expect(card).toHaveAttribute('data-side', 'back')
    await context.close()
  })
})
