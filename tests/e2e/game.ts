import { type Browser, expect } from '@playwright/test'
import { type Account, apiVote, battleContext, type Clock, signUp } from './battle'

/**
 * Una temporada jugada para los E2E de la capa de juego (tarea 7.32; la 7.33 y las capturas de la 7.35 se apoyan en
 * ella): el admin programa las semanas de los lunes `mondays` (la última, la del último lunes del trimestre: su
 * sellado cierra la temporada), cada productor sube su entrada las semanas que juega y el jurado vota; todo por la API,
 * con el reloj de la API en `clock.api`, así que el XP, los logros, las rachas y el campeón los escriben los ganchos de
 * la capa de juego. Al acabar, todas las semanas están selladas.
 *
 * - `producers` productores (8 por defecto: con ellos el jurado llega a los 8 votos del oído de oro). El 0 gana todas
 *   (`win`, `win_3`, `double`, `streak_3` y `season_champ`; descarga el sample, sube el primero de cada semana y
 *   comparte su carta), el 1 queda segundo, el 2 **no juega la segunda semana** (gasta el comodín de la temporada) y el
 *   resto, por debajo; así salen **niveles de varios rangos**.
 * - 2 jurados: el 0 vota todas con el criterio del resto (oído de oro y `jury_full`); el 1, todas al revés.
 * - Logros de **cada rareza** (común, raro, épico y legendario) y récords para el salón de la fama.
 */

export interface SeasonPlayer extends Account {
  /** Sus entradas, por semana (`null` si no jugó esa). */
  entries: (string | null)[]
}

export interface PlayedSeason {
  seasonId: string
  weeks: { slug: string; startsAt: number; submitEndsAt: number; voteEndsAt: number }[]
  producers: SeasonPlayer[]
  jury: Account[]
}

function wav(seconds: number, frequency: number): Buffer {
  const rate = 8000
  const frames = rate * seconds
  const buffer = Buffer.alloc(44 + frames * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + frames * 2, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(frames * 2, 40)
  for (let i = 0; i < frames; i++) {
    const beat = (i % (rate / 2)) / rate
    const value = Math.sin((2 * Math.PI * frequency * i) / rate) * (0.2 + 0.4 * Math.exp(-beat * 6))
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2)
  }
  return buffer
}

function pngHeader(): Buffer {
  const png = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12)
  png.writeUInt32BE(1200, 16)
  png.writeUInt32BE(1200, 20)
  return png
}

/** La calidad (las estrellas que le da el jurado 0) de la entrada del productor `p` en la semana `w`. */
const quality = (p: number, w: number) => (p === 0 ? 5 : p === 1 ? 4 : Math.max(1, 3 - ((p + w) % 3)))

/** ¿Juega el productor `p` la semana `w`? (el 2 falla la segunda: gasta el comodín). */
const plays = (p: number, w: number) => !(p === 2 && w === 1)

