import { scheduleWeek as boundaries } from '@beatbattle/rules'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  emailOutbox,
  emailPref,
  emailSubscriber,
  entry,
  result,
  sample,
  sampleDownload,
  streakState,
  vote,
  week,
  xpEvent,
} from '../src/db/schema'
import type { MemoryMailer } from '../src/email/mailer'
import { computeSnapshot } from '../src/modules/results/snapshot'
import { dropMailAt } from '../src/modules/weeks/schedule'
import { type Battle, battle, entryValues, HOUR, W42 } from './fixtures/battle'
import { createSample, scheduleWeek } from './fixtures/weeks'

// Cada prueba crea varias cuentas y recorre el tick: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 30_000 })

/** La capa de juego en los avisos que ya salen (tarea 7.31, guía §2.12.7). */

let b: Battle
afterEach(async () => {
  await b?.t.app.close()
})

/** Lunes 19 a las 08:00 de Madrid: cierra la 42 y abre la 43. */
const MAIL = dropMailAt(boundaries({ year: 2026, month: 10, day: 19 }).startsAt)
/** Sábado 17 a las 18:00 de Madrid. */
const SATURDAY_18 = Date.UTC(2026, 9, 17, 16, 0)

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
/** El `payload` de un aviso encolado para una cuenta. */
async function payloadOf(kind: string, userId: string) {
  const rows = await b.t.db.select().from(emailOutbox).where(eq(emailOutbox.kind, kind))
  const row = rows.find((r) => r.userId === userId)
  return row ? JSON.parse(row.payload) : undefined
}

let serial = 0
async function votes(entryId: string, stars: number[], weekId = b.weekId, voter?: string) {
  for (const s of stars)
    await b.t.db.insert(vote).values({
      userId: voter ?? `v-${++serial}`,
      entryId,
      weekId,
      stars: s,
      createdAt: W42.startsAt,
      updatedAt: W42.startsAt,
    })
}

/** La 43, para que el lunes salga el combinado, y una alerta sin cuenta. */
async function nextWeek() {
  const { id } = await createSample(b.t, { title: 'Niebla en Montjuïc' })
  await scheduleWeek(b.t, '2026-10-19', id)
  await b.t.db.insert(emailSubscriber).values({
    id: 'sub-1',
    email: 'fan@example.com',
    status: 'confirmed',
    createdAt: 1,
    confirmedAt: 1,
  })
  const [w43] = await b.t.db.select().from(week).where(eq(week.slug, '2026-w43'))
  return w43 as typeof week.$inferSelect
}

/** Las semanas 40 y 41, selladas antes de la 42 (que pasa a ser la 3), con una entrada clasificada de cada cuenta. */
async function history(users: { id: string; stars: number[] }[]) {
  const [s] = await b.t.db.select({ id: sample.id }).from(sample)
  await b.t.db.update(week).set({ number: 3 }).where(eq(week.id, b.weekId))
  for (const [number, day, id] of [
    [1, 28, 'w40'],
    [2, 5, 'w41'],
  ] as const) {
    const bounds = boundaries({ year: 2026, month: number === 1 ? 9 : 10, day })
    await b.t.db.insert(week).values({
      id,
      number,
      slug: `2026-${id}`,
      seasonId: '2026-T4',
      sampleId: s?.id as string,
      rulesVersion: 1,
      ...bounds,
      sealedAt: bounds.voteEndsAt,
      resultRevision: 1,
      createdBy: 'test',
      createdAt: 0,
    })
    for (const u of users) {
      const values = entryValues(id, u.id, { submittedAt: bounds.startsAt + 1 })
      await b.t.db.insert(entry).values(values)
      await votes(values.id, u.stars, id)
    }
    const snapshot = await computeSnapshot(b.t.db, id)
    for (const row of snapshot.rows)
      await b.t.db.insert(result).values({
        weekId: id,
        revision: 1,
        entryId: row.entryId,
        position: row.position,
        scoreMilli: row.scoreMilli,
        votes: row.votes,
        meanMilli: row.meanMilli,
        medianHalf: row.medianHalf,
        histogram: JSON.stringify(row.histogram),
        seasonPoints: row.seasonPoints,
      })
  }
}

