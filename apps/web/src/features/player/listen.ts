import { listenThresholdMs, PLAY_COUNT_MIN_CONTINUOUS_MS } from '@beatbattle/rules'
import { ListenQualifySchema, ListenStartSchema } from '@beatbattle/shared'
import { z } from 'zod'
import { create } from 'zustand'
import { ApiClientError, apiFetch } from '../../net/api'
import { useSession } from '../account/session'

/**
 * El recibo de escucha y las escuchas (guía §2.7, §4.7.3; tarea 5.14):
 *
 * - **Lo escuchado** sale de `audio.played` (los tramos que de verdad han sonado): saltar con la onda no
 *   suma (`RF-VOTE-04`).
 * - **Recibo**: con la cuenta verificada y una entrada que se puede votar (ajena, `votable`), al empezar a
 *   sonar se pide `POST /listen` (el servidor apunta el inicio) y, al cumplir el umbral, `POST
 *   /listen/qualify`, que comprueba el tiempo de reloj; si aún falta, lo dice (`remainingMs`) y se vuelve a
 *   pedir pasado ese tiempo. Las estrellas leen `useListenReceipt` (dormidas → despiertas, `RF-VOTE-10`).
 * - **Escucha** (`RF-PLAY-07`): a los 10 s seguidos (sin saltos), `POST /play` una vez por sesión de escucha
 *   (cada vez que se carga la pista), también sin cuenta. Es estadística: si falla, no pasa nada.
 */

export interface ListenReceipt {
  /** Lo escuchado de verdad (ms). */
  listenedMs: number
  /** Lo que hace falta para votar (ms); el del servidor en cuanto responde. */
  thresholdMs: number
  /** El servidor ha dado el recibo por cumplido: se puede votar. */
  qualified: boolean
  /** No hay recibo posible (sin cuenta verificada, la propia, votaciones cerradas). */
  unavailable: boolean
}

/** Lo que el recibo necesita de la pista. */
export interface ListenTrack {
  id: string
  kind: 'entry' | 'sample'
  durationMs: number
  /** Ajena y de una semana con votaciones abiertas: se puede pedir el recibo. */
  votable?: boolean
}

interface ListenState {
  receipts: Readonly<Record<string, ListenReceipt>>
}

export const useListen = create<ListenState>(() => ({ receipts: {} }))

/** El recibo de una entrada (o `null` si aún no ha sonado). */
export function useListenReceipt(entryId: string | null | undefined): ListenReceipt | null {
  return useListen((state) => (entryId ? (state.receipts[entryId] ?? null) : null))
}

/** Lo que ha sonado de verdad, en ms: la suma de `played` (los saltos no cuentan). */
export function playedMs(played: TimeRanges): number {
  let total = 0
  for (let i = 0; i < played.length; i++) total += played.end(i) - played.start(i)
  return Math.round(total * 1000)
}

interface Session {
  trackId: string
  /** Id de la sesión de escucha (`POST /play`). */
  playId: string
  /** Desde dónde suena sin saltos (s), o `null` en pausa. */
  continuousFrom: number | null
  counted: boolean
}

/** Por entrada: el `listenId` del servidor, y si ya se ha pedido o cumplido. */
const server = new Map<
  string,
  { listenId: string | null; asking: boolean; retry: ReturnType<typeof setTimeout> | null }
>()
let session: Session | null = null

const OkSchema = z.object({ ok: z.literal(true) })

function patch(id: string, change: Partial<ListenReceipt>, base: ListenReceipt): void {
  useListen.setState((state) => ({
    receipts: { ...state.receipts, [id]: { ...(state.receipts[id] ?? base), ...change } },
  }))
}

function canAskReceipt(track: ListenTrack): boolean {
  const me = useSession.getState().me
  return track.kind === 'entry' && track.votable === true && me?.emailVerified === true
}

