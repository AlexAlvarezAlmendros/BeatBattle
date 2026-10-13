import {
  battleAlias,
  canSubmit,
  coverSeed,
  ENTRY_MIN_DURATION_MS,
  type EntryAudioProblem,
  type EntryFormat,
  entryFormatOf,
  isoWeekLabel,
  localDateOf,
  playbackGainDb,
  receiptCode,
  validateEntryAudio,
} from '@beatbattle/rules'
import {
  ENTRY_CHUNK_BYTES,
  type EntryAudioReplace,
  type EntryCoverSignRequest,
  type EntryCreate,
  type EntrySignedUpload,
  type EntrySignRequest,
  type EntryUpdate,
  type MusicalKey,
  type OwnEntry,
  type PublicEntry,
} from '@beatbattle/shared'
import { and, count, eq, inArray, max, ne } from 'drizzle-orm'
import type { BatchStatement } from '../../db/batch'
import { runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { entry, producerProfile, rulesAcceptance, uploadIntent, user, vote, week } from '../../db/schema'
import { enqueueEmail } from '../../email/outbox'
import { auditStatement } from '../../lib/audit'
import { appError } from '../../lib/errors'
import type { AudioMeasurement } from '../../media/measure'
import type { ImageStorage } from '../storage/cloudinary'
import type { EntryAsset, EntryStorage } from '../storage/entries'

/**
 * Participar (guía §2.5, §4.8.2, §4.8.4; tareas 4.5 y 4.6): firmar la subida con su *intent* y registrar la
 * entrada. El servidor fija el `public_id` (`RF-ENT-04`), verifica con la Admin API (`RF-STO-03`), mide
 * (`RF-STO-04`) y valida lo **medido** con `validateEntryAudio` (`RF-ENT-03`, `RF-ENT-05`): lo que el
 * navegador declara solo sirve para no firmar subidas que de antemano no valen.
 */

/** Caducidad del *intent* y de la firma (regla de Cloudinary, §4.8.2). */
export const INTENT_TTL_MS = 60 * 60 * 1000
/**
 * Tiempo que se espera a la medición antes de dejar la entrada en `processing` (§4.8.4): el `tick` la
 * completa. Por debajo del límite de la función, con margen para el resto de la petición.
 */
export const MEASURE_BUDGET_MS = 20_000

const AUDIO_MIME_FORMAT: Record<string, EntryFormat> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/aiff': 'aiff',
  'audio/x-aiff': 'aiff',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
}

/** Estados en los que una entrada ocupa el hueco de la semana (`entry_one_per_week`). */
const LIVE = ['processing', 'active', 'hidden'] as const

export interface EntriesDeps {
  db: Db
  storage: EntryStorage | null
  newId: () => string
  /** Origen público de la web, para los enlaces de los emails. */
  publicUrl: string
  measureBudgetMs?: number
  /** Avatares, para el productor de una entrada ya revelada. */
  images?: ImageStorage | null
}

/** Lado del avatar del productor en la ficha de una entrada revelada. */
const PRODUCER_AVATAR_SIZE = 256

type WeekRow = typeof week.$inferSelect
type EntryRow = typeof entry.$inferSelect
type IntentRow = typeof uploadIntent.$inferSelect

/** El motivo de `validateEntryAudio` como error de la API, con su código propio. */
function audioProblemError(problem: EntryAudioProblem) {
  const message =
    problem.code === 'UNSUPPORTED_FORMAT'
      ? 'Formato no admitido: WAV, AIFF, FLAC o MP3.'
      : problem.code === 'FILE_TOO_LARGE'
        ? 'El archivo pasa de 100 MB.'
        : problem.limit === 'max'
          ? 'El beat dura más de 4 minutos.'
          : 'El beat dura menos de 30 segundos.'
  return appError(problem.code, message, { details: problem })
}

/** Error de un recurso que no vale (§4.8.4), con el motivo estable en `details.reason`. */
class AssetFailure extends Error {
  constructor(
    readonly reason: 'missing' | 'mismatch' | 'undecodable' | 'audio',
    readonly error: ReturnType<typeof appError>,
  ) {
    super(error.message)
  }
}

const assetError = (reason: AssetFailure['reason'], message: string) =>
  new AssetFailure(reason, appError('ENTRY_ASSET_INVALID', message, { details: { reason } }))

