import type { SeasonWrapPayload } from '@beatbattle/emails'
import { addDays, scheduleWeek, seasonEndsAt, seasonOf, weekSlug, zonedInstant } from '@beatbattle/rules'
import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { achievementUnlock, emailOutbox, emailPref, entry, sample, vote, week } from '../src/db/schema'
import type { MemoryMailer } from '../src/email/mailer'
import { sealWeek } from '../src/modules/weeks/seal'
import { entryValues } from './fixtures/battle'
import { type SimSeason, simSeason } from './fixtures/season'
import { createAccount } from './helpers'

// Cada prueba sella una temporada entera con el tick: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 90_000 })

/**
 * `season.wrap`, «Tu T4 de 2026 en cifras» (guía §2.12.7, Anexo H; tarea 7.30, `RF-NOTIF-15`): en el `batch` que cierra
 * la temporada, a quien participó o votó en ella, una vez, y sin nada de la temporada siguiente.
 */

let s: SimSeason
afterEach(async () => {
  await s?.t.app.close()
})

/** A gana las 7 primeras y B las demás; C, siempre 3.º. */
const aThenB = (w: number, producer: number): number[] => {
  const first = w < 7 ? 0 : 1
  if (producer === first) return [5, 5, 5]
  if (producer === 2) return [3, 3, 3]
  return [4, 4, 4]
}

const wraps = async () =>
  (await s.t.db.select().from(emailOutbox).where(eq(emailOutbox.kind, 'season.wrap')))
    .map((row) => ({ ...row, data: JSON.parse(row.payload) as SeasonWrapPayload }))
    .sort((a, b) => (a.data.username ?? '').localeCompare(b.data.username ?? ''))
const mailer = () => s.t.app.email.mailer as MemoryMailer

/** Un jurado con cuenta que vota las entradas de A, B y C en las semanas `weeks` (índices). */
async function juror(weeks: number[]) {
  const who = await createAccount(s.t, { email: 'oido@example.com', username: 'oido.fino' })
  for (const w of weeks) {
    const sim = s.weeks[w] as SimSeason['weeks'][0]
    for (const entryId of s.entries.get(sim.id)?.values() ?? [])
      await s.t.db.insert(vote).values({
        userId: who.id,
        entryId,
        weekId: sim.id,
        stars: 4,
        createdAt: sim.startsAt,
        updatedAt: sim.startsAt,
      })
  }
  return who
}

