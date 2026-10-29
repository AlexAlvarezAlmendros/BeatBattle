import { addDays, type LocalDate, scheduleWeek, seasonOf, weekSlug } from '@beatbattle/rules'
import { entry, sample, vote, week } from '../../src/db/schema'
import { createAccount } from '../helpers'
import { entryValues } from './battle'
import { createSample, makeWeeksApp, type WeeksApp } from './weeks'

export const CRON = 'cron-secret-de-prueba-0123456789abcdef'

/** Una semana simulada de la temporada, con su lunes y sus fronteras. */
export interface SimWeek {
  id: string
  number: number
  slug: string
  monday: LocalDate
  startsAt: number
  voteEndsAt: number
}

export interface SimSeason {
  t: WeeksApp
  producers: { id: string; cookie: string; username: string }[]
  weeks: SimWeek[]
  /** Las entradas, por semana y productor. */
  entries: Map<string, Map<string, string>>
  /** El `tick` con el reloj en `at`. */
  tick: (at: number) => Promise<{ sealed: string[]; closedSeasons: string[] }>
}

let voterSerial = 0

/**
 * Una temporada simulada (tarea 7.11): `count` semanas seguidas desde el lunes `first`, programadas y sin sellar, con
 * una entrada de cada productor por semana. `stars[w][p]` son las tres estrellas de cuentas sin fila que recibe la
 * entrada del productor `p` en la semana `w` (con 3 votos clasifica; sin estrellas, no tiene entrada esa semana).
 */
export async function simSeason({
  first = { year: 2026, month: 10, day: 5 },
  count,
  producers = 3,
  stars,
}: {
  first?: LocalDate
  count: number
  producers?: number
  stars: (week: number, producer: number) => number[] | null
}): Promise<SimSeason> {
  const t = await makeWeeksApp({ cronSecret: CRON })
  await createSample(t)
  const [s] = await t.db.select({ id: sample.id }).from(sample)
  const people: SimSeason['producers'] = []
  for (let p = 0; p < producers; p++) {
    const username = `prod${p}`
    people.push({ ...(await createAccount(t, { email: `${username}@example.com`, username })), username })
  }
  const weeks: SimWeek[] = []
  const entries = new Map<string, Map<string, string>>()
  for (let w = 0; w < count; w++) {
    const monday = addDays(first, 7 * w)
    const bounds = scheduleWeek(monday)
    const slug = weekSlug(monday)
    const id = `w-${slug}`
    await t.db.insert(week).values({
      id,
      number: w + 1,
      slug,
      seasonId: seasonOf(monday),
      sampleId: s?.id as string,
      rulesVersion: 1,
      ...bounds,
      createdBy: 'test',
      createdAt: 0,
    })
    weeks.push({ id, number: w + 1, slug, monday, startsAt: bounds.startsAt, voteEndsAt: bounds.voteEndsAt })
    const byProducer = new Map<string, string>()
    for (const [p, person] of people.entries()) {
      const given = stars(w, p)
      if (!given) continue
      const values = entryValues(id, person.id, { submittedAt: bounds.startsAt + p + 1 })
      await t.db.insert(entry).values(values)
      byProducer.set(person.id, values.id)
      for (const value of given)
        await t.db.insert(vote).values({
          userId: `sim-voter-${++voterSerial}`,
          entryId: values.id,
          weekId: id,
          stars: value,
          createdAt: bounds.startsAt,
          updatedAt: bounds.startsAt,
        })
    }
    entries.set(id, byProducer)
  }
  return {
    t,
    producers: people,
    weeks,
    entries,
    async tick(at: number) {
      t.clock.set(at)
      const res = await t.app.inject({
        method: 'GET',
        url: '/api/cron/tick',
        headers: { authorization: `Bearer ${CRON}` },
      })
      if (res.statusCode !== 200) throw new Error(`tick: ${res.statusCode} ${res.body}`)
      return res.json().data
    },
  }
}
