import { countdownOf } from '@beatbattle/rules'
import type { MusicalKey, PublicWeek, TONICS } from '@beatbattle/shared'
import { formatDate, t } from '../../i18n'
import type { WaveformPeak } from '../../ui/Waveform'
import type { MenuWeek } from './menu/model'

/**
 * De la semana pública de la API (`PublicWeek`, Fase 3) a lo que pintan el menú y la ficha. Fechas en hora
 * de Madrid, como la guía pide (§4.7.8). La fase viene del servidor; la cuenta atrás se calcula aquí con el
 * reloj del navegador, igual que el reloj de ronda.
 */

/** Tonalidad en palabras: «Dm» → «Re menor». */
export function musicalKeyName(key: MusicalKey): string {
  const minor = key.endsWith('m')
  const tonic = (minor ? key.slice(0, -1) : key) as (typeof TONICS)[number]
  // Las claves i18n van en camelCase: «C#» → «cs».
  const id = tonic.replace('#', 's').toLowerCase() as
    | 'c'
    | 'cs'
    | 'd'
    | 'ds'
    | 'e'
    | 'f'
    | 'fs'
    | 'g'
    | 'gs'
    | 'a'
    | 'as'
    | 'b'
  return t(minor ? 'music.minor' : 'music.major', { tonic: t(`music.tonics.${id}`) })
}

/** La forma de onda de la API (base64 de 1000 × [mín, máx] en `Int8`) en pares de −1…1. */
export function decodePeaks(base64: string): WaveformPeak[] {
  const binary = atob(base64)
  const peaks: WaveformPeak[] = []
  for (let i = 0; i + 1 < binary.length; i += 2) {
    const min = ((binary.charCodeAt(i) << 24) >> 24) / 127
    const max = ((binary.charCodeAt(i + 1) << 24) >> 24) / 127
    peaks.push([min, max])
  }
  return peaks
}

const weekday = (ms: number) => formatDate(ms, { weekday: 'long' })
const day = (ms: number) => formatDate(ms, { day: 'numeric' })
const time = (ms: number) => formatDate(ms, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const sameDay = (a: number, b: number) =>
  formatDate(a, { year: 'numeric', month: 'numeric', day: 'numeric' }) ===
  formatDate(b, { year: 'numeric', month: 'numeric', day: 'numeric' })

/** «domingo 11 a las 20:00» (u «hoy a las 23:59»). */
export function whenText(target: number, now: number): string {
  return sameDay(target, now)
    ? t('weekTime.whenToday', { time: time(target) })
    : t('weekTime.when', { weekday: weekday(target), day: day(target), time: time(target) })
}

/** «5–11 oct · 2026-W41» (y «28 sep–4 oct · 2026-W40» cuando cambia el mes). */
export function rangeText(week: Pick<PublicWeek, 'startsAt' | 'submitEndsAt' | 'label'>): string {
  const month = (ms: number) => formatDate(ms, { month: 'short' }).replace('.', '')
  const from = day(week.startsAt)
  const to = `${day(week.submitEndsAt)} ${month(week.submitEndsAt)}`
  const sameMonth = month(week.startsAt) === month(week.submitEndsAt)
  return t('weekTime.range', {
    from: sameMonth ? from : `${from} ${month(week.startsAt)}`,
    to,
    code: week.label,
  })
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Día de la semana de Madrid, de 0 (lunes) a 6 (domingo). */
function madridWeekdayIndex(ms: number): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', weekday: 'short' }).format(ms)
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name)
}

/** Cuándo es el próximo drop («Cae el lunes 12 de octubre»). */
export function nextDropText(startsAt: number): string {
  const date = `${weekday(startsAt)} ${formatDate(startsAt, { day: 'numeric', month: 'long' })}`
  return t('weekTime.nextDrop', { date })
}

/** El `MenuWeek` del menú principal, o `null` si la semana ya no está en juego en `now`. */
export function menuWeekOf(week: PublicWeek, now: number, entries = 0): MenuWeek | null {
  const countdown = countdownOf({ ...week, sealedAt: null }, now)
  if (!countdown) return null
  const voting = countdown.closes === 'votes'
  return {
    phase: voting ? 'voting' : 'open',
    number: week.number,
    title: week.sample.title,
    credits: week.sample.credits,
    range: rangeText(week),
    code: week.label,
    bpm: week.sample.bpm ?? 0,
    musicalKey: week.sample.musicalKey ? musicalKeyName(week.sample.musicalKey) : '',
    durationSeconds: week.sample.durationMs / 1000,
    genre: week.sample.genreHint ?? t('weekTime.noGenre'),
    peaks: decodePeaks(week.sample.peaks),
    challenge: week.challenge ?? '',
    entries,
    closesAt: countdown.target,
    when: whenText(countdown.target, now),
    clockWhen: voting
      ? t('weekTime.clockWhenVoting')
      : t('weekTime.clockWhen', { when: capitalize(whenText(week.submitEndsAt, now)) }),
    weekBar: {
      today: Math.max(0, madridWeekdayIndex(now)),
      progress: Math.min(1, Math.max(0, (now - week.startsAt) / (week.voteEndsAt - week.startsAt))),
    },
    streamUrl: week.sample.streamUrl,
    slug: week.slug,
  }
}

/**
 * Cuándo hay que volver a pedir la semana: en la siguiente frontera (apertura del próximo drop, cierre de
 * envíos o de votos), para que la home cambie sola de semana (§5, hito de la Fase 3).
 */
export function nextBoundary(
  current: { week: PublicWeek | null; next: { startsAt: number } | null },
  now: number,
) {
  const candidates = [current.next?.startsAt, current.week?.submitEndsAt, current.week?.voteEndsAt].filter(
    (at): at is number => at !== undefined && at > now,
  )
  return candidates.length > 0 ? Math.min(...candidates) : null
}