const LEAKS = [/media/i, /posici[oó]n/i, /\d([.,]\d)? ?\/ ?5\b/]

describe('«tu partida» en el Lunes de batalla (7.31)', () => {
  it('RF-NOTIF-07: el XP del sellado y el oído de oro, y nada de la semana que abre ni del total de la cuenta', async () => {
    // Ocho productores y un jurado (voter0) que vota las ocho como el resto: gana el oído de oro.
    b = await battle({ producers: 8, voters: 1 })
    const juror = b.voters[0] as Battle['voters'][0]
    const pattern = [5, 5, 4, 4, 3, 3, 2, 1]
    for (const [i, p] of b.producers.entries()) {
      const stars = pattern[i] as number
      await votes(p.entryId, [stars, stars, stars])
      await votes(p.entryId, [stars], b.weekId, juror.id)
    }
    const w43 = await nextWeek()
    const prod0 = b.producers[0] as Battle['producers'][0]
    // XP en vivo de la 43, la semana que abre: no entra en «tu partida».
    await b.t.db.insert(xpEvent).values({
      id: 'xp-43',
      userId: prod0.id,
      kind: 'entry',
      ref: w43.id,
      weekId: w43.id,
      amount: 125,
      createdAt: MAIL - 1,
    })

    b.t.clock.set(MAIL)
    expect((await tick()).mondayEmails.monday).toBeGreaterThan(0)
    // 1.º (ex aequo con prod1): 500 de resultado, racha 1 y la semana que viene, +10 %.
    expect((await payloadOf('battle.monday', prod0.id))?.results.game).toEqual({
      xp: 500,
      goldenEarXp: 0,
      streak: 1,
      jokerSaved: false,
      nextBonusPercent: 10,
    })
    // El jurado: solo el oído de oro (75), sin racha.
    expect((await payloadOf('battle.monday', juror.id))?.results.game).toEqual({
      xp: 75,
      goldenEarXp: 75,
      streak: 0,
      jokerSaved: false,
      nextBonusPercent: 0,
    })
    // Quien ni participó ni votó, y la alerta sin cuenta: sin bloque.
    expect((await payloadOf('battle.monday', b.t.admin.id))?.results.game).toBeNull()
    const rows = await b.t.db.select().from(emailOutbox).where(eq(emailOutbox.kind, 'battle.monday'))
    const fan = rows.find((row) => row.subscriberId === 'sub-1')
    expect(JSON.parse(fan?.payload ?? '{}').results.game).toBeNull()

    const mine = mailer().lastTo('prod0@example.com')
    expect(mine?.text).toContain('TU PARTIDA · +500 XP')
    expect(mine?.text).toContain('Racha 1 semana')
    expect(mine?.text).not.toContain('625')
    expect(mailer().lastTo('voter0@example.com')?.text).toContain('Oído de oro +75 XP')
    for (const to of ['jefa@example.com', 'fan@example.com'])
      expect(mailer().lastTo(to)?.text).not.toContain('TU PARTIDA')
  })

  it('RF-NOTIF-07: con racha, el resultado con su bonus y la racha tras el sellado; el comodín que la salvó; también en battle.results', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const me = b.producers[0] as Battle['producers'][0]
    const rival = b.voters[0] as Battle['voters'][0]
    await history([
      { id: me.id, stars: [4, 4, 5] },
      { id: rival.id, stars: [3, 3, 3] },
    ])
    // La racha guardada del rival tras la 41; en la 42 no participa.
    await b.t.db
      .insert(streakState)
      .values({ userId: rival.id, current: 2, best: 2, lastWeekNumber: 2, jokerSeason: null })
    await votes(me.entryId, [5, 5, 4])
    await nextWeek()
    await b.t.db.update(emailPref).set({ mondayFormat: 'separate' }).where(eq(emailPref.userId, me.id))

    b.t.clock.set(MAIL)
    await tick()
    // 1.º con racha en juego 3: 500 · 1,2 = 600; racha 3 y la siguiente, +30 %. En los resultados aparte.
    expect((await payloadOf('battle.results', me.id))?.game).toEqual({
      xp: 600,
      goldenEarXp: 0,
      streak: 3,
      jokerSaved: false,
      nextBonusPercent: 30,
    })
    expect(
      mailer().sent.find((m) => m.to === 'prod0@example.com' && m.subject.startsWith('Semana'))?.text,
    ).toContain('TU PARTIDA · +600 XP')
    // El rival, sin entrada: el comodín de la temporada salvó su racha de 2.
    expect((await payloadOf('battle.monday', rival.id))?.results.game).toEqual({
      xp: 0,
      goldenEarXp: 0,
      streak: 2,
      jokerSaved: true,
      nextBonusPercent: 20,
    })
    expect(mailer().lastTo('voter0@example.com')?.text).toContain('Racha 2 semanas · salvada por el comodín')
  })
})

