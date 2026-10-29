/**
 * El modo `season` de `seedBattle.ts` (tarea 7.32, guía §4.4): una historia con la que mirar la capa de juego (el HUD,
 * la carta, el perfil, el salón de la fama, la temporada y la ceremonia del campeón) y apoyar los E2E y las capturas
 * de la Fase 7. Se juega **entera por la API**, como en vivo, así que el XP, los logros, las rachas y el campeón los
 * escriben los ganchos de la capa de juego (al final, el reprocesado lo comprueba: no tiene nada que añadir):
 *
 * - la **temporada anterior entera** (13 o 14 semanas), sellada y **cerrada con su campeón** (`season_champ`); y las
 *   semanas ya pasadas de la temporada en curso, selladas; **la de este lunes, abierta** con entradas y algún voto;
 * - 12 productores con su nivel, desde la que gana casi todo (`prod01`, campeona: `win_3`, `double`, `streak_8`…) hasta
 *   quien entra tarde (`prod06`, solo esta temporada) o juega poco (`prod12`), así que salen **niveles de varios
 *   rangos**; `prod03` falla una semana en cada temporada (**el comodín gastado**, también el de la temporada en
 *   curso), `prod04` lo deja a mitad de la anterior (la racha se rompe), `prod07` marca el reto y sube una entrada a
 *   última hora (`challenge`, `last_minute`), `prod08` remonta de la mitad baja al podio (`comeback`) y `prod09` gana
 *   la primera semana de la temporada en curso;
 * - 3 jurados: `jurado1` vota todas con el criterio del resto (oído de oro casi cada semana, `oracle`, `jury_full`,
 *   `votes_100` y, la última semana sellada, diez votos de madrugada: `night_owl`), `jurado2` vota todas a su aire y
 *   `jurado3` solo unas pocas;
 * - una **semana dorada** (`golden_week`), una entrada **unánime** (`unanimous`, la última sellada) y `share_card`;
 * - y con todo eso, **logros de cada rareza** y **récords para el salón de la fama**.
 *
 * Determinista: las calidades y las estrellas salen de un hash, no del azar.
 */
import {
  ACHIEVEMENT_RARITIES,
  type AchievementRarity,
  achievementById,
  addDays,
  formatLocalDate,
  isAchievementId,
  type LocalDate,
  levelOf,
  mondayOf,
  rankTitle,
  scheduleWeek,
  seasonOf,
  weekSlug,
} from '@beatbattle/rules'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../db/client'
import type { FixedClock } from '../lib/clock'
import { uuidv7 } from '../lib/ids'
import { reprocessGame } from '../modules/game/reprocess'
import type { DiskSampleStorage } from '../modules/storage/samples'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

type Who = { id: string; cookie: string }

export interface SeedKit {
  app: FastifyInstance
  db: Db
  clock: FixedClock
  files: DiskSampleStorage
  password: string
  admin: Who
  account: (username: string) => Promise<Who>
  /** El `data` de la respuesta, sin tipar (un script de datos de prueba, como `seedBattle`). */
  // biome-ignore lint/suspicious/noExplicitAny: el `data` de cada ruta, que el script lee campo a campo
  call: (method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, payload?: object) => Promise<any>
  beat: (seconds: number, bpm: number, root: number, seed: number) => Uint8Array
  newSample: (title: string, bpm: number, musicalKey: string, root: number) => Promise<{ id: string }>
}

/** Un hash entero de unas partes (FNV-1a de 32 bits): las «tiradas» deterministas de la historia. */
function hashOf(...parts: (string | number)[]): number {
  let h = 0x811c9dc5
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}
/** Un número en [−1, 1) a partir del hash. */
const wobble = (...parts: (string | number)[]) => (hashOf(...parts) % 2000) / 1000 - 1

const SAMPLE_TITLES = [
  'Lluvia en Gràcia',
  'Niebla en Montjuïc',
  'Calor de agosto',
  'Persiana bajada',
  'Último tren',
  'Sótano 808',
  'Vinilo rayado',
  'Azotea 3AM',
  'Metro de madrugada',
  'Plaza vacía',
  'Neón en el Raval',
  'Eco del túnel',
  'Asfalto mojado',
  'Garaje sónico',
  'Faro apagado',
  'Patio interior',
  'Sirena lejana',
  'Humo y cristal',
]
const KEYS = ['Am', 'Dm', 'Em', 'Cm', 'Gm', 'F#m', 'C', 'G', 'F', 'A#m'] as const
const GENRES = ['Trap', 'Drill', 'Boom Bap', 'Jerk', 'Club', 'Reggaeton', 'Afrobeats', 'Amapiano'] as const

