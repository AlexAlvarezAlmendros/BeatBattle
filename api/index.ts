// Función de Vercel (guía §4.15): toda la API (/api/*) la atiende la misma app de Fastify.
// Escrito, sin desplegar: se valida al crear el proyecto en Vercel (Fase 10).
//
// La lógica (entorno forzado a producción, orígenes de las previews, migraciones, arranque una vez
// por instancia con reintento y 503 si falla) está en apps/server/src/serverless.ts, con sus tests.
import { bootServerless, createServerlessHandler } from '../apps/server/src/serverless'

export default createServerlessHandler(() => bootServerless(process.env))
