import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type Db = LibSQLDatabase<typeof schema> & { $client: Client }

/** Ruta del fichero de una URL `file:` (o `null` si la BD es en memoria o remota). */
export function filePathOf(url: string): string | null {
  if (!url.startsWith('file:')) return null
  const path = url.slice('file:'.length).split('?', 1)[0] ?? ''
  if (path === '' || path === ':memory:') return null
  return path
}

/** ¿BD local (fichero o `:memory:`, con conexión propia) o remota (Turso, `sqld`, por HTTP o WS)? */
export function isLocalDb(db: Pick<Db, '$client'>): boolean {
  return db.$client.protocol === 'file'
}

/**
 * Activa las claves ajenas, solo en una BD local: por HTTP no se mantiene entre peticiones y sería
 * una ida y vuelta de red inútil en cada arranque en frío.
 */
export async function enableLocalForeignKeys(db: Db): Promise<void> {
  if (isLocalDb(db)) await db.$client.execute('PRAGMA foreign_keys = ON')
}

/**
 * Cliente libSQL con Drizzle (guía §4.11): fichero en local (`file:./data/local.db`, crea la
 * carpeta si no existe), `:memory:` en tests y Turso (`libsql://…` + token) en producción. Con una
 * BD remota no hace ninguna petición: el cliente se conecta en la primera consulta.
 *
 * Claves ajenas: se activan en local para que un orden de borrado incorrecto falle en los tests,
 * pero **ninguna lógica depende de ellas**: libSQL por HTTP (Turso, `sqld`) no mantiene
 * `PRAGMA foreign_keys` entre peticiones, así que allí ni se piden. Por eso no se usa
 * `ON DELETE CASCADE` y los borrados son explícitos, hijos antes que padres, en un único `batch`
 * (`runBatch`, en `batch.ts`).
 *
 * Con `:memory:` no se usan transacciones interactivas (abrirían otra conexión, es decir, otra BD
 * vacía): las operaciones atómicas van por `batch`.
 */
export async function createDb(url: string, authToken?: string): Promise<Db> {
  const file = filePathOf(url)
  if (file) mkdirSync(dirname(resolve(file)), { recursive: true })
  const client = createClient(authToken ? { url, authToken } : { url })
  const db = drizzle(client, { schema }) as Db
  await enableLocalForeignKeys(db)
  return db
}
