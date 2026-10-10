import { entryFormatOf, validateEntryAudio } from '@beatbattle/rules'
import { and, eq, gt, inArray, lte, ne } from 'drizzle-orm'
import { runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { entry, jobState, uploadIntent, week } from '../../db/schema'
import { enqueueEmail } from '../../email/outbox'
import type { EntryAssetKind, EntryStorage } from '../storage/entries'
import type { EntriesService } from './service'

/**
 * Limpieza y trabajo pendiente de las entradas en el `tick` (guía §4.8.4, §4.8.5, §4.12; tarea 4.9). Todo
 * troceado: cada `tick` hace un poco, para no pasar del tiempo de la función ni del límite de la Admin API
 * (500 peticiones por hora en el plan gratuito).
 *
 * - **Intents caducados**: se borra su recurso, si llegó a subirse, y quedan `expired`.
 * - **Entradas en `processing`**: se miden y pasan a `active` con su recibo; si lo medido no vale, se
 *   retiran, se borra el audio y sale `entry.failed`.
 * - **Huérfanos**: el barrido por prefijo (`listByPrefix`) borra los recursos de más de 24 h sin fila viva
 *   que los use (retiradas cuyo borrado falló, cuentas borradas, subidas canceladas, `RF-STO-05`). Guarda por
 *   dónde va en `job_state` y vuelve a empezar al día siguiente.
 */

/** Intents caducados que se limpian por `tick`. */
export const INTENTS_PER_TICK = 50
/** Entradas en `processing` que se miden por `tick` (cada medición son segundos). */
export const PROCESSING_PER_TICK = 2
/** Páginas del barrido por `tick`: cada una es una petición a la Admin API. */
export const SWEEP_PAGES_PER_TICK = 2
/** Edad mínima de un recurso sin fila para borrarlo (§4.8.5). */
export const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000

const SWEEP_JOB = 'entries.sweep'
const SWEEP_KINDS: readonly EntryAssetKind[] = ['entry', 'entryCover']
const DAY_MS = 24 * 60 * 60 * 1000

interface SweepState {
  /** Día UTC del barrido en curso (`Math.floor(now / DAY_MS)`). */
  day: number
  kind: EntryAssetKind
  cursor: string | null
  /** El barrido de ese día ya ha terminado. */
  done: boolean
}

export interface EntriesTickDeps {
  db: Db
  storage: EntryStorage
  entries: EntriesService
  newId: () => string
  publicUrl: string
}

export interface EntriesTickResult {
  intentsExpired: number
  processingCompleted: number
  processingRejected: number
  orphansRemoved: number
}

/** Los intents pendientes ya caducados: su recurso (si existe) se borra y quedan `expired`. */
async function expireIntents(deps: EntriesTickDeps, now: number): Promise<number> {
  const due = await deps.db
    .select()
    .from(uploadIntent)
    .where(and(eq(uploadIntent.status, 'pending'), lte(uploadIntent.expiresAt, now)))
    .limit(INTENTS_PER_TICK)
  for (const intent of due) {
    await deps.storage.remove(intent.publicId, intent.kind).catch(() => {})
    await deps.db.update(uploadIntent).set({ status: 'expired' }).where(eq(uploadIntent.id, intent.id))
  }
  return due.length
}

/** Las entradas que se quedaron sin medir (§4.8.4): se miden ahora y sale su recibo. */
async function completeProcessing(
  deps: EntriesTickDeps,
  now: number,
): Promise<{ completed: number; rejected: number }> {
  const { db } = deps
  const pending = await db
    .select()
    .from(entry)
    .innerJoin(week, eq(week.id, entry.weekId))
    .where(eq(entry.status, 'processing'))
    .limit(PROCESSING_PER_TICK)
  let completed = 0
  let rejected = 0
  for (const { entry: row, week: w } of pending) {
    let measured: Awaited<ReturnType<EntryStorage['measure']>> | null = null
    try {
      measured = await deps.storage.measure(row.audioPublicId, row.format)
    } catch {
      measured = null
    }
    const problem = measured
      ? validateEntryAudio({
          format: entryFormatOf(`audio.${row.format}`),
          sizeBytes: row.bytes,
          durationMs: measured.durationMs,
        })
      : null
    if (!measured || problem) {
      rejected += 1
      await runBatch(db, [
        db
          .update(entry)
          .set({
            status: 'withdrawn',
            statusReason: measured ? problem?.code : 'undecodable',
            updatedAt: now,
          })
          .where(eq(entry.id, row.id)),
        enqueueEmail(db, {
          id: deps.newId(),
          kind: 'entry.failed',
          target: { userId: row.userId },
          idempotencyKey: `entry.failed:${row.id}:${row.etag}`,
          payload: {
            reason: measured ? 'audio' : 'undecodable',
            code: problem?.code ?? 'ENTRY_ASSET_INVALID',
            details: problem ?? { reason: 'undecodable' },
            weekNumber: w.number,
            weekSlug: w.slug,
            uploadUrl: `${deps.publicUrl}/subir`,
          },
          now,
        }),
      ])
      await deps.storage.remove(row.audioPublicId, 'entry').catch(() => {})
      continue
    }
    const changes = {
      durationMs: measured.durationMs,
      peaks: Buffer.from(measured.peaks.buffer, measured.peaks.byteOffset, measured.peaks.byteLength),
      loudnessLufs: measured.integratedLufs,
      truePeakDb: measured.truePeakDb,
      status: 'active' as const,
      updatedAt: now,
    }
    const next = { ...row, ...changes }
    await runBatch(db, [
      db
        .update(entry)
        .set(changes)
        .where(and(eq(entry.id, row.id), eq(entry.status, 'processing'))),
      enqueueEmail(db, {
        id: deps.newId(),
        kind: 'entry.receipt',
        target: { userId: row.userId },
        idempotencyKey: `entry.receipt:${row.id}:${row.etag}`,
        payload: deps.entries.receiptPayload(next, w),
        now,
      }),
    ])
    completed += 1
  }
  return { completed, rejected }
}

/** Los `public_id` que alguien usa todavía: entradas no retiradas e intents pendientes sin caducar. */
async function inUse(db: Db, publicIds: string[], now: number): Promise<Set<string>> {
  if (publicIds.length === 0) return new Set()
  const audios = await db
    .select({ id: entry.audioPublicId })
    .from(entry)
    .where(and(inArray(entry.audioPublicId, publicIds), ne(entry.status, 'withdrawn')))
  const covers = await db
    .select({ id: entry.coverPublicId })
    .from(entry)
    .where(and(inArray(entry.coverPublicId, publicIds), ne(entry.status, 'withdrawn')))
  const intents = await db
    .select({ id: uploadIntent.publicId })
    .from(uploadIntent)
    .where(
      and(
        inArray(uploadIntent.publicId, publicIds),
        eq(uploadIntent.status, 'pending'),
        gt(uploadIntent.expiresAt, now),
      ),
    )
  return new Set([...audios, ...covers, ...intents].map((row) => row.id).filter((id): id is string => !!id))
}

async function readSweep(db: Db, today: number): Promise<SweepState> {
  const [row] = await db.select().from(jobState).where(eq(jobState.name, SWEEP_JOB))
  const fresh: SweepState = { day: today, kind: 'entry', cursor: null, done: false }
  if (!row) return fresh
  const state = JSON.parse(row.value) as SweepState
  return state.day === today ? state : fresh
}

/** Barrido de huérfanos (§4.8.5): como mucho `SWEEP_PAGES_PER_TICK` páginas; sigue en el siguiente `tick`. */
async function sweepOrphans(deps: EntriesTickDeps, now: number): Promise<number> {
  const { db } = deps
  const today = Math.floor(now / DAY_MS)
  const state = await readSweep(db, today)
  if (state.done) return 0
  let removed = 0
  for (let page = 0; page < SWEEP_PAGES_PER_TICK && !state.done; page++) {
    const { items, next } = await deps.storage.listByPrefix(state.kind, state.cursor)
    const old = items.filter((item) => now - item.createdAtMs >= ORPHAN_AGE_MS)
    const used = await inUse(
      db,
      old.map((item) => item.publicId),
      now,
    )
    for (const item of old) {
      if (used.has(item.publicId)) continue
      await deps.storage.remove(item.publicId, item.kind).catch(() => {})
      removed += 1
    }
    if (next) state.cursor = next
    else {
      const following = SWEEP_KINDS[SWEEP_KINDS.indexOf(state.kind) + 1]
      if (following) {
        state.kind = following
        state.cursor = null
      } else state.done = true
    }
  }
  await db
    .insert(jobState)
    .values({ name: SWEEP_JOB, value: JSON.stringify(state), updatedAt: now })
    .onConflictDoUpdate({ target: jobState.name, set: { value: JSON.stringify(state), updatedAt: now } })
  return removed
}

/** El trabajo de las entradas en un `tick`. */
export async function entriesTick(deps: EntriesTickDeps, now: number): Promise<EntriesTickResult> {
  const intentsExpired = await expireIntents(deps, now)
  const { completed, rejected } = await completeProcessing(deps, now)
  const orphansRemoved = await sweepOrphans(deps, now)
  return { intentsExpired, processingCompleted: completed, processingRejected: rejected, orphansRemoved }
}
