import { expect, test } from '@playwright/test'
import type { Clock } from './battle'
import { playSeason } from './game'
import { runSuffix, testIp } from './support'

/**
 * Los datos de prueba de la capa de juego (tarea 7.32): una temporada jugada por la API (`playSeason`) deja lo que
 * necesitan la 7.33 y las capturas de la 7.35 —niveles de varios rangos, logros de cada rareza, una racha con el
 * comodín gastado, una temporada cerrada con su campeón y récords en el salón de la fama— y, como todo lo escribieron
 * los ganchos en vivo, reprocesar no añade nada (`RF-GAME-01`).
 *
 * Las semanas son las de marzo de 2034 (la 2034-T1; nada más en la BD de los E2E cae ahí). Sella, así que va en su
 * propio proyecto, después de los que sellan otras semanas (`playwright.config.ts`).
 */

test.describe.configure({ mode: 'serial' })

/** El índice de rango de un nivel (`RANK_LADDER` de `@beatbattle/rules`: un rango cada dos niveles y el 20). */
const rankIndex = (level: number) => (level >= 20 ? 9 : Math.floor((level - 1) / 2))

/** Rareza de cada logro que puede salir aquí (Anexo C). */
const RARITY: Record<string, 'common' | 'rare' | 'epic' | 'legendary'> = {
  first_drop: 'common',
  first_entry: 'common',
  first_vote: 'common',
  share_card: 'common',
  early_bird: 'rare',
  streak_3: 'rare',
  jury_full: 'rare',
  podium: 'rare',
  win: 'epic',
  golden_ear: 'epic',
  win_3: 'legendary',
  double: 'legendary',
  season_champ: 'legendary',
}

test('RF-GAME-01, RF-ARC-02, RF-ARC-05: una temporada jugada deja rangos, logros de cada rareza, el comodín gastado, su campeón y el salón; reprocesar no añade nada', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000)
  const base = baseURL as string
  const clock: Clock = { api: 0 }
  const season = await playSeason(browser, base, {
    mondays: ['2034-03-06', '2034-03-13', '2034-03-20', '2034-03-27'],
    run: runSuffix(),
    ip: (slot) => testIp(150 + slot),
    clock,
  })
  expect(season.seasonId).toBe('2034-T1')
  const [champion, second, joker] = season.producers as [
    (typeof season.producers)[number],
    (typeof season.producers)[number],
    (typeof season.producers)[number],
  ]
  const request = champion.page.request
  const headers = () => ({ 'x-bb-test-now': String(clock.api) })

  await test.step('RF-ARC-05: la temporada está cerrada y su campeón es el que ganó todas', async () => {
    const res = await request.get(`/api/seasons/${season.seasonId}/standings`, { headers: headers() })
    expect(res.ok(), await res.text()).toBe(true)
    const { season: info, rows } = (await res.json()).data
    expect(info).toEqual({ id: '2034-T1', sealedWeeks: 4, closed: true })
    expect(rows[0]).toMatchObject({ position: 1, wins: 4, producer: { username: champion.username } })
    expect(rows[1]).toMatchObject({ position: 2, producer: { username: second.username } })
  })

  await test.step('RF-ARC-02: el salón de la fama tiene su campeón de temporada, sus ganadores y sus récords', async () => {
    const res = await request.get('/api/hall-of-fame', { headers: headers() })
    expect(res.ok(), await res.text()).toBe(true)
    const hall = (await res.json()).data
    const mine = hall.seasonChampions.find((c: { seasonId: string }) => c.seasonId === '2034-T1')
    expect(mine.producers.map((p: { username: string }) => p.username)).toEqual([champion.username])
    const slugs = season.weeks.map((w) => w.slug)
    const winners = hall.weeklyWinners.filter((w: { weekSlug: string }) => slugs.includes(w.weekSlug))
    expect(winners.map((w: { producer: { username: string } }) => w.producer.username)).toEqual(
      Array(4).fill(champion.username),
    )
    for (const key of ['mostWins', 'longestStreak', 'bestScore', 'mostVotesCast'])
      expect(hall.records[key], key).not.toBeNull()
    expect(hall.records.mostWins.value).toBeGreaterThanOrEqual(4)
  })

  await test.step('niveles de varios rangos y logros de cada rareza en los perfiles', async () => {
    const levels: number[] = []
    const rarities = new Set<string>()
    const unlocked = new Map<string, string[]>()
    for (const who of [...season.producers, ...season.jury]) {
      const res = await request.get(`/api/profiles/${who.username}`, { headers: headers() })
      expect(res.ok(), await res.text()).toBe(true)
      const { game } = (await res.json()).data
      levels.push(game.level)
      const ids = game.achievements.map((a: { id: string }) => a.id)
      unlocked.set(who.username, ids)
      for (const id of ids) if (RARITY[id]) rarities.add(RARITY[id])
    }
    expect(new Set(levels.map(rankIndex)).size).toBeGreaterThanOrEqual(3)
    expect([...rarities].sort()).toEqual(['common', 'epic', 'legendary', 'rare'])
    expect(unlocked.get(champion.username)).toEqual(
      expect.arrayContaining([
        'first_drop',
        'share_card',
        'early_bird',
        'win',
        'win_3',
        'double',
        'season_champ',
      ]),
    )
    expect(unlocked.get(season.jury[0]?.username as string)).toEqual(
      expect.arrayContaining(['first_vote', 'jury_full', 'golden_ear']),
    )
  })

  await test.step('RF-GAME-04: quien falló la segunda semana tiene el comodín de la temporada gastado y su racha sigue', async () => {
    // Con el reloj dentro de la 2034-T1 (el comodín es el de la temporada en curso).
    const res = await joker.page.request.get('/api/me', {
      headers: { 'x-bb-test-now': String(season.weeks[3]?.startsAt) },
    })
    expect(res.ok(), await res.text()).toBe(true)
    const { game } = (await res.json()).data
    // Juega la 1, la 3 y la 4: la 2 la salva el comodín sin sumar (1, 1, 2, 3).
    expect(game.streak).toEqual({ current: 3, best: 3, jokerAvailable: false })
  })

  await test.step('RF-GAME-01: todo lo escribieron los ganchos en vivo: reprocesar no cambia el XP ni los logros de nadie de la temporada', async () => {
    const everyone = [...season.producers, ...season.jury]
    const snapshot = async () => {
      const out: unknown[] = []
      for (const who of everyone) {
        const me = (await (await who.page.request.get('/api/me', { headers: headers() })).json()).data
        const profile = (
          await (await request.get(`/api/profiles/${who.username}`, { headers: headers() })).json()
        ).data
        out.push([who.username, me.game.xp, me.game.streak, profile.game.achievements])
      }
      return out
    }
    const before = await snapshot()
    // La BD de los E2E es compartida: el resumen es de todas las cuentas; lo que se comprueba es lo de esta temporada.
    const res = await request.post('/api/test/game/reprocess', {
      headers: { origin: base, 'x-bb-test-now': String(clock.api) },
    })
    expect(res.ok(), await res.text()).toBe(true)
    expect((await res.json()).data).toMatchObject({ applied: true })
    expect(await snapshot()).toEqual(before)
  })
})
