import type { EntryList } from '@beatbattle/shared'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { audio } from '../../audio/engine'
import { queryKeys } from '../../net/queryKeys'
import { deleteVote, putVote } from '../../net/votes'
import { type ListenReceipt, useListenReceipt } from '../player/listen'

/**
 * El voto optimista (guía §3.8.4, §4.7.2; tarea 5.15): la lista dice ya la nota nueva (`myVote`) y, si el
 * servidor no la guarda, vuelve la anterior, suena `ui.error` y el error llega a las estrellas, que lo dicen
 * («No se ha guardado tu voto»). Al guardarse, la cola del Modo Jurado se vuelve a pedir. Quitar el voto
 * (`RF-VOTE-13`) hace lo mismo al revés.
 */

type Snapshot = [readonly unknown[], EntryList | undefined][]

function setMyVote(client: QueryClient, slug: string, entryId: string, stars: number | null): Snapshot {
  const prefix = ['entries', 'list', slug]
  const before = client.getQueriesData<EntryList>({ queryKey: prefix })
  client.setQueriesData<EntryList>({ queryKey: prefix }, (list) =>
    list
      ? {
          ...list,
          entries: list.entries.map((item) => (item.id === entryId ? { ...item, myVote: stars } : item)),
        }
      : list,
  )
  return before
}

function restore(client: QueryClient, snapshot: Snapshot): void {
  for (const [key, data] of snapshot) client.setQueryData(key, data)
}

export function useVote(entry: { id: string; weekSlug: string }) {
  const client = useQueryClient()
  const vote = useCallback(
    async (stars: number) => {
      await client.cancelQueries({ queryKey: ['entries', 'list', entry.weekSlug] })
      const snapshot = setMyVote(client, entry.weekSlug, entry.id, stars)
      try {
        await putVote(entry.id, stars)
      } catch (error) {
        restore(client, snapshot)
        audio.play('ui.error')
        throw error
      }
      void client.invalidateQueries({ queryKey: queryKeys.jury.all })
    },
    [client, entry.id, entry.weekSlug],
  )
  const unvote = useCallback(async () => {
    const snapshot = setMyVote(client, entry.weekSlug, entry.id, null)
    try {
      await deleteVote(entry.id)
    } catch (error) {
      restore(client, snapshot)
      audio.play('ui.error')
      throw error
    }
    void client.invalidateQueries({ queryKey: queryKeys.jury.all })
  }, [client, entry.id, entry.weekSlug])
  return { vote, unvote }
}

/**
 * Lo que las estrellas necesitan del recibo (`StarsProps.listen`): mientras el servidor no lo da por cumplido,
 * nunca llegan al umbral (aunque se haya escuchado), para no ofrecer un voto que daría `LISTEN_REQUIRED`.
 */
export function starsListen(
  receipt: ListenReceipt | null,
  thresholdMs: number,
): { heardMs: number; thresholdMs: number } {
  if (!receipt) return { heardMs: 0, thresholdMs }
  if (receipt.qualified)
    return { heardMs: Math.max(receipt.listenedMs, receipt.thresholdMs), thresholdMs: receipt.thresholdMs }
  return { heardMs: Math.min(receipt.listenedMs, receipt.thresholdMs - 1), thresholdMs: receipt.thresholdMs }
}

/** El recibo de una entrada, en la forma de las estrellas. */
export function useStarsListen(entryId: string, thresholdMs: number) {
  return starsListen(useListenReceipt(entryId), thresholdMs)
}
