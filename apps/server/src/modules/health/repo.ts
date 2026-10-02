import type { Db } from '../../db/client'

/** Acceso a datos del módulo: solo SQL, sin reglas de negocio ni HTTP. */
export const healthRepo = {
  /** Consulta trivial para saber si la base de datos responde. */
  async ping(db: Db): Promise<void> {
    await db.$client.execute('SELECT 1')
  },
}
