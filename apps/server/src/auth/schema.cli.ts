import { betterAuth } from 'better-auth'
import { schemaOptions } from './options'

/**
 * Solo para la CLI de Better Auth (`pnpm --filter @beatbattle/server auth:schema`): genera
 * `src/db/auth-schema.ts` a partir de las mismas opciones que usa el servidor. No se importa en ningún
 * otro sitio.
 */
export const auth = betterAuth({ ...schemaOptions(), secret: 'solo-para-generar-el-esquema-xxxxxxxxxxxx' })
