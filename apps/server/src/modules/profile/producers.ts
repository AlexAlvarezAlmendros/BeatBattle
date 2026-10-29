import type { EntryProducer } from '@beatbattle/shared'
import { eq, inArray } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { producerProfile, user } from '../../db/schema'
import type { ImageStorage } from '../storage/cloudinary'

/** El avatar de un productor en las listas públicas (como en la ficha de una entrada sellada). */
const PRODUCER_AVATAR_SIZE = 256

/**
 * Los productores de unas filas públicas ya reveladas (la clasificación de una temporada, el salón de la fama; guía
 * §2.9): nombre, nombre visible y avatar, por id de cuenta. Una cuenta borrada (`deleted:<id>` en sus entradas
 * selladas, `RF-PRF-04`) no está: quien llama la pinta como «Productor eliminado» (`producer: null`).
 */
export async function producerCards(
  db: Db,
  images: ImageStorage | null,
  ids: Iterable<string>,
): Promise<Map<string, EntryProducer>> {
  const wanted = [...new Set(ids)].filter((id) => !id.startsWith('deleted:'))
  if (wanted.length === 0) return new Map()
  const people = await db
    .select({
      id: user.id,
      username: user.username,
      displayUsername: user.displayUsername,
      name: user.name,
      avatarPublicId: producerProfile.avatarPublicId,
    })
    .from(user)
    .leftJoin(producerProfile, eq(producerProfile.userId, user.id))
    .where(inArray(user.id, wanted))
  return new Map(
    people.map((person) => {
      const username = person.username ?? ''
      return [
        person.id,
        {
          username,
          displayName: person.displayUsername || username || person.name,
          avatarUrl:
            person.avatarPublicId && images
              ? images.imageUrl(person.avatarPublicId, { size: PRODUCER_AVATAR_SIZE })
              : null,
        },
      ]
    }),
  )
}
