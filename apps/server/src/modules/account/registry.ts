import type { BatchStatement } from '../../db/batch'
import type { Db } from '../../db/client'
import type { ImageStorage } from '../storage/cloudinary'

/**
 * Registro de los datos de una cuenta (guía §4.14, tarea 2.21; `RF-PRF-04`, `RF-PRF-05`): cada módulo que
 * guarda datos personales dice aquí qué exporta y qué borra. Exportar junta las secciones de todos;
 * borrar junta sus sentencias en **un único `batch`** (sin cascadas en libSQL por HTTP, §4.11), y después
 * limpia lo de fuera (Cloudinary). Cada fase añade su módulo: entradas y audios (4), votos (5), XP y
 * logros (7).
 */

export interface AccountContext {
  db: Db
  images: ImageStorage | null
  userId: string
  /** Email de la cuenta, en minúsculas (para lo que va por dirección: suscripciones, cola). */
  email: string
  now: number
}

/** Lo de fuera de la BD que queda por borrar después del `batch` (si falla, queda en el registro). */
export interface ExternalCleanup {
  describe: string
  run(): Promise<void>
}

export interface AccountDataModule {
  /** Nombre de la sección en la exportación. */
  name: string
  /** Lo que exporta (`RF-PRF-05`). */
  exportData(ctx: AccountContext): Promise<unknown>
  /**
   * Las sentencias que borran sus filas, para el `batch` del borrado, y lo que haya fuera. Se piden
   * **antes** del `batch`, así que pueden leer lo que necesiten (el avatar, las suscripciones…).
   */
  cleanup(ctx: AccountContext): Promise<{ statements: BatchStatement[]; external?: ExternalCleanup[] }>
}
