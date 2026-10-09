import {
  addDays,
  canDownload,
  formatLocalDate,
  isoWeekdayOf,
  isoWeekLabel,
  type LocalDate,
  localDateOf,
  mondayOf,
  parseLocalDate,
  phaseOf,
  scheduleWeek,
  seasonOf,
  weekSlug,
} from '@beatbattle/rules'
import {
  type AdminCalendar,
  type AdminWeek,
  type Chop,
  type CurrentWeek,
  type Download,
  type MusicalKey,
  type PublicWeek,
  RULES_VERSION,
  type WeekCreate,
  type WeekUpdate,
} from '@beatbattle/shared'
import { and, asc, count, eq, gt, gte, lt, lte, sql, sum } from 'drizzle-orm'
import { type BatchStatement, runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { rulesAcceptance, sample, sampleDownload, seenFlag, week } from '../../db/schema'
import { auditStatement } from '../../lib/audit'
import { appError } from '../../lib/errors'
import type { SampleStorage } from '../storage/samples'
import { sealDueWeeks } from './seal'

/**
 * Semanas (§2.1, §2.4, §2.14; tareas 3.7, 3.8, 3.10 y 3.11): el calendario del admin, la semana pública,
 * las bases, la descarga del sample y lo ya visto. La fase nunca se guarda: sale de `phaseOf` con el
 * instante de la petición (`RF-DROP-01`).
 */

/** Caducidad de la URL de descarga (`RF-DROP-07`). */
export const DOWNLOAD_TTL_MS = 60 * 60 * 1000
/** Lunes que mira el calendario del admin para marcar huecos (la semana en curso y las 11 siguientes). */
export const CALENDAR_HORIZON_WEEKS = 12

export interface WeeksDeps {
  db: Db
  storage: SampleStorage | null
  newId: () => string
}

type WeekRow = typeof week.$inferSelect
type SampleRow = typeof sample.$inferSelect

const mondayText = (row: Pick<WeekRow, 'startsAt'>) => formatLocalDate(localDateOf(row.startsAt))

function parseMonday(text: string): LocalDate {
  try {
    const date = parseLocalDate(text)
    if (isoWeekdayOf(date) !== 1) throw new RangeError('no es lunes')
    return date
  } catch {
    throw appError('VALIDATION_FAILED', 'La semana empieza en lunes: elige un lunes que exista.', {
      details: [{ path: ['monday'], message: 'no es un lunes' }],
    })
  }
}

export function createWeeksService(deps: WeeksDeps) {
  const { db } = deps

  function storage(): SampleStorage {
    if (!deps.storage) throw appError('STORAGE_UNAVAILABLE', 'No hay almacenamiento de audio configurado.')
    return deps.storage
  }

  async function findBySlug(slug: string): Promise<WeekRow> {
    const [row] = await db.select().from(week).where(eq(week.slug, slug))
    if (!row) throw appError('NOT_FOUND', 'No existe esa semana.')
    return row
  }

  async function requireSample(sampleId: string): Promise<SampleRow> {
    const [row] = await db.select().from(sample).where(eq(sample.id, sampleId))
    if (!row)
      throw appError('VALIDATION_FAILED', 'No existe ese sample.', {
        details: [{ path: ['sampleId'], message: 'no existe' }],
      })
    return row
  }

  /** Una semana que ya ha empezado no se toca (sus bases, descargas y entradas dependen de ella). */
  function assertScheduled(row: WeekRow, now: number): void {
    if (phaseOf(row, now) !== 'scheduled')
      throw appError('WEEK_LOCKED', 'La semana ya ha empezado: no se puede cambiar.')
  }

  /**
   * Renumera las semanas posteriores a `after` sumando `delta` (+1 al programar una antes, −1 al borrar).
   * Dos pasos por el `UNIQUE` de `number`: primero a negativos y luego de vuelta.
   */
  function renumber(after: number, delta: 1 | -1): BatchStatement[] {
    return [
      db
        .update(week)
        .set({ number: sql`-(${week.number} + ${delta})` })
        .where(gt(week.startsAt, after)),
      db
        .update(week)
        .set({ number: sql`-${week.number}` })
        .where(lt(week.number, 0)),
    ]
  }

  async function downloadsByWeek(): Promise<Map<string, { accounts: number; total: number }>> {
    const rows = await db
      .select({ weekId: sampleDownload.weekId, accounts: count(), total: sum(sampleDownload.count) })
      .from(sampleDownload)
      .where(eq(sampleDownload.kind, 'original'))
      .groupBy(sampleDownload.weekId)
    return new Map(rows.map((row) => [row.weekId, { accounts: row.accounts, total: Number(row.total ?? 0) }]))
  }

  function toAdmin(
    row: WeekRow,
    sampleTitle: string,
    downloads: { accounts: number; total: number } | undefined,
    now: number,
  ): AdminWeek {
    return {
      id: row.id,
      number: row.number,
      slug: row.slug,
      label: isoWeekLabel(localDateOf(row.startsAt)),
      seasonId: row.seasonId,
      monday: mondayText(row),
      sample: { id: row.sampleId, title: sampleTitle },
      challenge: row.challenge,
      blind: row.blind,
      golden: row.golden,
      startsAt: row.startsAt,
      submitEndsAt: row.submitEndsAt,
      voteEndsAt: row.voteEndsAt,
      sealedAt: row.sealedAt,
      phase: phaseOf(row, now),
      downloads: downloads ?? { accounts: 0, total: 0 },
    }
  }

  async function adminWeek(slug: string, now: number): Promise<AdminWeek> {
    const row = await findBySlug(slug)
    const [found] = await db.select({ title: sample.title }).from(sample).where(eq(sample.id, row.sampleId))
    return toAdmin(row, found?.title ?? '', (await downloadsByWeek()).get(row.id), now)
  }

  async function toPublic(row: WeekRow, now: number, viewerId: string | null): Promise<PublicWeek> {
    const files = storage()
    const s = await requireSample(row.sampleId)
    let viewer: PublicWeek['viewer'] = null
    if (viewerId) {
      const [accepted] = await db
        .select({ version: rulesAcceptance.rulesVersion })
        .from(rulesAcceptance)
        .where(and(eq(rulesAcceptance.userId, viewerId), eq(rulesAcceptance.weekId, row.id)))
      const [seen] = await db
        .select({ at: seenFlag.seenAt })
        .from(seenFlag)
        .where(and(eq(seenFlag.userId, viewerId), eq(seenFlag.kind, 'drop'), eq(seenFlag.ref, row.slug)))
      viewer = { rulesAccepted: accepted?.version === row.rulesVersion, dropSeen: seen !== undefined }
    }
    return {
      number: row.number,
      slug: row.slug,
      label: isoWeekLabel(localDateOf(row.startsAt)),
      seasonId: row.seasonId,
      phase: phaseOf(row, now),
      startsAt: row.startsAt,
      submitEndsAt: row.submitEndsAt,
      voteEndsAt: row.voteEndsAt,
      challenge: row.challenge,
      golden: row.golden,
      sample: {
        title: s.title,
        credits: s.credits,
        origin: s.origin,
        licenseText: s.licenseText,
        bpm: s.bpm,
        musicalKey: s.musicalKey as MusicalKey | null,
        genreHint: s.genreHint,
        durationMs: s.durationMs,
        peaks: Buffer.from(s.peaks).toString('base64'),
        chops: JSON.parse(s.chops) as Chop[],
        hasStems: s.stemsPublicId !== null,
        coverUrl: files.coverUrl(s.coverPublicId, 1024),
        streamUrl: files.streamUrl(s.audioPublicId),
      },
      viewer,
    }
  }

  /** Una semana pública: ya ha empezado. Antes del drop no existe para nadie (§2.1, `scheduled`). */
  async function publicRow(slug: string, now: number): Promise<WeekRow> {
    const row = await findBySlug(slug)
    if (row.startsAt > now) throw appError('NOT_FOUND', 'No existe esa semana.')
    return row
  }

  const holder = () => deps.newId()

  return {
    // ── Admin (3.7) ─────────────────────────────────────────────────────────────────────────────

    async schedule(actorId: string, input: WeekCreate, now: number): Promise<AdminWeek> {
      const monday = parseMonday(input.monday)
      const bounds = scheduleWeek(monday)
      if (bounds.startsAt <= now)
        throw appError('WEEK_LOCKED', 'Solo se programan semanas que aún no han empezado.')
      const s = await requireSample(input.sampleId)
      const [overlap] = await db
        .select({ slug: week.slug })
        .from(week)
        .where(and(lt(week.startsAt, bounds.voteEndsAt), gt(week.voteEndsAt, bounds.startsAt)))
      if (overlap)
        throw appError('WEEK_OVERLAP', 'Ya hay una semana programada en esas fechas.', {
          details: { slug: overlap.slug },
        })
      const [before] = await db.select({ n: count() }).from(week).where(lt(week.startsAt, bounds.startsAt))
      const row: WeekRow = {
        id: deps.newId(),
        number: (before?.n ?? 0) + 1,
        slug: weekSlug(monday),
        seasonId: seasonOf(monday),
        sampleId: s.id,
        challenge: input.challenge ?? null,
        blind: input.blind,
        golden: input.golden,
        rulesVersion: RULES_VERSION,
        ...bounds,
        sealedAt: null,
        resultRevision: 0,
        createdBy: actorId,
        createdAt: now,
      }
      const [first, second] = renumber(bounds.startsAt, 1) as [BatchStatement, BatchStatement]
      await runBatch(db, [
        first,
        db.insert(week).values(row),
        second,
        auditStatement(db, {
          id: deps.newId(),
          actorId,
          action: 'week.schedule',
          target: `week:${row.slug}`,
          payload: { sampleId: s.id, challenge: row.challenge, blind: row.blind, golden: row.golden },
          now,
        }),
      ])
      return toAdmin(row, s.title, undefined, now)
    },

    async update(actorId: string, slug: string, patch: WeekUpdate, now: number): Promise<AdminWeek> {
      const row = await findBySlug(slug)
      assertScheduled(row, now)
      const next: Partial<WeekRow> = {}
      if (patch.sampleId !== undefined) next.sampleId = (await requireSample(patch.sampleId)).id
      if (patch.challenge !== undefined) next.challenge = patch.challenge ?? null
      if (patch.blind !== undefined) next.blind = patch.blind
      if (patch.golden !== undefined) next.golden = patch.golden
      await runBatch(db, [
        db.update(week).set(next).where(eq(week.id, row.id)),
        auditStatement(db, {
          id: deps.newId(),
          actorId,
          action: 'week.update',
          target: `week:${slug}`,
          payload: next,
          now,
        }),
      ])
      return adminWeek(slug, now)
    },

    async unschedule(actorId: string, slug: string, now: number): Promise<void> {
      const row = await findBySlug(slug)
      assertScheduled(row, now)
      await runBatch(db, [
        db.delete(week).where(eq(week.id, row.id)),
        ...renumber(row.startsAt, -1),
        auditStatement(db, {
          id: deps.newId(),
          actorId,
          action: 'week.unschedule',
          target: `week:${slug}`,
          payload: { sampleId: row.sampleId },
          now,
        }),
      ])
    },

    /** Todas las semanas y los lunes sin semana desde el de hoy (`RF-ADM-02`: los huecos en rojo). */
    async calendar(now: number): Promise<AdminCalendar> {
      const rows = await db
        .select({ week, title: sample.title })
        .from(week)
        .innerJoin(sample, eq(sample.id, week.sampleId))
        .orderBy(asc(week.startsAt))
      const downloads = await downloadsByWeek()
      const taken = new Set(rows.map((row) => mondayText(row.week)))
      const first = mondayOf(now)
      const gaps: string[] = []
      for (let i = 0; i < CALENDAR_HORIZON_WEEKS; i++) {
        const monday = formatLocalDate(addDays(first, 7 * i))
        if (!taken.has(monday)) gaps.push(monday)
      }
      return {
        weeks: rows.map((row) => toAdmin(row.week, row.title, downloads.get(row.week.id), now)),
        gaps,
      }
    },

    adminWeek,

    // ── Público (3.8, 3.9) ──────────────────────────────────────────────────────────────────────

    /**
     * La semana en juego (`open` o `voting`) y, si no hay, cuándo es el próximo drop. Antes, sella lo que
     * haya cerrado (perezoso, `RF-DROP-03`).
     */
    async current(now: number, viewerId: string | null): Promise<CurrentWeek> {
      await sealDueWeeks(db, { now, holder: holder() })
      const [live] = await db
        .select()
        .from(week)
        .where(and(lte(week.startsAt, now), gt(week.voteEndsAt, now)))
        .limit(1)
      const [next] = await db
        .select({ startsAt: week.startsAt, number: week.number })
        .from(week)
        .where(gt(week.startsAt, now))
        .orderBy(asc(week.startsAt))
        .limit(1)
      return {
        week: live ? await toPublic(live, now, viewerId) : null,
        next: next ?? null,
      }
    },

    async bySlug(slug: string, now: number, viewerId: string | null): Promise<PublicWeek> {
      const row = await publicRow(slug, now)
      if (row.sealedAt === null && row.voteEndsAt <= now) {
        await sealDueWeeks(db, { now, holder: holder() })
        return toPublic(await findBySlug(slug), now, viewerId)
      }
      return toPublic(row, now, viewerId)
    },

    // ── Bases y descarga (3.10) ─────────────────────────────────────────────────────────────────

    async acceptRules(userId: string, slug: string, now: number): Promise<void> {
      const row = await publicRow(slug, now)
      if (!canDownload(row, now))
        throw appError('WEEK_PHASE_CLOSED', 'Los envíos de esta semana están cerrados.')
      await db
        .insert(rulesAcceptance)
        .values({ userId, weekId: row.id, rulesVersion: row.rulesVersion, acceptedAt: now })
        .onConflictDoUpdate({
          target: [rulesAcceptance.userId, rulesAcceptance.weekId],
          set: { rulesVersion: row.rulesVersion, acceptedAt: now },
        })
    },

    async download(userId: string, slug: string, kind: 'original' | 'stems', now: number): Promise<Download> {
      const files = storage()
      const row = await publicRow(slug, now)
      if (!canDownload(row, now))
        throw appError('WEEK_PHASE_CLOSED', 'El sample se descarga mientras los envíos están abiertos.')
      const [accepted] = await db
        .select({ version: rulesAcceptance.rulesVersion })
        .from(rulesAcceptance)
        .where(and(eq(rulesAcceptance.userId, userId), eq(rulesAcceptance.weekId, row.id)))
      if (accepted?.version !== row.rulesVersion)
        throw appError('RULES_NOT_ACCEPTED', 'Acepta las bases de la semana para descargar el sample.')
      const s = await requireSample(row.sampleId)
      const publicId = kind === 'stems' ? s.stemsPublicId : s.audioPublicId
      if (!publicId) throw appError('NOT_FOUND', 'Este sample no tiene stems.')
      const expiresAt = now + DOWNLOAD_TTL_MS
      const downloadUrl = files.downloadUrl(publicId, kind, { format: s.format, expiresAtMs: expiresAt })
      await db
        .insert(sampleDownload)
        .values({ userId, weekId: row.id, kind, count: 1, firstAt: now, lastAt: now })
        .onConflictDoUpdate({
          target: [sampleDownload.userId, sampleDownload.weekId, sampleDownload.kind],
          set: { count: sql`${sampleDownload.count} + 1`, lastAt: now },
        })
      return { downloadUrl, expiresAt }
    },

    // ── Lo ya visto (3.11) ──────────────────────────────────────────────────────────────────────

    async markDropSeen(userId: string, slug: string, now: number): Promise<void> {
      const row = await publicRow(slug, now)
      await db
        .insert(seenFlag)
        .values({ userId, kind: 'drop', ref: row.slug, seenAt: now })
        .onConflictDoNothing()
    },

    /** Los lunes de las próximas `weeks` semanas sin semana programada (para `adminAlerts`, 3.12). */
    async gapsWithin(now: number, horizonMs: number): Promise<string[]> {
      const until = now + horizonMs
      const rows = await db
        .select({ startsAt: week.startsAt })
        .from(week)
        .where(and(gte(week.voteEndsAt, now), lte(week.startsAt, until)))
      const taken = new Set(rows.map((row) => mondayText(row)))
      const gaps: string[] = []
      for (let monday = mondayOf(now); scheduleWeek(monday).startsAt <= until; monday = addDays(monday, 7)) {
        const text = formatLocalDate(monday)
        if (scheduleWeek(monday).voteEndsAt > now && !taken.has(text)) gaps.push(text)
      }
      return gaps
    },
  }
}

export type WeeksService = ReturnType<typeof createWeeksService>
