import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { emailOutbox, entry, sampleDownload, vote } from '../src/db/schema'
import type { MemoryMailer } from '../src/email/mailer'
import { type Battle, battle, HOUR, listener, W42 } from './fixtures/battle'

/** Avisos de la batalla (tarea 5.12): primeros votos, recordatorio y llamada al jurado. */

let b: Battle
afterEach(async () => {
  await b?.t.app.close()
})

const SECRET = 'cron-secret-de-prueba-0123456789abcdef'
/** Sábado 17 a las 18:00 y domingo 18 a las 17:00 en Madrid (UTC+2). */
const SATURDAY_18 = Date.UTC(2026, 9, 17, 16, 0)
const SUNDAY_17 = Date.UTC(2026, 9, 18, 15, 0)

const tick = async () => {
  const res = await b.t.app.inject({
    method: 'GET',
    url: '/api/cron/tick',
    headers: { authorization: `Bearer ${SECRET}` },
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json().data
}
const queued = async (kind: string) => b.t.db.select().from(emailOutbox).where(eq(emailOutbox.kind, kind))
const mailer = () => b.t.app.email.mailer as MemoryMailer

async function votesFrom(count: number, target: string) {
  for (const voter of b.voters.slice(0, count)) {
    const ear = listener(b.t, voter.cookie)
    await ear.ready(target)
    expect((await ear.vote(target, 3)).statusCode).toBe(200)
  }
}

describe('battle.first_votes (§2.12)', () => {
  it('RF-NOTIF-13: al quinto voto, un aviso al dueño con el número de votos y de escuchas, sin media; una vez', async () => {
    b = await battle({ producers: 1, voters: 6 })
    const own = b.producers[0] as Battle['producers'][0]
    await b.t.db.update(entry).set({ playCount: 23 }).where(eq(entry.id, own.entryId))
    await votesFrom(4, own.entryId)
    expect(await queued('battle.first_votes')).toEqual([])
    await votesFrom(5, own.entryId) // los 4 primeros cambian su voto; el 5.º es nuevo
    const rows = await queued('battle.first_votes')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.userId).toBe(own.id)
    expect(JSON.parse(rows[0]?.payload ?? '{}')).toMatchObject({ votes: 5, plays: 23 })
    // Quitar y volver a poner un voto no lo repite.
    const fifth = listener(b.t, b.voters[4]?.cookie as string)
    await fifth.unvote(own.entryId)
    await fifth.vote(own.entryId, 4)
    expect(await queued('battle.first_votes')).toHaveLength(1)

    // A la 01:00 el aviso se retiene (horas de silencio); a mediodía, sale.
    b.t.clock.set(W42.startsAt + 12 * HOUR)
    await tick()
    const sent = mailer().lastTo('prod0@example.com')
    expect(sent?.subject).toBe('Tu beat ya suena: 5 votos')
    expect(sent?.text).toContain('5 votos y 23 escuchas')
    for (const leak of [/media/i, /puntuaci[oó]n/i, /posici[oó]n/i, /\d([.,]\d)? ?\/ ?5/, /estrellas/i])
      expect(`${sent?.html}\n${sent?.text}`, String(leak)).not.toMatch(leak)
  })
})

describe('battle.reminder y battle.jury_call (§2.12, §4.12)', () => {
  it('battle.reminder: el sábado a las 18:00, a quien descargó el sample y no ha subido; una vez', async () => {
    b = await battle({ producers: 1, voters: 2 })
    const [waiting, never] = b.voters as [Battle['voters'][0], Battle['voters'][0]]
    const own = b.producers[0] as Battle['producers'][0]
    const download = (userId: string) => ({
      userId,
      weekId: b.weekId,
      kind: 'original' as const,
      count: 1,
      firstAt: W42.startsAt + HOUR,
      lastAt: W42.startsAt + HOUR,
    })
    await b.t.db.insert(sampleDownload).values([download(waiting.id), download(own.id)])
    b.t.clock.set(SATURDAY_18 - 1)
    expect((await tick()).battleNotices).toEqual({ reminders: 0, juryCalls: 0 })
    b.t.clock.set(SATURDAY_18)
    expect((await tick()).battleNotices.reminders).toBe(1)
    expect((await tick()).battleNotices.reminders).toBe(1) // reintentado, no duplica
    const rows = await queued('battle.reminder')
    expect(rows.map((row) => row.userId)).toEqual([waiting.id])
    expect(rows.map((row) => row.userId)).not.toContain(never.id)
    const sent = mailer().lastTo('voter0@example.com')
    expect(sent?.subject).toBe('Te quedan ~26 h para subir tu flip')
    expect(sent?.html).toContain('/api/email/countdown/2026-w42.gif')
  })

  it('battle.jury_call: el domingo a las 17:00, a quien ha votado y le quedan ≥ 3 por escuchar', async () => {
    b = await battle({ producers: 5, voters: 2 })
    const [eager, almost] = b.voters as [Battle['voters'][0], Battle['voters'][0]]
    const entries = b.producers.map((p) => p.entryId)
    // `eager` vota 1 (le quedan 4); `almost`, 3 (le quedan 2); los productores no votan.
    const one = listener(b.t, eager.cookie)
    await one.ready(entries[0] as string)
    await one.vote(entries[0] as string, 4)
    const many = listener(b.t, almost.cookie)
    for (const id of entries.slice(0, 3)) {
      await many.ready(id)
      await many.vote(id, 2)
    }
    b.t.clock.set(SUNDAY_17)
    expect((await tick()).battleNotices.juryCalls).toBe(1)
    const rows = await queued('battle.jury_call')
    expect(rows.map((row) => row.userId)).toEqual([eager.id])
    expect(JSON.parse(rows[0]?.payload ?? '{}')).toMatchObject({
      remaining: 4,
      closesText: 'domingo 18 de octubre a las 23:59',
    })
    const sent = mailer().lastTo('voter0@example.com')
    expect(sent?.subject).toBe('Te quedan 4 beats por escuchar')
    expect(sent?.html).toContain('/api/email/countdown/2026-w42.votes.gif')
  })

  it('RF-NOTIF-13: ningún aviso de la semana sin sellar lleva autoría, medias ni posiciones', async () => {
    b = await battle({ producers: 4, voters: 5 })
    const target = b.producers[0]?.entryId as string
    await votesFrom(5, target)
    for (const voter of b.voters)
      await b.t.db.insert(sampleDownload).values({
        userId: voter.id,
        weekId: b.weekId,
        kind: 'original',
        count: 1,
        firstAt: W42.startsAt,
        lastAt: W42.startsAt,
      })
    b.t.clock.set(SATURDAY_18)
    await tick()
    b.t.clock.set(SUNDAY_17)
    await tick()
    const sent = mailer().sent.filter((mail) => /votos|beats|flip/.test(mail.subject))
    expect(sent.length).toBeGreaterThanOrEqual(3)
    const others = b.producers.slice(1).flatMap((p, i) => [p.id, `prod${i + 1}`, `prod${i + 1}@example.com`])
    for (const mail of sent) {
      const content = `${mail.subject}\n${mail.html}\n${mail.text}`
      for (const trace of others)
        expect(content.includes(trace), `${mail.subject} lleva ${trace}`).toBe(false)
      for (const leak of [/media/i, /puntuaci[oó]n/i, /posici[oó]n/i, /\d([.,]\d)? ?\/ ?5\b/])
        expect(content, `${mail.subject} ${leak}`).not.toMatch(leak)
    }
    expect(await b.t.db.select().from(vote)).toHaveLength(5)
  })

  it('la cuenta atrás de votos (`.votes.gif`) apunta al cierre de votos aunque los envíos sigan abiertos', async () => {
    b = await battle({ producers: 0, voters: 0 })
    const gif = async (file: string) =>
      (await b.t.app.inject({ method: 'GET', url: `/api/email/countdown/${file}` })).rawPayload
    const submit = await gif('2026-w42.gif')
    const votes = await gif('2026-w42.votes.gif')
    expect(Buffer.compare(submit, votes)).not.toBe(0)
  })
})
