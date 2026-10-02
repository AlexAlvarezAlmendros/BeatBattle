import { bootServerless, createServerlessHandler } from './serverless'

/**
 * Entrada de la función de Vercel (guía §4.15): `pnpm build` la empaqueta en `dist/vercel.mjs`, un ESM
 * autocontenido que Node carga tal cual, y `api/index.ts` lo exporta. La lógica (entorno de producción,
 * orígenes de las previews, migraciones, arranque una vez por instancia y 503 si falla) está en
 * `serverless.ts`, con sus tests.
 */
export default createServerlessHandler(() => bootServerless(process.env))
