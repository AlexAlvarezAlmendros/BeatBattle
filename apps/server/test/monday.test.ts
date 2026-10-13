import { scheduleWeek as boundaries } from '@beatbattle/rules'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emailOutbox, emailPref, emailSubscriber, jobLease, vote, week } from '../src/db/schema'
import type { MemoryMailer } from '../src/email/mailer'
import { RESULTS_WAIT_MS } from '../src/modules/results/monday'
import { dropMailAt } from '../src/modules/weeks/schedule'
import { type Battle, battle, HOUR } from './fixtures/battle'
import { createSample, scheduleWeek } from './fixtures/weeks'

// Cada prueba crea varias cuentas y recorre el tick: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 30_000 })

/** Lunes de batalla (tarea 6.9, §2.12.2). */

const W43 = boundaries({ year: 2026, month: 10, day: 19 })
/** Lunes 19 a las 08:00 de Madrid: cierra la 42 y abre la 43. */
const MAIL = dropMailAt(W43.startsAt)

let b: Battle
afterEach(async () => {
  await b?.t.app.close()
})

const mailer = () => b.t.app.email.mailer as MemoryMailer
const tick = async () =>
  (
    await b.t.app.inject({
      method: 'GET',
      url: '/api/cron/tick',
      headers: { authorization: 'Bearer cron-secret-de-prueba-0123456789abcdef' },
    })
  ).json().data
/** Los asuntos del lunes que ha recibido una dirección (sin el de verificar la cuenta). */
const subjectsTo = (to: string) =>
  mailer()
    .sent.filter((mail) => mail.to === to && !mail.subject.startsWith('Confirma'))
    .map((mail) => mail.subject)

/**
 * La 42 con tres productores y un jurado (voter0), votos para que prod0 gane, y la 43 programada; una alerta
 * confirmada sin cuenta.
 */
async function mondayBattle() {
  b = await battle({ producers: 3, voters: 1 })
  const [first, second, third] = b.producers.map((p) => p.entryId) as [string, string, string]
  const voter = b.voters[0] as Battle['voters'][0]
  const ballots: [string, string, number][] = [
    [voter.id, first, 5],
    ['x1', first, 5],
    ['x2', first, 5],
    ['x1', second, 3],
    ['x2', second, 3],
    ['x3', second, 3],
    ['x1', third, 2],
  ]
  for (const [userId, entryId, stars] of ballots)
    await b.t.db.insert(vote).values({ userId, entryId, weekId: b.weekId, stars, createdAt: 1, updatedAt: 1 })
  const { id } = await createSample(b.t, { title: 'Niebla en Montjuïc' })
  await scheduleWeek(b.t, '2026-10-19', id)
  await b.t.db.insert(emailSubscriber).values({
    id: 'sub-1',
    email: 'fan@example.com',
    status: 'confirmed',
    createdAt: 1,
    confirmedAt: 1,
  })
  return { voter }
}