export async function playSeason(
  browser: Browser,
  baseURL: string,
  {
    mondays,
    run,
    ip,
    clock,
    producers = 8,
  }: {
    mondays: readonly string[]
    run: string
    ip: (slot: number) => string
    clock: Clock
    producers?: number
  },
): Promise<PlayedSeason> {
  const [year, month, day] = (mondays[0] as string).split('-').map(Number) as [number, number, number]
  clock.api = Date.UTC(year, month - 1, day - 3, 12)
  const headers = () => ({ origin: baseURL, 'x-bb-test-now': String(clock.api) })

  // La jefa programa las semanas, cada una con su sample, antes de que empiece la primera.
  const adminContext = await battleContext(browser, baseURL, ip(1), clock)
  const admin = await signUp(
    adminContext,
    baseURL,
    `jefa${run}.game@example.com`,
    `jefa${run}game`,
    ip(1),
    clock.api,
  )
  const role = await admin.page.request.post('/api/test/role', {
    headers: headers(),
    data: { email: admin.email, role: 'admin' },
  })
  expect(role.ok(), await role.text()).toBe(true)
  const weeks: PlayedSeason['weeks'] = []
  for (const [w, monday] of mondays.entries()) {
    let sampleId: string | undefined
    for (const [part, name, buffer, mimeType] of [
      ['original', 'sample.wav', wav(20, 200 + w * 30), 'audio/wav'],
      ['cover', 'cover.png', pngHeader(), 'image/png'],
    ] as const) {
      const signed = await admin.page.request.post('/api/admin/samples/sign', {
        headers: headers(),
        data: sampleId ? { part, sampleId } : { part },
      })
      expect(signed.ok(), await signed.text()).toBe(true)
      const { data } = await signed.json()
      sampleId = data.sampleId
      const upload = await admin.page.request.post(data.upload.uploadUrl, {
        headers: headers(),
        multipart: { ...data.upload.fields, file: { name, mimeType, buffer } },
      })
      expect(upload.ok(), await upload.text()).toBe(true)
    }
    const sample = await admin.page.request.post('/api/admin/samples', {
      headers: headers(),
      data: {
        sampleId,
        title: `Temporada ${w + 1}`,
        credits: 'E2E',
        licenseText: 'Uso libre.',
        bpm: 92,
        musicalKey: 'Dm',
      },
    })
    expect(sample.ok(), await sample.text()).toBe(true)
    const created = await admin.page.request.post('/api/admin/weeks', {
      headers: headers(),
      data: { monday, sampleId: (await sample.json()).data.id },
    })
    expect(created.ok(), await created.text()).toBe(true)
    weeks.push((await created.json()).data)
  }
  await adminContext.close()

  const players: SeasonPlayer[] = []
  for (let p = 0; p < producers; p++) {
    const context = await battleContext(browser, baseURL, ip(10 + p), clock)
    const who = await signUp(
      context,
      baseURL,
      `temporada${run}.${p}@example.com`,
      `temp${run}x${p}`,
      ip(10 + p),
      clock.api,
    )
    players.push({ ...who, entries: [] })
  }
  const jury: Account[] = []
  for (let j = 0; j < 2; j++) {
    const context = await battleContext(browser, baseURL, ip(40 + j), clock)
    jury.push(
      await signUp(context, baseURL, `oido${run}.${j}@example.com`, `oido${run}x${j}`, ip(40 + j), clock.api),
    )
  }

  for (const [w, week] of weeks.entries()) {
    clock.api = week.startsAt + 3_600_000
    const entries: { p: number; id: string }[] = []
    for (const [p, who] of players.entries()) {
      if (!plays(p, w)) {
        who.entries.push(null)
        continue
      }
      const rules = await who.page.request.post(`/api/weeks/${week.slug}/rules`, {
        headers: headers(),
        data: { rulesVersion: 1 },
      })
      expect(rules.ok(), await rules.text()).toBe(true)
      if (p === 0 && w === 0) {
        const download = await who.page.request.post(`/api/weeks/${week.slug}/sample/download`, {
          headers: headers(),
          data: { kind: 'original' },
        })
        expect(download.ok(), await download.text()).toBe(true)
      }
      const audio = wav(31 + p, 180 + p * 40 + w * 7)
      const signed = await who.page.request.post('/api/uploads/sign', {
        headers: headers(),
        data: {
          kind: 'entry',
          weekSlug: week.slug,
          mime: 'audio/wav',
          bytes: audio.length,
          durationMs: (31 + p) * 1000,
        },
      })
      expect(signed.ok(), await signed.text()).toBe(true)
      const { data } = await signed.json()
      const upload = await who.page.request.post(data.uploadUrl, {
        headers: headers(),
        multipart: { ...data.fields, file: { name: 'beat.wav', mimeType: 'audio/wav', buffer: audio } },
      })
      expect(upload.ok(), await upload.text()).toBe(true)
      const entry = await who.page.request.post(`/api/weeks/${week.slug}/entries`, {
        headers: headers(),
        data: {
          intentId: data.intentId,
          title: `Flip ${p + 1} · semana ${w + 1}`,
          bpm: 90 + p,
          musicalKey: 'Am',
          daw: 'FL Studio',
          genres: ['Trap'],
          description: null,
          declaration: true,
        },
      })
      expect(entry.ok(), await entry.text()).toBe(true)
      const id = (await entry.json()).data.id as string
      who.entries.push(id)
      entries.push({ p, id })
      clock.api += 60_000
    }
    // El jurado 0 vota todas con su calidad; el 1, al revés; cada productor, las dos siguientes.
    for (const e of entries) {
      await apiVote(jury[0] as Account, e.id, quality(e.p, w), clock, baseURL)
      await apiVote(jury[1] as Account, e.id, 6 - quality(e.p, w), clock, baseURL)
    }
    for (const [k, e] of entries.entries())
      for (const d of [1, 2]) {
        const target = entries[(k + d) % entries.length] as { p: number; id: string }
        await apiVote(players[e.p] as Account, target.id, quality(target.p, w), clock, baseURL)
      }
  }

  // La primera lectura de los resultados de la última, ya cerrada, la sella (y con ella, la temporada).
  const last = weeks.at(-1) as PlayedSeason['weeks'][number]
  clock.api = last.voteEndsAt + 60_000
  const results = await (players[0] as Account).page.request.get(`/api/weeks/${last.slug}/results`, {
    headers: headers(),
  })
  expect(results.ok(), await results.text()).toBe(true)
  // Compartir la carta (lo declara el navegador).
  const shared = await (players[0] as Account).page.request.post('/api/me/achievements', {
    headers: headers(),
    data: { achievement: 'share_card' },
  })
  expect(shared.ok(), await shared.text()).toBe(true)
  const [ly, lm] = (mondays.at(-1) as string).split('-').map(Number) as [number, number]
  return { seasonId: `${ly}-T${Math.ceil(lm / 3)}`, weeks, producers: players, jury }
}
