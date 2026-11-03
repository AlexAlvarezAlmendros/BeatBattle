import { ACHIEVEMENT_COPY, RANK_NAMES } from '@beatbattle/emails'
import { ACHIEVEMENT_IDS, RANK_LADDER } from '@beatbattle/rules'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { achievementUnlock, emailOutbox, emailPref, vote, xpEvent } from '../src/db/schema'
import type { MemoryMailer } from '../src/email/mailer'
import { progressWindow } from '../src/modules/game/progress'
import { type Battle, battle, HOUR } from './fixtures/battle'

// Cada prueba crea varias cuentas y recorre el tick: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 30_000 })

/** `game.progress`, el progreso del día (tarea 7.29, guía §2.12.7). */

let b: Battle
afterEach(async () => {
  await b?.t.app.close()
})

/** Martes 13 y lunes 19 de octubre de 2026 a las 19:00 de Madrid (UTC+2). */
const TUESDAY_19 = Date.UTC(2026, 9, 13, 17, 0)
const MONDAY_19 = Date.UTC(2026, 9, 19, 17, 0)

const mailer = () => b.t.app.email.mailer as MemoryMailer
const tick = async () => {
  const res = await b.t.app.inject({
    method: 'GET',
    url: '/api/cron/tick',
    headers: { authorization: 'Bearer cron-secret-de-prueba-0123456789abcdef' },
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json().data
}
const progressRows = () => b.t.db.select().from(emailOutbox).where(eq(emailOutbox.kind, 'game.progress'))
/** Los `game.progress` enviados a una dirección (el `id` del email es el de su fila de la cola). */
const progressTo = async (to: string) => {
  const ids = new Set((await progressRows()).map((row) => row.id))
  return mailer().sent.filter((mail) => mail.to === to && ids.has(mail.id))
}

let serial = 0
/** Un movimiento del libro escrito a mano (lo que dejaría un gancho), con su semana o sin ella. */
const xp = (userId: string, amount: number, at: number, weekId: string | null = null) =>
  b.t.db.insert(xpEvent).values({
    id: `xp-${++serial}`,
    userId,
    kind: 'producer_guess',
    ref: `ref-${serial}`,
    weekId,
    amount,
    createdAt: at,
  })
/** Un logro con su XP, como lo deja `unlockStatements`. */
async function unlock(
  userId: string,
  achievementId: string,
  at: number,
  weekId: string | null,
  amount: number,
) {
  await b.t.db.insert(achievementUnlock).values({ userId, achievementId, ref: null, weekId, unlockedAt: at })
  await b.t.db.insert(xpEvent).values({
    id: `xp-${++serial}`,
    userId,
    kind: 'achievement',
    ref: achievementId,
    weekId,
    amount,
    createdAt: at,
  })
}

describe('el tramo del día (§2.12.7)', () => {
  it('de las 19:00 del día anterior (exclusivo) a las 19:00 (incluido), también el día del cambio de hora', () => {
    expect(progressWindow(TUESDAY_19)).toEqual({
      day: { year: 2026, month: 10, day: 13 },
      key: '2026-10-13',
      start: TUESDAY_19 - 24 * HOUR,
      end: TUESDAY_19,
    })
    // Un instante antes de las 19:00, todavía el tramo que cerró ayer.
    expect(progressWindow(TUESDAY_19 - 1).key).toBe('2026-10-12')
    // A la 01:00 del miércoles, el del martes.
    expect(progressWindow(TUESDAY_19 + 6 * HOUR).key).toBe('2026-10-13')
    // El domingo 25 de octubre la hora vuelve atrás: el tramo dura 25 h (de las 17:00 a las 18:00 UTC).
    const dst = progressWindow(Date.UTC(2026, 9, 25, 18, 0))
    expect(dst).toMatchObject({ key: '2026-10-25', start: Date.UTC(2026, 9, 24, 17, 0) })
    expect(dst.end - dst.start).toBe(25 * HOUR)
  })

  it('las plantillas tienen el nombre de cada rango y el nombre y la condición de cada logro', () => {
    for (const step of RANK_LADDER) expect(RANK_NAMES[step.id], step.id).toBeTruthy()
    for (const id of ACHIEVEMENT_IDS) {
      expect(ACHIEVEMENT_COPY[id]?.name, id).toBeTruthy()
      expect(ACHIEVEMENT_COPY[id]?.condition, id).toBeTruthy()
    }
    expect(Object.keys(ACHIEVEMENT_COPY).sort()).toEqual([...ACHIEVEMENT_IDS].sort())
  })
})

describe('game.progress (7.29)', () => {
  it('RF-NOTIF-02: a las 19:00, un solo email con la subida de rango y el logro épico del sellado; repetir el tick no duplica', async () => {
    b = await battle({ producers: 3, voters: 1 })
    const [first, second, third] = b.producers.map((p) => p.entryId) as [string, string, string]
    const ballots: [string, string, number][] = [
      ['x1', first, 5],
      ['x2', first, 5],
      ['x3', first, 5],
      ['x1', second, 3],
      ['x2', second, 3],
      ['x3', second, 3],
      ['x1', third, 2],
    ]
    for (const [userId, entryId, stars] of ballots)
      await b.t.db
        .insert(vote)
        .values({ userId, entryId, weekId: b.weekId, stars, createdAt: 1, updatedAt: 1 })
    b.t.clock.set(MONDAY_19 - 1)
    // Sellada en este tick (el lunes antes de las 19:00): cuenta en el tramo de hoy, que aún no ha cerrado.
    expect(await tick()).toMatchObject({ sealed: ['2026-w42'], progressEmails: 0 })
    b.t.clock.set(MONDAY_19)
    expect((await tick()).progressEmails).toBe(1)
    expect((await tick()).progressEmails).toBe(1) // reintentado, no duplica
    const rows = await progressRows()
    const prod0 = b.producers[0] as Battle['producers'][0]
    expect(rows.map((row) => [row.userId, row.idempotencyKey])).toEqual([
      [prod0.id, `game.progress:${prod0.id}:2026-10-19`],
    ])
    // 1.º: 500 de resultado, 75 de podium y 150 de win = 725 XP, nivel 3, Loopero. El 2.º (425 XP) sigue en su rango y
    // podium es raro: nada para él.
    expect(JSON.parse(rows[0]?.payload ?? '{}')).toEqual({
      dayText: 'lunes 19 de octubre',
      username: 'prod0',
      rank: { from: 'crateDigger', to: 'looper', level: 3, next: { to: 'sampler', level: 5 } },
      achievements: [{ id: 'win', rarity: 'epic', xp: 150 }],
    })
    const [mail] = await progressTo('prod0@example.com')
    expect(mail?.subject).toBe('Nuevo rango: Loopero y 1 logro')
    expect(mail?.text).toMatch(/Disco de oro/i)
    expect(mail?.text).toContain('/p/prod0')
    expect(mail?.unsubscribeUrl).toContain('/api/unsubscribe/one-click?token=')
    expect(await progressTo('prod1@example.com')).toEqual([])

    // Al día siguiente, el tramo es otro y ya no hay nada.
    b.t.clock.set(MONDAY_19 + 24 * HOUR)
    expect((await tick()).progressEmails).toBe(0)
    expect(await progressRows()).toHaveLength(1)
  })

  it('RF-NOTIF-13: lo ganado en la semana en juego no cuenta hasta su sellado; lo que no tiene semana, el mismo día', async () => {
    b = await battle({ producers: 2, voters: 0 })
    const [me, rival] = b.producers as [Battle['producers'][0], Battle['producers'][0]]
    const tuesday = TUESDAY_19 - 7 * HOUR
    // En la 42, en pleno voto ciego: lo de subir (900 XP) y Cajón dorado. Y, sin semana, Metrónomo humano.
    await xp(me.id, 900, tuesday, b.weekId)
    await unlock(me.id, 'golden_week', tuesday, b.weekId, 150)
    await unlock(me.id, 'human_metronome', tuesday + HOUR, null, 150)

    b.t.clock.set(TUESDAY_19)
    expect((await tick()).progressEmails).toBe(1)
    const [row] = await progressRows()
    // Solo lo que no tiene semana: 150 XP no cambian de rango, y nada de Cajón dorado ni de la subida.
    expect(JSON.parse(row?.payload ?? '{}')).toMatchObject({
      rank: null,
      achievements: [{ id: 'human_metronome', rarity: 'epic', xp: 150 }],
    })
    const [tuesdayMail] = await progressTo('prod0@example.com')
    expect(tuesdayMail?.subject).toBe('Logro desbloqueado: Metrónomo humano')
    const others = [rival.id, 'prod1', 'prod1@example.com', rival.entryId]
    const content = `${tuesdayMail?.subject}\n${tuesdayMail?.html}\n${tuesdayMail?.text}`
    for (const trace of [...others, 'Cajón dorado', 'Loopero', 'Nuevo rango'])
      expect(content.includes(trace), trace).toBe(false)
    for (const leak of [/media/i, /puntuaci[oó]n/i, /posici[oó]n/i, /\d+ votos?\b/i, /\d([.,]\d)? ?\/ ?5\b/])
      expect(content, String(leak)).not.toMatch(leak)

    // El lunes siguiente se sella la 42 (sin votos: sin clasificar) y llega todo lo suyo junto: 1.050 XP, Loopero.
    b.t.clock.set(MONDAY_19 - 10 * HOUR)
    expect((await tick()).sealed).toEqual(['2026-w42'])
    b.t.clock.set(MONDAY_19)
    expect((await tick()).progressEmails).toBe(1)
    const monday = (await progressRows()).find((r) => r.idempotencyKey.endsWith('2026-10-19'))
    expect(JSON.parse(monday?.payload ?? '{}')).toMatchObject({
      rank: { from: 'crateDigger', to: 'looper', level: 4 },
      achievements: [{ id: 'golden_week', rarity: 'epic', xp: 150 }],
    })
  })

  it('RF-NOTIF-08: con el aviso apagado queda `skipped` (`pref_off`); ni un logro raro ni bajar de rango avisan', async () => {
    b = await battle({ producers: 3, voters: 0 })
    const [off, rare, down] = b.producers as [
      Battle['producers'][0],
      Battle['producers'][0],
      Battle['producers'][0],
    ]
    const today = TUESDAY_19 - 2 * HOUR
    await b.t.db.update(emailPref).set({ progressOn: false }).where(eq(emailPref.userId, off.id))
    await unlock(off.id, 'level_20', today, null, 300)
    await unlock(rare.id, 'votes_100', today, null, 75)
    // 500 XP de hace dos días (Loopero) y hoy un ajuste de −100 (vuelve a Excavador de cajones).
    await xp(down.id, 500, today - 48 * HOUR)
    await xp(down.id, -100, today)

    b.t.clock.set(TUESDAY_19)
    const out = await tick()
    expect(out.progressEmails).toBe(1)
    const [row] = await progressRows()
    expect(row).toMatchObject({ userId: off.id, status: 'skipped', skipReason: 'pref_off' })
    expect(await progressTo('prod0@example.com')).toEqual([])
  })

  it('RF-NOTIF-08: si el primer tick de la tarde llega a las 23:30, se encola pero espera a las 08:00 (horas de silencio)', async () => {
    b = await battle({ producers: 1, voters: 0 })
    const me = b.producers[0] as Battle['producers'][0]
    await unlock(me.id, 'votes_1000', TUESDAY_19 - HOUR, null, 150)
    b.t.clock.set(TUESDAY_19 + 4.5 * HOUR)
    expect((await tick()).progressEmails).toBe(1)
    expect((await progressRows())[0]).toMatchObject({ status: 'queued' })
    expect(await progressTo('prod0@example.com')).toEqual([])
    // A las 08:00 del miércoles sale (con la clave del martes: es el progreso del martes).
    b.t.clock.set(TUESDAY_19 + 13 * HOUR)
    await tick()
    expect((await progressRows()).map((r) => [r.idempotencyKey.slice(-10), r.status])).toEqual([
      ['2026-10-13', 'sent'],
    ])
    expect((await progressTo('prod0@example.com')).map((m) => m.subject)).toEqual([
      'Logro desbloqueado: Juez supremo',
    ])
  })
})