describe('battle.reminder, «racha en peligro» (7.31)', () => {
  it('RF-NOTIF-13: con racha ≥ 3 hasta la semana anterior sale la versión de racha, con el comodín o sin él; sin nada de la semana en juego', async () => {
    b = await battle({ producers: 2, voters: 4 })
    await b.t.db.update(week).set({ number: 6 }).where(eq(week.id, b.weekId))
    const [w42] = await b.t.db.select().from(week).where(eq(week.id, b.weekId))
    const [fresh, spent, short, stale] = b.voters as [
      Battle['voters'][0],
      Battle['voters'][0],
      Battle['voters'][0],
      Battle['voters'][0],
    ]
    await b.t.db.insert(streakState).values([
      { userId: fresh.id, current: 5, best: 5, lastWeekNumber: 5, jokerSeason: null },
      { userId: spent.id, current: 4, best: 4, lastWeekNumber: 5, jokerSeason: w42?.seasonId as string },
      { userId: short.id, current: 2, best: 2, lastWeekNumber: 5, jokerSeason: null },
      // Guardada hace semanas: no está en juego (las selladas que faltan la habrían roto o salvado).
      { userId: stale.id, current: 6, best: 6, lastWeekNumber: 3, jokerSeason: null },
    ])
    for (const voter of b.voters)
      await b.t.db.insert(sampleDownload).values({
        userId: voter.id,
        weekId: b.weekId,
        kind: 'original',
        count: 1,
        firstAt: W42.startsAt + HOUR,
        lastAt: W42.startsAt + HOUR,
      })
    // Votos a la semana en juego: no salen en ningún recordatorio.
    await votes(b.producers[0]?.entryId as string, [5, 4, 5, 3, 5])

    b.t.clock.set(SATURDAY_18)
    expect((await tick()).battleNotices.reminders).toBe(4)
    expect((await payloadOf('battle.reminder', fresh.id))?.streak).toEqual({
      weeks: 5,
      jokerAvailable: true,
      bonusPercent: 50,
    })
    expect((await payloadOf('battle.reminder', spent.id))?.streak).toEqual({
      weeks: 4,
      jokerAvailable: false,
      bonusPercent: 40,
    })
    expect((await payloadOf('battle.reminder', short.id))?.streak).toBeNull()
    expect((await payloadOf('battle.reminder', stale.id))?.streak).toBeNull()

    const subjects = Object.fromEntries(
      ['voter0', 'voter1', 'voter2', 'voter3'].map((n) => [n, mailer().lastTo(`${n}@example.com`)?.subject]),
    )
    expect(subjects).toEqual({
      voter0: 'Tu racha de 5 semanas está en juego',
      voter1: 'Tu racha de 4 semanas está en juego',
      voter2: 'Te quedan ~26 h para subir tu flip',
      voter3: 'Te quedan ~26 h para subir tu flip',
    })
    expect(mailer().lastTo('voter1@example.com')?.text).toContain('Ya gastaste el comodín de esta temporada')
    const others = b.producers.flatMap((p, i) => [p.id, `prod${i}`, `prod${i}@example.com`, p.entryId])
    for (const n of ['voter0', 'voter1']) {
      const mail = mailer().lastTo(`${n}@example.com`)
      const content = `${mail?.subject}\n${mail?.html}\n${mail?.text}`
      for (const trace of others) expect(content.includes(trace), trace).toBe(false)
      for (const leak of [...LEAKS, /puntuaci[oó]n/i, /\d+ votos?\b/i])
        expect(`${mail?.subject}\n${mail?.text}`, String(leak)).not.toMatch(leak)
    }
  })
})
