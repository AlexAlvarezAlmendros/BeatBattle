import type { BatchItem } from 'drizzle-orm/batch'
import type { Db } from './client'

/** Sentencia de Drizzle que se puede meter en un `batch` (insert, update, delete, select, `sql`). */
export type BatchStatement = BatchItem<'sqlite'>

/**
 * Ejecuta varias sentencias en un único `batch` atómico (guía §4.11): o se aplican todas o
 * ninguna, en una sola ida y vuelta (también con Turso por HTTP, donde no hay transacciones
 * interactivas baratas).
 *
 * Regla de borrado: libSQL por HTTP no mantiene `PRAGMA foreign_keys`, así que nada se borra en
 * cascada. Quien borre una fila borra antes, en el mismo batch, todo lo que depende de ella (hijos
 * antes que padres). Acepta una lista vacía (no hace nada) para poder construirla por partes.
 */
export async function runBatch(db: Db, statements: readonly BatchStatement[]): Promise<void> {
  const [first, ...rest] = statements
  if (!first) return
  await db.batch([first, ...rest])
}