/** Los productores: su nivel de base (0–1) y qué semanas juega (`g`: índice entre las semanas, `n`: las de la anterior). */
const PRODUCERS: readonly { skill: number; plays: (g: number, n: number) => boolean }[] = [
  { skill: 0.95, plays: () => true }, // prod01: la campeona
  { skill: 0.85, plays: () => true }, // prod02
  { skill: 0.75, plays: (g, n) => g !== 5 && g !== n + 1 }, // prod03: el comodín de cada temporada
  { skill: 0.65, plays: (g) => g <= 7 }, // prod04: lo deja a mitad
  { skill: 0.45, plays: (g) => g !== 2 && g !== 9 }, // prod05
  { skill: 0.55, plays: (g, n) => g >= n }, // prod06: solo esta temporada
  { skill: 0.6, plays: () => true }, // prod07: el reto y la última hora
  { skill: 0.5, plays: () => true }, // prod08: la remontada
  { skill: 0.7, plays: () => true }, // prod09
  { skill: 0.4, plays: (g, n) => g >= n - 3 }, // prod10: entra tarde
  { skill: 0.35, plays: () => true }, // prod11
  { skill: 0.3, plays: (g) => g % 2 === 0 }, // prod12: juega poco
]

/** La calidad (1–5) de la entrada del productor `p` en la semana `g`, con las escenas de la historia. */
function quality(p: number, g: number, n: number): number {
  // prod08 remonta: la mitad baja en la 6 y el podio en la 7.
  if (p === 7 && g === 6) return 1.2
  if (p === 7 && g === 7) return 4.9
  // prod02 gana dos semanas de la anterior y prod09, la primera de la temporada en curso.
  if (p === 1 && (g === 3 || g === 9)) return 5
  if (p === 0 && (g === 3 || g === 9 || g === n)) return 4.3
  if (p === 8 && g === n) return 5
  const skill = (PRODUCERS[p] as { skill: number }).skill
  return 1 + 4 * Math.min(1, Math.max(0, skill + 0.12 * wobble('q', p, g)))
}

const clampStars = (x: number) => Math.min(5, Math.max(1, Math.round(x)))