/** `Promise` que se resuelve con `null` si `promise` tarda más de `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export function createEntriesService(deps: EntriesDeps) {
  const { db } = deps
  const budget = deps.measureBudgetMs ?? MEASURE_BUDGET_MS

  function storage(): EntryStorage {
    if (!deps.storage) throw appError('STORAGE_UNAVAILABLE', 'No hay almacenamiento de audio configurado.')
    return deps.storage
  }

  /** La semana en la que se sube: tiene que existir, estar en `open` y con las bases aceptadas. */
  async function submittableWeek(userId: string, slug: string, now: number): Promise<WeekRow> {
    const [row] = await db.select().from(week).where(eq(week.slug, slug))
    if (!row || row.startsAt > now) throw appError('NOT_FOUND', 'No existe esa semana.')
    if (!canSubmit(row, now))
      throw appError('SUBMISSIONS_CLOSED', 'Los envíos de esta semana están cerrados.')
    const [accepted] = await db
      .select({ version: rulesAcceptance.rulesVersion })
      .from(rulesAcceptance)
      .where(and(eq(rulesAcceptance.userId, userId), eq(rulesAcceptance.weekId, row.id)))
    if (accepted?.version !== row.rulesVersion)
      throw appError('RULES_NOT_ACCEPTED', 'Acepta las bases de la semana para participar.')
    return row
  }

  async function liveEntry(userId: string, weekId: string): Promise<EntryRow | undefined> {
    const [row] = await db
      .select()
      .from(entry)
      .where(and(eq(entry.userId, userId), eq(entry.weekId, weekId), inArray(entry.status, [...LIVE])))
    return row
  }

  async function voteCount(entryId: string): Promise<number> {
    const [row] = await db.select({ n: count() }).from(vote).where(eq(vote.entryId, entryId))
    return row?.n ?? 0
  }

  /** El *intent* del usuario, pendiente, sin caducar, del tipo y de la semana que tocan. */
  async function usableIntent(
    userId: string,
    intentId: string,
    kind: IntentRow['kind'],
    weekId: string,
    now: number,
  ): Promise<IntentRow> {
    const [row] = await db.select().from(uploadIntent).where(eq(uploadIntent.id, intentId))
    if (
      !row ||
      row.userId !== userId ||
      row.kind !== kind ||
      row.weekId !== weekId ||
      row.status !== 'pending' ||
      row.expiresAt <= now
    )
      throw appError(
        'UPLOAD_INTENT_INVALID',
        'La subida ha caducado o no es válida. Vuelve a subir el archivo.',
      )
    return row
  }

  /**
   * Comprobaciones de la Admin API (§4.8.4, paso 2): existe, es el `public_id` firmado (y por tanto de su
   * carpeta) y se subió después del *intent*.
   */
  async function verifiedAsset(intent: IntentRow): Promise<EntryAsset> {
    const asset = await storage().verify(intent.publicId, intent.kind)
    if (!asset) throw assetError('missing', 'No encontramos el archivo subido. Vuelve a subirlo.')
    // Cloudinary da `created_at` con resolución de segundos.
    const signedAt = Math.floor(intent.createdAt / 1000) * 1000
    if (asset.publicId !== intent.publicId || asset.createdAtMs < signedAt)
      throw assetError('mismatch', 'El archivo subido no es el que se firmó. Vuelve a subirlo.')
    return asset
  }

  /** Mide dentro del presupuesto: `null` si no da tiempo (la entrada queda en `processing`). */
  async function measureWithin(asset: EntryAsset): Promise<AudioMeasurement | null> {
    try {
      return await within(storage().measure(asset.publicId, asset.format), budget)
    } catch {
      throw assetError(
        'undecodable',
        'No hemos podido leer el audio. Comprueba que el archivo no esté dañado.',
      )
    }
  }

  async function entryWithWeek(id: string): Promise<{ row: EntryRow; w: WeekRow }> {
    const [found] = await db
      .select()
      .from(entry)
      .innerJoin(week, eq(week.id, entry.weekId))
      .where(eq(entry.id, id))
    if (!found) throw appError('NOT_FOUND', 'No existe esa entrada.')
    return { row: found.entry, w: found.week }
  }

  /**
   * La entrada viva del usuario (`RNF-SEC-03`: de otro, 404, sin decir que existe) con los envíos abiertos
   * (`SUBMISSIONS_CLOSED` si no).
   */
  async function ownedLive(userId: string, id: string, now: number): Promise<{ row: EntryRow; w: WeekRow }> {
    const found = await entryWithWeek(id)
    if (found.row.userId !== userId || !(LIVE as readonly string[]).includes(found.row.status))
      throw appError('NOT_FOUND', 'No existe esa entrada.')
    if (!canSubmit(found.w, now))
      throw appError('SUBMISSIONS_CLOSED', 'Los envíos de esta semana están cerrados.')
    return found
  }

  /**
   * Verifica (Admin API), valida formato y tamaño, mide dentro del presupuesto y valida la duración medida
   * (§4.8.4). Lanza `AssetFailure` si el recurso no vale.
   */
  async function ingestAudio(
    intent: IntentRow,
  ): Promise<{ asset: EntryAsset; measured: AudioMeasurement | null }> {
    const asset = await verifiedAsset(intent)
    const format = entryFormatOf(`audio.${asset.format}`)
    // Formato y tamaño, con lo que dice Cloudinary, antes de gastar la medición (la duración aún no cuenta).
    const early = validateEntryAudio({ format, sizeBytes: asset.bytes, durationMs: ENTRY_MIN_DURATION_MS })
    if (early) throw new AssetFailure('audio', audioProblemError(early))
    const measured = await measureWithin(asset)
    const durationMs = asset.durationMs ?? measured?.durationMs ?? null
    if (durationMs !== null) {
      const problem = validateEntryAudio({ format, sizeBytes: asset.bytes, durationMs })
      if (problem) throw new AssetFailure('audio', audioProblemError(problem))
    }
    return { asset, measured }
  }

  function receiptOf(row: Pick<WeekRow, 'startsAt'>, receiptNumber: number): string {
    return receiptCode(isoWeekLabel(localDateOf(row.startsAt)), receiptNumber)
  }

  function toPublic(row: EntryRow, w: WeekRow): PublicEntry {
    const files = storage()
    const revealed = !w.blind || w.sealedAt !== null
    return {
      id: row.id,
      weekSlug: w.slug,
      alias: row.alias,
      title: row.title,
      description: row.description,
      bpm: row.bpm,
      musicalKey: row.musicalKey as MusicalKey | null,
      daw: row.daw,
      genres: JSON.parse(row.tags) as string[],
      durationMs: row.durationMs,
      peaks: row.peaks ? Buffer.from(row.peaks).toString('base64') : null,
      gainDb: row.loudnessLufs === null ? null : playbackGainDb(row.loudnessLufs),
      streamUrl: files.streamUrl(row.audioPublicId),
      cover:
        revealed && row.coverPublicId
          ? { kind: 'own', url: files.coverUrl(row.coverPublicId, 512) }
          : { kind: 'generative', seed: row.coverSeed },
      // La autoría la añade la ficha pública cuando la semana deja verla (tarea 4.7).
      producer: null,
    }
  }

  async function toOwn(row: EntryRow, w: WeekRow, now: number): Promise<OwnEntry> {
    const votes = await voteCount(row.id)
    return {
      ...toPublic(row, w),
      status: row.status,
      receiptCode: receiptOf(w, row.receiptNumber),
      format: row.format,
      bytes: row.bytes,
      loudnessLufs: row.loudnessLufs,
      truePeakDb: row.truePeakDb,
      ownCoverUrl: row.coverPublicId ? storage().coverUrl(row.coverPublicId, 512) : null,
      canReplaceAudio: votes === 0 && canSubmit(w, now),
      submittedAt: row.submittedAt,
      updatedAt: row.updatedAt,
    }
  }

  /** Lo que lleva el recibo (§2.12.1): número, alias, ficha, informe técnico, hora y huella. */
  function receiptPayload(row: EntryRow, w: WeekRow) {
    return {
      receiptCode: receiptOf(w, row.receiptNumber),
      weekNumber: w.number,
      weekSlug: w.slug,
      alias: row.alias,
      title: row.title,
      durationMs: row.durationMs,
      format: row.format,
      bytes: row.bytes,
      bpm: row.bpm,
      musicalKey: row.musicalKey,
      loudnessLufs: row.loudnessLufs,
      truePeakDb: row.truePeakDb,
      gainDb: row.loudnessLufs === null ? null : playbackGainDb(row.loudnessLufs),
      peaks: row.peaks ? Buffer.from(row.peaks).toString('base64') : null,
      etag: row.etag,
      receivedAt: row.submittedAt,
      entryUrl: `${deps.publicUrl}/e/${row.id}`,
      editUrl: `${deps.publicUrl}/subir`,
    }
  }

  /**
   * Un recurso que no vale: se borra, el *intent* queda `failed` y sale `entry.failed` con el motivo
   * (§2.12.1), todo antes de devolver el error.
   */
  async function reject(
    userId: string,
    intent: IntentRow,
    w: WeekRow,
    failure: AssetFailure,
    now: number,
  ): Promise<never> {
    await storage()
      .remove(intent.publicId, intent.kind)
      .catch(() => {})
    await runBatch(db, [
      db.update(uploadIntent).set({ status: 'failed' }).where(eq(uploadIntent.id, intent.id)),
      enqueueEmail(db, {
        id: deps.newId(),
        kind: 'entry.failed',
        target: { userId },
        idempotencyKey: `entry.failed:${intent.id}`,
        payload: {
          reason: failure.reason,
          code: failure.error.code,
          details: failure.error.details ?? null,
          weekNumber: w.number,
          weekSlug: w.slug,
          uploadUrl: `${deps.publicUrl}/subir`,
        },
        now,
      }),
    ])
    throw failure.error
  }

  return {
    // ── 4.5: firmar la subida ───────────────────────────────────────────────────────────────────

    /**
     * `POST /api/uploads/sign` de una entrada o su portada (§4.8.2): comprueba sesión (en la ruta), bases,
     * fase, hueco (`RF-ENT-01`, salvo al sustituir sin votos, `RF-ENT-08`) y lo declarado; crea el *intent*
     * con el `public_id` del servidor y devuelve la firma.
     */
    async sign(
      userId: string,
      request: EntrySignRequest | EntryCoverSignRequest,
      now: number,
    ): Promise<EntrySignedUpload> {
      const files = storage()
      const w = await submittableWeek(userId, request.weekSlug, now)
      let entryId: string | null = null
      if (request.kind === 'entry') {
        const current = await liveEntry(userId, w.id)
        if (request.replacing) {
          if (!current || current.id !== request.replacing)
            throw appError('NOT_FOUND', 'No tienes esa entrada en esta semana.')
          if ((await voteCount(current.id)) > 0)
            throw appError('ENTRY_HAS_VOTES', 'Tu entrada ya tiene votos: el audio no se puede sustituir.')
          entryId = current.id
        } else if (current) {
          throw appError('ENTRY_EXISTS', 'Ya estás en la batalla esta semana: edita tu entrada.')
        }
        const problem = validateEntryAudio({
          format: AUDIO_MIME_FORMAT[request.mime] ?? null,
          sizeBytes: request.bytes,
          durationMs: request.durationMs,
        })
        if (problem) throw audioProblemError(problem)
      }
      const intentId = deps.newId()
      const publicId = files.publicIdFor(request.kind, w.slug, deps.newId())
      const expiresAt = now + INTENT_TTL_MS
      await db.insert(uploadIntent).values({
        id: intentId,
        userId,
        kind: request.kind,
        weekId: w.id,
        entryId,
        publicId,
        status: 'pending',
        declaredBytes: request.bytes,
        declaredDurationMs: request.kind === 'entry' ? request.durationMs : null,
        expiresAt,
        createdAt: now,
      })
      const signed = files.sign({ kind: request.kind, publicId, intentId, nowMs: now })
      return { ...signed, intentId, expiresAt, chunkBytes: ENTRY_CHUNK_BYTES }
    },

    // ── 4.6: registrar la entrada ───────────────────────────────────────────────────────────────

    /**
     * `POST /api/weeks/:slug/entries` (§4.8.4): verifica, valida lo medido, mide, pone alias, semilla y
     * número de recibo, marca duplicados por `etag` (`RF-ENT-11`) y escribe la entrada y su recibo en un
     * `batch`. Si la medición no cabe en el presupuesto, la entrada queda en `processing` y el recibo sale
     * cuando el `tick` la complete.
     */
    async create(userId: string, slug: string, input: EntryCreate, now: number): Promise<OwnEntry> {
      const w = await submittableWeek(userId, slug, now)
      const intent = await usableIntent(userId, input.intentId, 'entry', w.id, now)
      if (intent.entryId !== null)
        throw appError('UPLOAD_INTENT_INVALID', 'Esta subida era para sustituir el audio de tu entrada.')
      if (await liveEntry(userId, w.id))
        throw appError('ENTRY_EXISTS', 'Ya estás en la batalla esta semana: edita tu entrada.')
      const cover = input.coverIntentId
        ? await usableIntent(userId, input.coverIntentId, 'entryCover', w.id, now)
        : null

      let asset: EntryAsset
      let measured: AudioMeasurement | null
      try {
        ;({ asset, measured } = await ingestAudio(intent))
        if (cover && !(await storage().verify(cover.publicId, 'entryCover')))
          throw assetError('missing', 'No encontramos la portada subida. Vuelve a subirla.')
      } catch (error) {
        if (error instanceof AssetFailure) return reject(userId, intent, w, error, now)
        throw error
      }

      const id = deps.newId()
      const taken = await db.select({ alias: entry.alias }).from(entry).where(eq(entry.weekId, w.id))
      const [last] = await db
        .select({ n: max(entry.receiptNumber) })
        .from(entry)
        .where(eq(entry.weekId, w.id))
      const [twin] = await db
        .select({ id: entry.id })
        .from(entry)
        .where(and(eq(entry.etag, asset.etag), ne(entry.userId, userId)))
        .limit(1)
      const row: EntryRow = {
        id,
        weekId: w.id,
        userId,
        alias: battleAlias(
          id,
          taken.map((item) => item.alias),
        ),
        title: input.title,
        description: input.description,
        bpm: input.bpm,
        musicalKey: input.musicalKey,
        daw: input.daw,
        tags: JSON.stringify(input.genres),
        audioPublicId: intent.publicId,
        etag: asset.etag,
        format: asset.format,
        bytes: asset.bytes,
        durationMs: asset.durationMs ?? measured?.durationMs ?? intent.declaredDurationMs ?? 0,
        peaks: measured
          ? Buffer.from(measured.peaks.buffer, measured.peaks.byteOffset, measured.peaks.byteLength)
          : null,
        loudnessLufs: measured?.integratedLufs ?? null,
        truePeakDb: measured?.truePeakDb ?? null,
        hotStartMs: null,
        coverPublicId: cover?.publicId ?? null,
        coverSeed: coverSeed(id),
        receiptNumber: (last?.n ?? 0) + 1,
        status: measured ? 'active' : 'processing',
        statusReason: null,
        playCount: 0,
        duplicateOf: twin?.id ?? null,
        submittedAt: now,
        updatedAt: now,
      }
      const statements: BatchStatement[] = [
        db.insert(entry).values(row),
        db
          .update(uploadIntent)
          .set({ status: 'done' })
          .where(inArray(uploadIntent.id, [intent.id, ...(cover ? [cover.id] : [])])),
      ]
      if (row.status === 'active')
        statements.push(
          enqueueEmail(db, {
            id: deps.newId(),
            kind: 'entry.receipt',
            target: { userId },
            idempotencyKey: `entry.receipt:${row.id}:${row.etag}`,
            payload: receiptPayload(row, w),
            now,
          }),
        )
      if (twin)
        statements.push(
          auditStatement(db, {
            id: deps.newId(),
            actorId: 'system',
            action: 'entry.duplicate',
            target: row.id,
            payload: { duplicateOf: twin.id, etag: row.etag },
            now,
          }),
        )
      try {
        await runBatch(db, statements)
      } catch (error) {
        // Dos subidas a la vez de la misma cuenta: el índice parcial deja solo una (`RF-ENT-01`).
        if (await liveEntry(userId, w.id))
          throw appError('ENTRY_EXISTS', 'Ya estás en la batalla esta semana: edita tu entrada.')
        throw error
      }
      return toOwn(row, w, now)
    },

    // ── 4.7: la entrada pública, editar, sustituir el audio y retirar ──────────────────────────

    /**
     * `GET /api/entries/:id` (§4.10). Solo entradas activas; las demás (en `processing`, ocultas, retiradas,
     * descalificadas) no existen para nadie más que su dueño. En voto ciego antes del sellado, sin autoría
     * ni portada propia (`RF-ENT-10`); después, con el productor (o «Productor eliminado»: `producer` nulo).
     */
    async publicEntry(id: string, viewerId: string | null): Promise<PublicEntry> {
      const { row, w } = await entryWithWeek(id)
      const visible = row.status === 'active' || (viewerId !== null && row.userId === viewerId)
      if (!visible || row.status === 'withdrawn') throw appError('NOT_FOUND', 'No existe esa entrada.')
      const out = toPublic(row, w)
      const revealed = !w.blind || w.sealedAt !== null
      if (!revealed) return out
      const [person] = await db
        .select({
          username: user.username,
          displayUsername: user.displayUsername,
          name: user.name,
          avatarPublicId: producerProfile.avatarPublicId,
        })
        .from(user)
        .leftJoin(producerProfile, eq(producerProfile.userId, user.id))
        .where(eq(user.id, row.userId))
      if (!person) return out
      const username = person.username ?? ''
      return {
        ...out,
        producer: {
          username,
          displayName: person.displayUsername || username || person.name,
          avatarUrl:
            person.avatarPublicId && deps.images
              ? deps.images.imageUrl(person.avatarPublicId, { size: PRODUCER_AVATAR_SIZE })
              : null,
        },
      }
    },

    /** La entrada propia de una semana (para `viewer.entry` y `/subir`), o `null`. */
    async ownEntry(userId: string, weekId: string, now: number): Promise<OwnEntry | null> {
      const row = await liveEntry(userId, weekId)
      if (!row) return null
      const [w] = await db.select().from(week).where(eq(week.id, weekId))
      return w ? toOwn(row, w, now) : null
    },

    /**
     * `PATCH /api/entries/:id`: la ficha, hasta el cierre de envíos (§2.5). `coverIntentId` pone otra portada
     * propia ya subida; `null` la quita (vuelve la generativa). La anterior se borra del almacenamiento.
     */
    async update(userId: string, id: string, input: EntryUpdate, now: number): Promise<OwnEntry> {
      const { row, w } = await ownedLive(userId, id, now)
      let coverPublicId = row.coverPublicId
      let coverIntent: IntentRow | null = null
      if (input.coverIntentId !== undefined) {
        if (input.coverIntentId === null) coverPublicId = null
        else {
          coverIntent = await usableIntent(userId, input.coverIntentId, 'entryCover', w.id, now)
          if (!(await storage().verify(coverIntent.publicId, 'entryCover')))
            throw appError('ENTRY_ASSET_INVALID', 'No encontramos la portada subida. Vuelve a subirla.', {
              details: { reason: 'missing' },
            })
          coverPublicId = coverIntent.publicId
        }
      }
      const changes: Partial<EntryRow> = {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.bpm !== undefined ? { bpm: input.bpm } : {}),
        ...(input.musicalKey !== undefined ? { musicalKey: input.musicalKey } : {}),
        ...(input.daw !== undefined ? { daw: input.daw } : {}),
        ...(input.genres !== undefined ? { tags: JSON.stringify(input.genres) } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        coverPublicId,
        updatedAt: now,
      }
      await runBatch(db, [
        db.update(entry).set(changes).where(eq(entry.id, row.id)),
        ...(coverIntent
          ? [db.update(uploadIntent).set({ status: 'done' }).where(eq(uploadIntent.id, coverIntent.id))]
          : []),
      ])
      if (row.coverPublicId && row.coverPublicId !== coverPublicId)
        await storage()
          .remove(row.coverPublicId, 'entryCover')
          .catch(() => {})
      return toOwn({ ...row, ...changes }, w, now)
    },

    /**
     * `PUT /api/entries/:id/audio` (`RF-ENT-08`): solo sin votos y con los envíos abiertos. El audio nuevo se
     * verifica y mide como al registrar; la entrada conserva alias y número de recibo, y sale `entry.changed`
     * con el recibo actualizado. El audio anterior se borra.
     */
    async replaceAudio(userId: string, id: string, input: EntryAudioReplace, now: number): Promise<OwnEntry> {
      const { row, w } = await ownedLive(userId, id, now)
      if ((await voteCount(row.id)) > 0)
        throw appError('ENTRY_HAS_VOTES', 'Tu entrada ya tiene votos: el audio no se puede sustituir.')
      const intent = await usableIntent(userId, input.intentId, 'entry', w.id, now)
      if (intent.entryId !== row.id)
        throw appError('UPLOAD_INTENT_INVALID', 'Esta subida no es para sustituir el audio de esta entrada.')
      let asset: EntryAsset
      let measured: AudioMeasurement | null
      try {
        ;({ asset, measured } = await ingestAudio(intent))
      } catch (error) {
        if (error instanceof AssetFailure) return reject(userId, intent, w, error, now)
        throw error
      }
      const [twin] = await db
        .select({ id: entry.id })
        .from(entry)
        .where(and(eq(entry.etag, asset.etag), ne(entry.userId, userId)))
        .limit(1)
      const changes: Partial<EntryRow> = {
        audioPublicId: intent.publicId,
        etag: asset.etag,
        format: asset.format,
        bytes: asset.bytes,
        durationMs: asset.durationMs ?? measured?.durationMs ?? intent.declaredDurationMs ?? 0,
        peaks: measured
          ? Buffer.from(measured.peaks.buffer, measured.peaks.byteOffset, measured.peaks.byteLength)
          : null,
        loudnessLufs: measured?.integratedLufs ?? null,
        truePeakDb: measured?.truePeakDb ?? null,
        hotStartMs: null,
        status: measured ? 'active' : 'processing',
        duplicateOf: twin?.id ?? null,
        updatedAt: now,
      }
      const next = { ...row, ...changes }
      await runBatch(db, [
        db.update(entry).set(changes).where(eq(entry.id, row.id)),
        db.update(uploadIntent).set({ status: 'done' }).where(eq(uploadIntent.id, intent.id)),
        ...(next.status === 'active'
          ? [
              enqueueEmail(db, {
                id: deps.newId(),
                kind: 'entry.changed',
                target: { userId },
                idempotencyKey: `entry.changed:${row.id}:${next.etag}`,
                payload: { change: 'replaced', ...receiptPayload(next, w) },
                now,
              }),
            ]
          : []),
        ...(twin
          ? [
              auditStatement(db, {
                id: deps.newId(),
                actorId: 'system',
                action: 'entry.duplicate',
                target: row.id,
                payload: { duplicateOf: twin.id, etag: next.etag },
                now,
              }),
            ]
          : []),
      ])
      await storage()
        .remove(row.audioPublicId, 'entry')
        .catch(() => {})
      return toOwn(next, w, now)
    },

    /**
     * `DELETE /api/entries/:id` (`RF-ENT-09`): retirar hasta el cierre de envíos. Borra sus votos, libera el
     * hueco de la semana (`withdrawn`) y borra audio y portada; sale `entry.changed` con los votos perdidos
     * (un dato del propio productor, nunca público).
     */
    async withdraw(userId: string, id: string, now: number): Promise<void> {
      const { row, w } = await ownedLive(userId, id, now)
      const votesLost = await voteCount(row.id)
      await runBatch(db, [
        db.delete(vote).where(eq(vote.entryId, row.id)),
        db
          .update(entry)
          .set({ status: 'withdrawn', statusReason: 'owner', updatedAt: now })
          .where(eq(entry.id, row.id)),
        enqueueEmail(db, {
          id: deps.newId(),
          kind: 'entry.changed',
          target: { userId },
          idempotencyKey: `entry.changed:${row.id}:withdrawn`,
          payload: {
            change: 'withdrawn',
            receiptCode: receiptOf(w, row.receiptNumber),
            weekNumber: w.number,
            weekSlug: w.slug,
            alias: row.alias,
            title: row.title,
            votesLost,
            uploadUrl: `${deps.publicUrl}/subir`,
          },
          now,
        }),
      ])
      const files = storage()
      await files.remove(row.audioPublicId, 'entry').catch(() => {})
      if (row.coverPublicId) await files.remove(row.coverPublicId, 'entryCover').catch(() => {})
    },

    /** Para las tareas 4.7–4.9: la entrada propia y la pública. */
    toOwn,
    toPublic,
    receiptPayload,
  }
}

export type EntriesService = ReturnType<typeof createEntriesService>