describe('season.wrap (7.30, §2.12.7)', () => {
  it('RF-NOTIF-15 / RF-NOTIF-02: al cerrar una temporada de 13 semanas, el resumen a quien participó o votó, en el batch del sellado y una vez', async () => {
    s = await simSeason({ count: 13, stars: aThenB })
    const [a, b, c] = s.producers as [
      SimSeason['producers'][0],
      SimSeason['producers'][0],
      SimSeason['producers'][0],
    ]
    const oido = await juror([0, 1, 2])
    for (const w of s.weeks.slice(0, 12)) await s.tick(w.voteEndsAt)
    expect(await wraps()).toEqual([])

    // El sellado de la del último lunes cierra la temporada: en su mismo batch, un resumen por cuenta.
    const last = s.weeks[12] as SimSeason['weeks'][0]
    expect(await sealWeek(s.t.db, { weekId: last.id, now: last.voteEndsAt, holder: 'lectura' })).toBe(true)
    const rows = await wraps()
    expect(rows.map((row) => row.userId).sort()).toEqual([oido, a, b, c].map((who) => who.id).sort())
    for (const row of rows) {
      expect(row.idempotencyKey).toBe(`season.wrap:user:${row.userId}:2026-T4`)
      expect([row.family, row.status, row.priority]).toEqual(['battle', 'queued', 60])
    }
    const byName: Record<string, SeasonWrapPayload> = Object.fromEntries(
      rows.map((row) => [row.data.username ?? row.userId, row.data]),
    )
    expect(byName.prod0).toMatchObject({
      seasonId: '2026-T4',
      standing: { position: 1, total: 3, points: 7 * 25 + 6 * 18, wins: 7, podiums: 13 },
      champions: ['prod0'],
      champion: true,
      weeksPlayed: 13,
      bestPosition: 1,
      votesCast: 0,
    })
    // Su `season_champ`, que da este mismo batch, y los logros de resultado de la temporada.
    expect(byName.prod0?.achievements.map((x) => x.id)).toEqual(
      expect.arrayContaining(['podium', 'win', 'season_champ']),
    )
    expect(byName.prod0?.achievements.find((x) => x.id === 'season_champ')).toEqual({
      id: 'season_champ',
      rarity: 'legendary',
      xp: 300,
    })
    expect(byName.prod1).toMatchObject({ standing: { position: 2 }, champion: false, champions: ['prod0'] })
    expect(byName.prod2).toMatchObject({ standing: { position: 3 }, bestPosition: 3, weeksPlayed: 13 })
    // El jurado: sin puesto ni semanas, con los votos que contaron (3 entradas en 3 semanas).
    expect(byName['oido.fino']).toMatchObject({
      standing: null,
      weeksPlayed: 0,
      bestPosition: null,
      votesCast: 9,
      champion: false,
    })

    // El tick que la ve cerrada no duplica nada; a las 08:00 (horas de silencio) salen, con su asunto.
    await s.tick(last.voteEndsAt + 60_000)
    expect(await wraps()).toHaveLength(4)
    const eight = zonedInstant({ year: 2027, month: 1, day: 4 }, { hour: 8, minute: 30, second: 0 })
    await s.tick(eight)
    const sent = mailer().sent.filter((mail) => rows.some((row) => row.id === mail.id))
    expect(sent.map((mail) => mail.to).sort()).toEqual(
      ['oido@example.com', 'prod0@example.com', 'prod1@example.com', 'prod2@example.com'].sort(),
    )
    const champion = sent.find((mail) => mail.to === 'prod0@example.com')
    expect(champion?.subject).toBe('¡Campeón de la T4 de 2026!')
    expect(champion?.text).toMatch(/Tu carta del trimestre/i)
    expect(champion?.html).toContain('/api/og/profile/prod0/card.png')
    expect(sent.find((mail) => mail.to === 'oido@example.com')?.subject).toBe('Tu T4 de 2026 en cifras')
    // Baja en un clic (RFC 8058): el transporte la pone en `List-Unsubscribe` con `List-Unsubscribe-Post`.
    expect(champion?.unsubscribeUrl).toMatch(/\/api\/unsubscribe/)
  })

  it('RF-NOTIF-13: nada de la temporada siguiente, que ya está en juego (ni sus votos ni sus logros); sin cuenta verificada, no sale', async () => {
    s = await simSeason({ count: 13, stars: aThenB })
    const a = s.producers[0] as SimSeason['producers'][0]
    const unverified = await createAccount(s.t, {
      email: 'sinverificar@example.com',
      username: 'sinverificar',
      verify: false,
    })
    for (const w of s.weeks.slice(0, 12)) await s.tick(w.voteEndsAt)
    // La semana del 4 de enero (2027-T1), ya abierta: A sube, un logro suyo con su semana, y votos del no verificado.
    const monday = addDays(s.weeks[12]?.monday as never, 7)
    const bounds = scheduleWeek(monday)
    const [{ id: sampleId } = { id: '' }] = await s.t.db.select({ id: sample.id }).from(sample)
    const next = `w-${weekSlug(monday)}`
    await s.t.db.insert(week).values({
      id: next,
      number: 14,
      slug: weekSlug(monday),
      seasonId: seasonOf(monday),
      sampleId,
      rulesVersion: 1,
      ...bounds,
      createdBy: 'test',
      createdAt: 0,
    })
    const blind = entryValues(next, a.id, { submittedAt: bounds.startsAt + 1 })
    await s.t.db.insert(entry).values(blind)
    await s.t.db.insert(achievementUnlock).values({
      userId: a.id,
      achievementId: 'early_bird',
      ref: blind.id,
      weekId: next,
      unlockedAt: bounds.startsAt,
    })
    await s.t.db.insert(vote).values({
      userId: unverified.id,
      entryId: s.entries.get((s.weeks[0] as SimSeason['weeks'][0]).id)?.get(a.id) as string,
      weekId: (s.weeks[0] as SimSeason['weeks'][0]).id,
      stars: 5,
      createdAt: 1,
      updatedAt: 1,
    })

    const last = s.weeks[12] as SimSeason['weeks'][0]
    expect(seasonOf(monday)).toBe('2027-T1')
    expect(
      await sealWeek(s.t.db, { weekId: last.id, now: bounds.startsAt + 3_600_000, holder: 'lectura' }),
    ).toBe(true)
    const rows = await wraps()
    // Sin el no verificado, aunque sus votos de la temporada contaran.
    expect(rows.map((row) => row.data.username).sort()).toEqual(['prod0', 'prod1', 'prod2'])
    const mine = rows.find((row) => row.userId === a.id)?.data
    expect(mine?.achievements.map((x) => x.id)).not.toContain('early_bird')
    expect(mine?.weeksPlayed).toBe(13)
    // El texto renderizado tampoco dice nada de la semana 14.
    expect(JSON.stringify(mine)).not.toMatch(/2027|w-2027/)
  })

  it('G7 / RF-NOTIF-15: sin semana el último lunes, lo encola el primer tick tras el fin del trimestre; respeta season_on al enviar', async () => {
    s = await simSeason({ count: 12, stars: aThenB })
    const [a, b] = s.producers as [SimSeason['producers'][0], SimSeason['producers'][0]]
    await s.t.db.update(emailPref).set({ seasonOn: false }).where(eq(emailPref.userId, b.id))
    for (const w of s.weeks) await s.tick(w.voteEndsAt)
    expect(await wraps()).toEqual([])
    const end = seasonEndsAt('2026-T4')
    expect((await s.tick(end + 60_000)).closedSeasons).toEqual(['2026-T4'])
    const rows = await wraps()
    expect(rows).toHaveLength(3)
    expect(rows.find((row) => row.userId === a.id)?.data).toMatchObject({ champion: true, weeksPlayed: 12 })
    // A las 08:30, salen menos el de quien apagó el aviso de temporada (`season_on`).
    await s.tick(zonedInstant({ year: 2027, month: 1, day: 1 }, { hour: 8, minute: 30, second: 0 }))
    const after = await s.t.db
      .select({ userId: emailOutbox.userId, status: emailOutbox.status, reason: emailOutbox.skipReason })
      .from(emailOutbox)
      .where(and(eq(emailOutbox.kind, 'season.wrap'), eq(emailOutbox.userId, b.id)))
    expect(after[0]?.status).toBe('skipped')
    expect(
      mailer().sent.some((mail) => mail.to === 'prod1@example.com' && /T4 de 2026/.test(mail.subject)),
    ).toBe(false)
    expect(
      mailer().sent.some((mail) => mail.to === 'prod0@example.com' && /T4 de 2026/.test(mail.subject)),
    ).toBe(true)
  })

  it('§2.12.7: una temporada que se cerró hace más de una semana no se resume (el primer tick tras desplegar la capa de juego)', async () => {
    s = await simSeason({ count: 12, stars: aThenB })
    for (const w of s.weeks) await s.tick(w.voteEndsAt)
    expect((await s.tick(seasonEndsAt('2026-T4') + 8 * 86_400_000)).closedSeasons).toEqual(['2026-T4'])
    expect(await wraps()).toEqual([])
  })
})