export async function seedSeason(kit: SeedKit): Promise<void> {
  const { app, db, clock, files, call, beat } = kit
  const thisMonday = mondayOf(Date.now())
  const current = seasonOf(thisMonday)
  // Las semanas pasadas de la temporada en curso y las de la anterior entera, en orden de calendario.
  const mondays: LocalDate[] = []
  let previous: string | null = null
  for (let m = addDays(thisMonday, -7); ; m = addDays(m, -7)) {
    const season = seasonOf(m)
    if (season !== current) {
      if (previous === null) previous = season
      else if (season !== previous) break
    }
    mondays.unshift(m)
  }
  const n = mondays.filter((m) => seasonOf(m) === previous).length
  const all = [...mondays, thisMonday]
  const sealedCount = mondays.length
  const busy = sealedCount - 1 // la última sellada: la unánime y la de madrugada
  const golden = Math.min(8, n - 1)
  const lastMinute = 4

  // Las semanas, programadas antes de que empiece la primera (cada una con su sample).
  clock.set(scheduleWeek(all[0] as LocalDate).startsAt - DAY)
  const weeks: { slug: string; bounds: ReturnType<typeof scheduleWeek>; challenge: boolean }[] = []
  for (const [g, monday] of all.entries()) {
    const sample = await kit.newSample(
      SAMPLE_TITLES[g % SAMPLE_TITLES.length] as string,
      84 + ((g * 7) % 60),
      KEYS[g % KEYS.length] as string,
      110 + ((g * 23) % 120),
    )
    const challenge = g % 3 === 0
    await call('POST', '/api/admin/weeks', kit.admin.cookie, {
      monday: formatLocalDate(monday),
      sampleId: sample.id,
      ...(challenge ? { challenge: 'Usa solo el primer compás' } : {}),
      ...(g === golden ? { golden: true } : {}),
    })
    weeks.push({ slug: weekSlug(monday), bounds: scheduleWeek(monday), challenge })
    process.stdout.write(`semana ${g + 1}/${all.length} programada\r`)
  }

  const producers: (Who & { username: string })[] = []
  for (let p = 0; p < PRODUCERS.length; p++) {
    const username = `prod${String(p + 1).padStart(2, '0')}`
    producers.push({ ...(await kit.account(username)), username })
  }
  const jury: (Who & { username: string })[] = []
  for (let j = 0; j < 3; j++) {
    const username = `jurado${j + 1}`
    jury.push({ ...(await kit.account(username)), username })
  }

  const downloaded = new Set<number>()
  for (const [g, w] of weeks.entries()) {
    const open = g === sealedCount
    clock.set(w.bounds.startsAt + HOUR)
    // Las entradas: cada productor que juega esa semana, cada 17 minutos (la de última hora, al final).
    const entries: { p: number; id: string; q: number }[] = []
    const players = PRODUCERS.map((_, p) => p).filter((p) =>
      (PRODUCERS[p] as (typeof PRODUCERS)[number]).plays(g, n),
    )
    const late = g === lastMinute ? 6 : -1
    for (const p of [...players.filter((x) => x !== late), ...(players.includes(late) ? [late] : [])]) {
      const who = producers[p] as Who
      if (p === late) clock.set(w.bounds.submitEndsAt - 5 * MINUTE)
      await call('POST', `/api/weeks/${w.slug}/rules`, who.cookie, { rulesVersion: 1 })
      if (!downloaded.has(p)) {
        downloaded.add(p)
        await call('POST', `/api/weeks/${w.slug}/sample/download`, who.cookie, { kind: 'original' })
      }
      const seconds = 31 + ((p + g) % 6)
      const bpm = [140, 92, 128, 100, 150, 87, 120, 96][(p + g) % 8] as number
      const bytes = beat(seconds, bpm, 110 + ((p * 37 + g * 11) % 200), p * 100 + g)
      const signed = await call('POST', '/api/uploads/sign', who.cookie, {
        kind: 'entry',
        weekSlug: w.slug,
        mime: 'audio/wav',
        bytes: bytes.byteLength,
        durationMs: seconds * 1000,
      })
      await files.put({ publicId: signed.publicId, bytes, format: 'wav', nowMs: clock.now() })
      const created = await call('POST', `/api/weeks/${w.slug}/entries`, who.cookie, {
        intentId: signed.intentId,
        title: `${SAMPLE_TITLES[(p * 5 + g) % SAMPLE_TITLES.length]} (flip ${p + 1})`,
        bpm,
        musicalKey: KEYS[(p + g) % KEYS.length],
        daw: ['FL Studio', 'Ableton Live', 'Logic Pro', 'MPC'][p % 4],
        genres: [GENRES[(p + g) % GENRES.length]],
        description: null,
        declaration: true,
        ...(w.challenge && p === 6 ? { challengeClaimed: true } : {}),
      })
      entries.push({ p, id: created.id, q: quality(p, g, n) })
      clock.advance(17 * MINUTE)
    }

    // Los votos: desde el martes a las 03:00 (o tras la entrada de última hora). El jurado 1, primero.
    clock.set(g === lastMinute ? w.bounds.submitEndsAt + 10 * MINUTE : w.bounds.startsAt + 27 * HOUR)
    const star = entries.find((e) => e.p === 0)
    const ballots: { who: Who; targets: { id: string; stars: number }[] }[] = []
    const jurorTargets = (j: number) =>
      entries
        .filter((_, k) => j !== 2 || (k + g) % 4 === 0)
        .map((e) => ({
          id: e.id,
          stars:
            g === busy && e === star
              ? 5
              : clampStars(
                  e.q + (j === 0 ? 0 : j === 1 ? 2 * wobble('j2', g, e.p) : 0.4 * wobble('j3', g, e.p)),
                ),
        }))
    // En la semana abierta, solo el jurado 1 y la mitad: sin sellar, nada se ve.
    const voters = open ? [0] : [0, 1, 2]
    for (const j of voters)
      ballots.push({ who: jury[j] as Who, targets: open ? jurorTargets(j).slice(0, 4) : jurorTargets(j) })
    if (!open)
      for (const [k, e] of entries.entries()) {
        const targets = [1, 2, 3, 4].map((d) => entries[(k + d) % entries.length] as (typeof entries)[number])
        // La semana unánime, todos votan además la de prod01.
        if (g === busy && star && e !== star && !targets.includes(star)) targets.push(star)
        ballots.push({
          who: producers[e.p] as Who,
          targets: targets
            .filter((x) => x !== e)
            .map((x) => ({
              id: x.id,
              stars: g === busy && x === star ? 5 : clampStars(x.q + 0.6 * wobble('p', g, e.p, x.p)),
            })),
        })
      }
    for (const ballot of ballots)
      for (const target of ballot.targets) {
        const { listenId } = await call('POST', `/api/entries/${target.id}/listen`, ballot.who.cookie)
        clock.advance(31_000)
        await call('POST', `/api/entries/${target.id}/listen/qualify`, ballot.who.cookie, { listenId })
        await call('PUT', `/api/entries/${target.id}/vote`, ballot.who.cookie, { stars: target.stars })
      }
    process.stdout.write(`semana ${g + 1}/${all.length}: ${entries.length} entradas\r`)
  }
  // Compartir la carta (lo declara el navegador, `share_card`).
  for (const p of [0, 8])
    await call('POST', '/api/me/achievements', (producers[p] as Who).cookie, { achievement: 'share_card' })

  // Todo lo escribieron los ganchos en vivo: el reprocesado no tiene nada que añadir.
  const now = clock.now()
  const check = await reprocessGame({ db, now, newId: () => uuidv7(now), apply: true })
  console.log(
    `\nReprocesado de comprobación: ${check?.accounts ?? '?'} cuentas con algo nuevo, +${check?.xp ?? '?'} XP.`,
  )

  // Lo que ha quedado: niveles y rangos, logros por rareza, la temporada cerrada y el salón de la fama.
  const ranks = new Map<string, number>()
  const rarities = new Map<AchievementRarity, number>(ACHIEVEMENT_RARITIES.map((r) => [r, 0]))
  const people = [...producers, ...jury]
  console.log('\nCuenta       nivel  rango            XP     logros (común/raro/épico/legendario)')
  for (const who of people) {
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: who.cookie } })
    const me = res.json().data as {
      game: { xp: number; streak: { current: number; jokerAvailable: boolean } }
    }
    const level = levelOf(me.game.xp)
    const rank = rankTitle(level)
    ranks.set(rank, (ranks.get(rank) ?? 0) + 1)
    const profile = await call('GET', `/api/profiles/${who.username}`, '')
    const mine = new Map<AchievementRarity, number>(ACHIEVEMENT_RARITIES.map((r) => [r, 0]))
    for (const a of (profile.game?.achievements ?? []) as { id: string }[])
      if (isAchievementId(a.id)) {
        const rarity = achievementById(a.id).rarity
        mine.set(rarity, (mine.get(rarity) ?? 0) + 1)
        rarities.set(rarity, (rarities.get(rarity) ?? 0) + 1)
      }
    console.log(
      `${who.username.padEnd(12)} ${String(level).padStart(5)}  ${rank.padEnd(16)} ${String(me.game.xp).padStart(6)}  ` +
        `${[...mine.values()].join('/')}  racha ${me.game.streak.current}${me.game.streak.jokerAvailable ? '' : ' (comodín gastado)'}`,
    )
  }
  console.log(`Rangos: ${[...ranks].map(([r, k]) => `${r} ${k}`).join(' · ')}`)
  console.log(`Logros por rareza: ${[...rarities].map(([r, k]) => `${r} ${k}`).join(' · ')}`)
  const standings = await call('GET', `/api/seasons/${previous}/standings`, '')
  console.log(
    `Temporada ${previous}: ${standings.season.sealedWeeks} semanas, ${standings.season.closed ? 'cerrada' : 'abierta'}, ` +
      `campeona ${standings.rows[0]?.producer?.username ?? '—'} (${standings.rows[0]?.points ?? 0} pts)`,
  )
  const hall = await call('GET', '/api/hall-of-fame', '')
  type Producer = { username: string } | null
  const record = (r: { producer: Producer; value: number } | null) =>
    r ? `${r.producer?.username ?? 'eliminado'} ${r.value}` : '—'
  const best = hall.records.bestScore as { producer: Producer; scoreMilli: number } | null
  console.log(
    `Salón: ${hall.weeklyWinners.length} ganadores semanales, ${hall.seasonChampions.length} campeones; récords: ` +
      `victorias ${record(hall.records.mostWins)} · racha ${record(hall.records.longestStreak)} · ` +
      `puntuación ${best ? `${best.producer?.username ?? 'eliminado'} ${best.scoreMilli / 1000}` : '—'} · ` +
      `votos ${record(hall.records.mostVotesCast)}`,
  )
  console.log(
    `\nSemanas: ${weeks[0]?.slug} … ${weeks.at(-1)?.slug} (${sealedCount} selladas, la de este lunes abierta).`,
  )
  console.log(`Cuentas (contraseña «${kit.password}»): jefa (admin), prod01…prod12, jurado1…jurado3`)
}
