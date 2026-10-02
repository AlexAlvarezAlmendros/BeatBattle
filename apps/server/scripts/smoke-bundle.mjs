// Prueba de humo del artefacto de la función de Vercel (`dist/vercel.mjs`, `pnpm build`): lo carga con
// `node` puro, sin `tsx` ni Vitest, lo monta en un servidor HTTP y comprueba que `GET /api/health`
// responde 200 con el sobre `{ data }`. Si el empaquetado deja un import que Node no resuelve, o la
// API no arranca (configuración, migraciones), falla aquí y no en el despliegue.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

// Lo mínimo para arrancar como en Vercel: producción (lo fuerza la propia función), BD en memoria y
// las migraciones del repo.
process.env.BB_PUBLIC_URL ??= 'https://battle.example'
process.env.DATABASE_URL = ':memory:'
process.env.MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url))
process.env.LOG_LEVEL = 'silent'

const { default: handler } = await import('../dist/vercel.mjs')
assert.equal(typeof handler, 'function', 'dist/vercel.mjs no exporta un handler de Node')

const server = createServer(handler)
await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
try {
  const { port } = server.address()
  const response = await fetch(`http://127.0.0.1:${port}/api/health`)
  const body = await response.json()
  assert.equal(response.status, 200, `GET /api/health → ${response.status} ${JSON.stringify(body)}`)
  assert.equal(body.data?.status, 'ok')
  assert.equal(body.data?.db, 'up')
  console.log('smoke-bundle: dist/vercel.mjs carga con node y /api/health responde 200 { data }')
} finally {
  await new Promise((done) => server.close(done))
}
