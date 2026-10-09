import type {
  AdminSample,
  Chop,
  MusicalKey,
  SampleCreate,
  SampleSignRequest,
  SampleUpdate,
  SignedUpload,
} from '@beatbattle/shared'
import { eq } from 'drizzle-orm'
import { runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { sample, week } from '../../db/schema'
import { auditStatement } from '../../lib/audit'
import { appError } from '../../lib/errors'
import type { AudioMeasurement } from '../../media/measure'
import {
  SAMPLE_COVER_MIN_PX,
  SAMPLE_FORMATS,
  SAMPLE_MAX_BYTES,
  type SampleAsset,
  type SamplePart,
  type SampleStorage,
} from '../storage/samples'

/**
 * Samples del panel de admin (§2.4, §2.14; tarea 3.6, `RF-ADM-01`). El navegador sube el original, la
 * portada y los stems directamente al almacenamiento con la firma; aquí se verifica cada parte con la Admin
 * API y se **mide** el original en servidor (duración, sonoridad y forma de onda, §4.8.4): nada de eso lo
 * dice el navegador. Cada cambio queda en `audit_log` en el mismo `batch` (`RF-ADM-05`).
 */

export interface SamplesDeps {
  db: Db
  storage: SampleStorage | null
  measure: (source: ReadableStream<Uint8Array>) => Promise<AudioMeasurement>
  newId: () => string
}

type SampleRow = typeof sample.$inferSelect

function requireStorage(storage: SampleStorage | null): SampleStorage {
  if (!storage) throw appError('STORAGE_UNAVAILABLE', 'No hay almacenamiento de audio configurado.')
  return storage
}

function assetProblem(part: SamplePart, asset: SampleAsset | null): string | null {
  if (!asset) return 'no está subido'
  if (!SAMPLE_FORMATS[part].includes(asset.format.toLowerCase())) return `formato ${asset.format} no admitido`
  if (asset.bytes > SAMPLE_MAX_BYTES[part]) return 'pasa del tamaño máximo'
  if (
    part === 'cover' &&
    ((asset.width ?? 0) < SAMPLE_COVER_MIN_PX || (asset.height ?? 0) < SAMPLE_COVER_MIN_PX)
  )
    return `la portada mide menos de ${SAMPLE_COVER_MIN_PX} px`
  return null
}

async function checkedAsset(
  storage: SampleStorage,
  sampleId: string,
  part: SamplePart,
): Promise<SampleAsset> {
  const publicId = storage.publicIdFor(sampleId, part)
  const asset = await storage.verify(publicId, part)
  const problem = assetProblem(part, asset)
  if (problem || !asset)
    throw appError('SAMPLE_ASSET_INVALID', `La parte «${part}» ${problem}.`, { details: { part, problem } })
  return asset
}

/** Chops dentro del audio (`RF-ADM-01`): cada uno empieza antes de acabar y acaba antes del final. */
function checkChops(chops: readonly Chop[], durationMs: number): void {
  const outside = chops.findIndex((chop) => chop.endMs > durationMs)
  if (outside >= 0)
    throw appError('VALIDATION_FAILED', 'Un chop acaba después del final del sample.', {
      details: [{ path: ['chops', outside, 'endMs'], message: 'después del final del sample' }],
    })
}

export function createSamplesService(deps: SamplesDeps) {
  const { db } = deps

  async function weeksOf(sampleId: string): Promise<string[]> {
    const rows = await db.select({ slug: week.slug }).from(week).where(eq(week.sampleId, sampleId))
    return rows.map((row) => row.slug).sort()
  }

  function toAdmin(row: SampleRow, weeks: string[]): AdminSample {
    const storage = requireStorage(deps.storage)
    return {
      id: row.id,
      title: row.title,
      credits: row.credits,
      origin: row.origin,
      licenseText: row.licenseText,
      bpm: row.bpm,
      musicalKey: row.musicalKey as MusicalKey | null,
      genreHint: row.genreHint,
      durationMs: row.durationMs,
      bytes: row.bytes,
      format: row.format,
      loudnessLufs: row.loudnessLufs,
      peaks: Buffer.from(row.peaks).toString('base64'),
      chops: JSON.parse(row.chops) as Chop[],
      hasStems: row.stemsPublicId !== null,
      coverUrl: storage.coverUrl(row.coverPublicId, 512),
      streamUrl: storage.streamUrl(row.audioPublicId),
      weeks,
      createdAt: row.createdAt,
    }
  }

  async function find(id: string): Promise<SampleRow> {
    const [row] = await db.select().from(sample).where(eq(sample.id, id))
    if (!row) throw appError('NOT_FOUND', 'No existe ese sample.')
    return row
  }

  async function measureOriginal(storage: SampleStorage, asset: SampleAsset) {
    try {
      return await deps.measure(await storage.openOriginal(asset.publicId, asset.format))
    } catch (error) {
      throw appError('SAMPLE_ASSET_INVALID', 'El original no se ha podido medir: ¿es un WAV o un AIFF?', {
        details: { part: 'original', problem: 'no se puede medir' },
        cause: error,
      })
    }
  }

  return {
    sign(input: SampleSignRequest, now: number): { sampleId: string; upload: SignedUpload } {
      const storage = requireStorage(deps.storage)
      const sampleId = input.sampleId ?? deps.newId()
      return { sampleId, upload: storage.sign({ sampleId, part: input.part, nowMs: now }) }
    },

    async list(): Promise<AdminSample[]> {
      const rows = await db.select().from(sample).orderBy(sample.createdAt)
      const uses = await db.select({ sampleId: week.sampleId, slug: week.slug }).from(week)
      return rows.reverse().map((row) =>
        toAdmin(
          row,
          uses
            .filter((use) => use.sampleId === row.id)
            .map((use) => use.slug)
            .sort(),
        ),
      )
    },

    async get(id: string): Promise<AdminSample> {
      const row = await find(id)
      return toAdmin(row, await weeksOf(id))
    },

    async create(actorId: string, input: SampleCreate, now: number): Promise<AdminSample> {
      const storage = requireStorage(deps.storage)
      const [existing] = await db.select({ id: sample.id }).from(sample).where(eq(sample.id, input.sampleId))
      if (existing) throw appError('CONFLICT', 'Ese sample ya existe: edítalo.')
      const original = await checkedAsset(storage, input.sampleId, 'original')
      const cover = await checkedAsset(storage, input.sampleId, 'cover')
      const stems = input.hasStems ? await checkedAsset(storage, input.sampleId, 'stems') : null
      const measured = await measureOriginal(storage, original)
      const row: SampleRow = {
        id: input.sampleId,
        title: input.title,
        credits: input.credits,
        origin: input.origin ?? null,
        licenseText: input.licenseText,
        bpm: input.bpm ?? null,
        musicalKey: input.musicalKey ?? null,
        genreHint: input.genreHint ?? null,
        durationMs: measured.durationMs,
        bytes: original.bytes,
        format: original.format.toLowerCase(),
        audioPublicId: original.publicId,
        stemsPublicId: stems?.publicId ?? null,
        coverPublicId: cover.publicId,
        peaks: Buffer.from(measured.peaks.buffer, measured.peaks.byteOffset, measured.peaks.byteLength),
        loudnessLufs: measured.integratedLufs,
        chops: '[]',
        createdBy: actorId,
        createdAt: now,
      }
      await runBatch(db, [
        db.insert(sample).values(row),
        auditStatement(db, {
          id: deps.newId(),
          actorId,
          action: 'sample.create',
          target: `sample:${row.id}`,
          payload: { title: row.title, durationMs: row.durationMs, loudnessLufs: row.loudnessLufs },
          now,
        }),
      ])
      return toAdmin(row, [])
    },

    async update(actorId: string, id: string, patch: SampleUpdate, now: number): Promise<AdminSample> {
      const storage = requireStorage(deps.storage)
      const row = await find(id)
      const next: Partial<SampleRow> = {}
      for (const key of ['title', 'credits', 'licenseText'] as const)
        if (patch[key] !== undefined) next[key] = patch[key]
      if (patch.origin !== undefined) next.origin = patch.origin ?? null
      if (patch.bpm !== undefined) next.bpm = patch.bpm ?? null
      if (patch.musicalKey !== undefined) next.musicalKey = patch.musicalKey ?? null
      if (patch.genreHint !== undefined) next.genreHint = patch.genreHint ?? null
      if (patch.remeasure) {
        const original = await checkedAsset(storage, id, 'original')
        const measured = await measureOriginal(storage, original)
        Object.assign(next, {
          durationMs: measured.durationMs,
          bytes: original.bytes,
          format: original.format.toLowerCase(),
          peaks: Buffer.from(measured.peaks.buffer, measured.peaks.byteOffset, measured.peaks.byteLength),
          loudnessLufs: measured.integratedLufs,
        })
      }
      if (patch.hasStems === true) next.stemsPublicId = (await checkedAsset(storage, id, 'stems')).publicId
      if (patch.hasStems === false) next.stemsPublicId = null
      const durationMs = next.durationMs ?? row.durationMs
      if (patch.chops) {
        checkChops(patch.chops, durationMs)
        next.chops = JSON.stringify(patch.chops)
      } else if (next.durationMs !== undefined) {
        // Un original nuevo más corto deja fuera los chops que ya no caben: se vacían y hay que marcarlos.
        const chops = JSON.parse(row.chops) as Chop[]
        if (chops.some((chop) => chop.endMs > durationMs)) next.chops = '[]'
      }
      const removedStems = patch.hasStems === false ? row.stemsPublicId : null
      await runBatch(db, [
        db.update(sample).set(next).where(eq(sample.id, id)),
        auditStatement(db, {
          id: deps.newId(),
          actorId,
          action: 'sample.update',
          target: `sample:${id}`,
          payload: { fields: Object.keys(next).filter((key) => key !== 'peaks') },
          now,
        }),
      ])
      if (removedStems) await storage.remove(removedStems, 'stems').catch(() => undefined)
      return toAdmin({ ...row, ...next }, await weeksOf(id))
    },

    async remove(actorId: string, id: string, now: number): Promise<{ external: () => Promise<void> }> {
      const storage = requireStorage(deps.storage)
      const row = await find(id)
      const weeks = await weeksOf(id)
      if (weeks.length > 0)
        throw appError('SAMPLE_IN_USE', 'Lo usa alguna semana: cámbialo en el calendario antes.', {
          details: { weeks },
        })
      await runBatch(db, [
        db.delete(sample).where(eq(sample.id, id)),
        auditStatement(db, {
          id: deps.newId(),
          actorId,
          action: 'sample.delete',
          target: `sample:${id}`,
          payload: { title: row.title },
          now,
        }),
      ])
      return {
        external: async () => {
          await storage.remove(row.audioPublicId, 'original')
          await storage.remove(row.coverPublicId, 'cover')
          if (row.stemsPublicId) await storage.remove(row.stemsPublicId, 'stems')
        },
      }
    },
  }
}

export type SamplesService = ReturnType<typeof createSamplesService>
