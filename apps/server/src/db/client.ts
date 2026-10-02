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

/**
 * Cliente libSQL con Drizzle (guía §4.11): fichero en local (`file:./data/local.db`, crea la
 * carpeta si no existe), `:memory:` en tests y Turso (`libsql://…` + token) en producción.
 *
 * Claves ajenas: se activan en local para que un orden de borrado incorrecto falle en los tests,
 * pero **ninguna lógica depende de ellas**: libSQL por HTTP (Turso, `sqld`) no mantiene
 * `PRAGMA foreign_keys` entre peticiones. Por eso no se usa `ON DELETE CASCADE` y los borrados son
 * explícitos, hijos antes que padres, en un único `batch` (`runBatch`, en `batch.ts`).
 *
 * Con `:memory:` no se usan transacciones interactivas (abrirían otra conexión, es decir, otra BD
 * vacía): las operaciones atómicas van por `batch`.
 */
export async function createDb(url: string, authToken?: string): Promise<Db> {
  const file = filePathOf(url)
  if (file) mkdirSync(dirname(resolve(file)), { recursive: true })
  const client = createClient(authToken ? { url, authToken } : { url })
  await client.execute('PRAGMA foreign_keys = ON')
  return drizzle(client, { schema }) as Db
}