function initial(track: ListenTrack): ListenReceipt {
  return {
    listenedMs: 0,
    thresholdMs: listenThresholdMs(track.durationMs),
    qualified: false,
    unavailable: !canAskReceipt(track),
  }
}

/** Empieza a sonar una pista: sesión de escucha nueva si es otra, y el recibo si hace falta. */
export function listenStarted(track: ListenTrack, currentTime: number): void {
  if (session?.trackId !== track.id)
    session = { trackId: track.id, playId: crypto.randomUUID(), continuousFrom: null, counted: false }
  session.continuousFrom = currentTime
  if (track.kind !== 'entry') return
  const base = initial(track)
  if (!useListen.getState().receipts[track.id]) patch(track.id, {}, base)
  if (!canAskReceipt(track)) return
  const known = server.get(track.id)
  if (known) return
  server.set(track.id, { listenId: null, asking: true, retry: null })
  apiFetch(`/api/entries/${encodeURIComponent(track.id)}/listen`, {
    method: 'POST',
    schema: ListenStartSchema,
  })
    .then((started) => {
      server.set(track.id, { listenId: started.listenId, asking: false, retry: null })
      patch(track.id, { thresholdMs: started.thresholdMs, unavailable: false }, base)
    })
    .catch(() => {
      // La propia, sin verificar o las votaciones cerradas: sin recibo (las estrellas no se ofrecen).
      server.set(track.id, { listenId: null, asking: false, retry: null })
      patch(track.id, { unavailable: true }, base)
    })
}

/** Se ha parado o se ha saltado: lo seguido vuelve a empezar desde aquí. */
export function listenInterrupted(currentTime: number | null): void {
  if (session) session.continuousFrom = currentTime
}

/** Cada `timeupdate`: lo escuchado, el recibo cumplido y la escucha a los 10 s seguidos. */
export function listenProgress(track: ListenTrack, played: TimeRanges, currentTime: number): void {
  if (track.kind !== 'entry') return
  if (session?.trackId === track.id && !session.counted && session.continuousFrom !== null) {
    if ((currentTime - session.continuousFrom) * 1000 >= PLAY_COUNT_MIN_CONTINUOUS_MS) {
      session.counted = true
      void apiFetch(`/api/entries/${encodeURIComponent(track.id)}/play`, {
        method: 'POST',
        body: { playId: session.playId },
        schema: OkSchema,
      }).catch(() => {})
    }
  }
  const base = initial(track)
  const receipt = useListen.getState().receipts[track.id] ?? base
  const listenedMs = Math.max(receipt.listenedMs, playedMs(played))
  if (listenedMs !== receipt.listenedMs) patch(track.id, { listenedMs }, base)
  if (listenedMs >= receipt.thresholdMs && !receipt.qualified) qualify(track.id, base)
}

function qualify(id: string, base: ListenReceipt): void {
  const known = server.get(id)
  if (!known?.listenId || known.asking || known.retry) return
  known.asking = true
  apiFetch(`/api/entries/${encodeURIComponent(id)}/listen/qualify`, {
    method: 'POST',
    body: { listenId: known.listenId },
    schema: ListenQualifySchema,
  })
    .then(() => {
      known.asking = false
      patch(id, { qualified: true }, base)
    })
    .catch((error: unknown) => {
      known.asking = false
      // El reloj del servidor aún no llega (se ha pausado, o empezó tarde): otra vez cuando toque.
      const remaining =
        error instanceof ApiClientError && error.code === 'LISTEN_REQUIRED'
          ? Number((error.details as { remainingMs?: number } | undefined)?.remainingMs)
          : Number.NaN
      if (Number.isFinite(remaining) && remaining > 0)
        known.retry = setTimeout(() => {
          known.retry = null
          qualify(id, base)
        }, remaining + 250)
    })
}

/** Para los tests: olvida recibos y sesión. */
export function resetListenForTests(): void {
  for (const known of server.values()) if (known.retry) clearTimeout(known.retry)
  server.clear()
  session = null
  useListen.setState({ receipts: {} })
}
