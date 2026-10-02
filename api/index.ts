// Función de Vercel (guía §4.15): toda la API (/api/*) la atiende la misma app de Fastify.
// Escrito, sin desplegar: el despliegue real se valida al crear el proyecto en Vercel (Fase 10).
//
// Carga el artefacto empaquetado (`apps/server/dist/vercel.mjs`, de `pnpm build`), no la fuente: la
// fuente del servidor y de `@beatbattle/*` es TypeScript con imports sin extensión que Node no carga
// por sí solo. El artefacto es un ESM autocontenido que `node` carga tal cual (lo comprueba
// `apps/server/scripts/smoke-bundle.mjs` dentro de `pnpm build`). La lógica (entorno de producción,
// orígenes de las previews, migraciones, arranque una vez por instancia y 503 si falla) está en
// `apps/server/src/serverless.ts`, con sus tests.

// @ts-expect-error: el artefacto lo genera `pnpm build` y no lleva declaraciones; su tipo es `NodeHandler`.
import handler from '../apps/server/dist/vercel.mjs'
import type { NodeHandler } from '../apps/server/src/serverless'

export default handler as NodeHandler