describe('Lunes de batalla (6.9)', () => {
  it('RF-NOTIF-07: combinado por defecto: resultado personal o podio + drop, en un email, sin duplicar', async () => {
    await mondayBattle()
    b.t.clock.set(MAIL - 1)
    // Sellada desde el cierre (el lunes a las 00:00), pero el email espera a las 08:00.
    expect(await tick()).toMatchObject({
      sealed: ['2026-w42'],
      mondayEmails: { monday: 0, drop: 0, results: 0 },
    })
    b.t.clock.set(MAIL)
    const first = await tick()
    // jefa, prod0..2, voter0 y la alerta sin cuenta.
    expect(first.mondayEmails).toEqual({ monday: 6, drop: 0, results: 0 })
    await tick()

    expect(subjectsTo('prod0@example.com')).toEqual(['1.º en la #1 · Nuevo drop: Niebla en Montjuïc'])
    expect(subjectsTo('prod2@example.com')).toEqual(['Ya hay campeón · Nuevo drop: Niebla en Montjuïc'])
    expect(subjectsTo('voter0@example.com')).toEqual(['Ya hay campeón · Nuevo drop: Niebla en Montjuïc'])
    const prod0 = b.producers[0] as Battle['producers'][0]
    const mine = mailer().lastTo('prod0@example.com')
    expect(mine?.html).toContain(`/api/og/result/2026-w42/${prod0.id}?sig=`)
    expect(mine?.html).toContain('/api/email/countdown/2026-w43.gif')
    // La alerta sin cuenta: el podio, sin parte personal, y la invitación a crear cuenta.
    const fan = mailer().lastTo('fan@example.com')
    expect(fan?.subject).toBe('Ya hay campeón · Nuevo drop: Niebla en Montjuïc')
    expect(fan?.html).not.toContain('/api/og/result/')
    expect(fan?.text).toContain('crea la tuya')

    // Prioridad: participantes, jurado, resto de cuentas, suscriptores (§2.12.2).
    const rows = await b.t.db.select().from(emailOutbox).where(eq(emailOutbox.kind, 'battle.monday'))
    const priorityOf = (key: string) => rows.find((row) => row.idempotencyKey.includes(key))?.priority
    expect(priorityOf(prod0.id)).toBe(10)
    expect(priorityOf((b.voters[0] as Battle['voters'][0]).id)).toBe(11)
    expect(priorityOf(b.t.admin.id)).toBe(12)
    expect(priorityOf('subscriber:sub-1')).toBe(13)
  })

  it('RF-NOTIF-07: separado si se elige: el drop y, a quien participó o votó, los resultados aparte', async () => {
    const { voter } = await mondayBattle()
    const prod1 = b.producers[1] as Battle['producers'][0]
    for (const userId of [prod1.id, voter.id, b.t.admin.id])
      await b.t.db.update(emailPref).set({ mondayFormat: 'separate' }).where(eq(emailPref.userId, userId))
    b.t.clock.set(MAIL)
    expect((await tick()).mondayEmails).toEqual({ monday: 3, drop: 3, results: 2 })
    expect(subjectsTo('prod1@example.com').sort()).toEqual([
      'Nuevo drop: Niebla en Montjuïc · 92 BPM · Re menor',
      'Semana #1: has quedado 2.º',
    ])
    expect(subjectsTo('voter0@example.com').sort()).toEqual([
      'Nuevo drop: Niebla en Montjuïc · 92 BPM · Re menor',
      'Ya hay campeón de la semana #1',
    ])
    // Quien ni participó ni votó, solo el drop.
    expect(subjectsTo('jefa@example.com')).toEqual(['Nuevo drop: Niebla en Montjuïc · 92 BPM · Re menor'])
  })

  it('RF-NOTIF-07: sin sellar a las 08:00, el combinado espera hasta 2 h; después sale el drop solo y los resultados al sellar', async () => {
    await mondayBattle()
    // Otro proceso tiene el sellado bloqueado (como un sellado que falla).
    await b.t.db
      .insert(jobLease)
      .values({ name: `seal:${b.weekId}`, holder: 'otro', expiresAt: MAIL + RESULTS_WAIT_MS + HOUR })
    b.t.clock.set(MAIL)
    expect(await tick()).toMatchObject({ sealed: [], mondayEmails: { monday: 0, drop: 0, results: 0 } })
    b.t.clock.set(MAIL + RESULTS_WAIT_MS - 1)
    expect((await tick()).mondayEmails).toEqual({ monday: 0, drop: 0, results: 0 })

    b.t.clock.set(MAIL + RESULTS_WAIT_MS)
    expect((await tick()).mondayEmails).toEqual({ monday: 0, drop: 6, results: 0 })
    // Nada de la 42 sin sellar (`RF-NOTIF-13`).
    for (const mail of mailer().sent) {
      expect(mail.text).not.toMatch(/Flip \d|Alias \d|resultados/i)
      expect(mail.html).not.toContain('/api/og/result/')
    }

    await b.t.db.delete(jobLease).where(eq(jobLease.name, `seal:${b.weekId}`))
    b.t.clock.set(MAIL + RESULTS_WAIT_MS + HOUR + 1)
    const late = await tick()
    expect(late.sealed).toEqual(['2026-w42'])
    expect(late.mondayEmails).toEqual({ monday: 0, drop: 6, results: 4 })
    expect(subjectsTo('prod0@example.com')).toEqual([
      'Nuevo drop: Niebla en Montjuïc · 92 BPM · Re menor',
      'Semana #1: has quedado 1.º',
    ])
    expect(subjectsTo('jefa@example.com')).toEqual(['Nuevo drop: Niebla en Montjuïc · 92 BPM · Re menor'])
    expect(subjectsTo('fan@example.com')).toEqual(['Nuevo drop: Niebla en Montjuïc · 92 BPM · Re menor'])
    const [w] = await b.t.db.select().from(week).where(eq(week.id, b.weekId))
    expect(w?.sealedAt).toBe(MAIL + RESULTS_WAIT_MS + HOUR + 1)
  })

  it('RF-NOTIF-07: con el sellado a tiempo pero tras las 08:00, el combinado sale al sellar', async () => {
    await mondayBattle()
    await b.t.db.insert(jobLease).values({ name: `seal:${b.weekId}`, holder: 'otro', expiresAt: MAIL + HOUR })
    b.t.clock.set(MAIL)
    expect((await tick()).mondayEmails).toEqual({ monday: 0, drop: 0, results: 0 })
    b.t.clock.set(MAIL + HOUR)
    expect((await tick()).mondayEmails).toEqual({ monday: 6, drop: 0, results: 0 })
  })
})
