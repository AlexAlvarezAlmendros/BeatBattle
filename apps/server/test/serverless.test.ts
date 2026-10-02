import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../src/config/env'
import { bootServerless, createServerlessHandler, type NodeHandler, serverlessEnv } from '../src/serverless'
import { makeApp } from './helpers'

/** Raíz del repo: el directorio de trabajo de la función en Vercel. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/** Mínimo para arrancar en producción, con BD en memoria y sin registro. */
const PROD = { BB_PUBLIC_URL: 'https://battle.example', DATABASE_URL: ':memory:', LOG_LEVEL: 'silent' }

const apps: FastifyInstance[] = []
const servers: Server[] = []
afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise((done) => s.close(done))
  for (const a of apps.splice(0)) await a.close()
  vi.restoreAllMocks()
})

describe('serverlessEnv', () => {
  it('fuerza producción y confía en el proxy salvo que se diga otra cosa', () => {
    const env = serverlessEnv({ NODE_ENV: 'development', BB_TEST_CLOCK: '1', TRUST_PROXY: '' })
    expect(env.NODE_ENV).toBe('production')
    expect(env.TRUST_PROXY).toBe('1')
    expect(serverlessEnv({ TRUST_PROXY: '0' }).TRUST_PROXY).toBe('0')
    // y con ello la guarda de §4.12: el reloj de prueba no arranca en Vercel
    expect(() => loadEnv(serverlessEnv({ ...PROD, BB_TEST_CLOCK: '1' }))).toThrow(/BB_TEST_CLOCK/)
  })

  it('en una preview permite los orígenes de la rama y del despliegue', () => {
    const preview = {
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'beatbattle-git-f3-otherpeople.vercel.app',
      VERCEL_URL: 'beatbattle-abc123-otherpeople.vercel.app',
    }
    const config = loadEnv(serverlessEnv({ ...preview, ALLOWED_ORIGINS: 'https://extra.example' }))
    expect(config.allowedOrigins).toEqual([
      'https://extra.example',
      'https://beatbattle-git-f3-otherpeople.vercel.app',
      'https://beatbattle-abc123-otherpeople.vercel.app',
    ])
    // sin BB_PUBLIC_URL, la URL pública es la de la rama
    expect(config.publicUrl).toBe('https://beatbattle-git-f3-otherpeople.vercel.app')
    // con BB_PUBLIC_URL definida, se respeta
    expect(loadEnv(serverlessEnv({ ...preview, BB_PUBLIC_URL: 'https://pr.example' })).publicUrl).toBe(
      'https://pr.example',
    )
  })

  it('en producción no añade orígenes de Vercel', () => {
    const config = loadEnv(
      serverlessEnv({ ...PROD, VERCEL_ENV: 'production', VERCEL_URL: 'beatbattle-abc123.vercel.app' }),
    )
    expect(config.allowedOrigins).toEqual(['https://battle.example'])
  })
})

describe('bootServerless', () => {
  it('con MIGRATIONS_DIR vacía (como en .env.example) usa la carpeta incluida y arranca', async () => {
    const example = parseEnv(readFileSync(new URL('../.env.example', import.meta.url), 'utf8'))
    expect(example.MIGRATIONS_DIR).toBe('')
    const app = await bootServerless({ ...example, ...PROD }, { cwd: REPO_ROOT })
    apps.push(app)
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ status: 'ok', db: 'up' })
  })

  it('MIGRATIONS_DIR relativa se resuelve contra el directorio de trabajo', async () => {
    const app = await bootServerless({ ...PROD, MIGRATIONS_DIR: 'apps/server/drizzle' }, { cwd: REPO_ROOT })
    apps.push(app)
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200)
  })

  it('una carpeta de migraciones inexistente hace fallar el arranque', async () => {
    await expect(
      bootServerless({ ...PROD, MIGRATIONS_DIR: '/no/existe/drizzle' }, { cwd: REPO_ROOT }),
    ).rejects.toThrow()
  })
})

describe('createServerlessHandler', () => {
  const serve = async (handler: NodeHandler) => {
    const server = createServer((req, res) => void handler(req, res))
    servers.push(server)
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const { port } = server.address() as AddressInfo
    return (path: string) => fetch(`http://127.0.0.1:${port}${path}`)
  }

  const okApp = async () => {
    const { app } = await makeApp()
    apps.push(app)
    return app
  }

  it('si el arranque falla responde 503 con el sobre y la siguiente petición lo reintenta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let calls = 0
    const get = await serve(
      createServerlessHandler(async () => {
        calls += 1
        if (calls === 1) throw new Error('Turso no responde')
        return okApp()
      }),
    )

    const down = await get('/api/health')
    expect(down.status).toBe(503)
    expect(down.headers.get('content-type')).toContain('application/json')
    expect(down.headers.get('cache-control')).toBe('no-store')
    expect(down.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await down.json()).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible.' },
    })
    expect(console.error).toHaveBeenCalledTimes(1)

    const up = await get('/api/health')
    expect(up.status).toBe(200)
    expect(((await up.json()) as { data: { status: string } }).data.status).toBe('ok')
    expect(calls).toBe(2)
  })

  it('las peticiones que llegan mientras arranca comparten un único arranque', async () => {
    let calls = 0
    const get = await serve(
      createServerlessHandler(async () => {
        calls += 1
        return okApp()
      }),
    )
    const statuses = await Promise.all([1, 2, 3, 4].map(async () => (await get('/api/health')).status))
    expect(statuses).toEqual([200, 200, 200, 200])
    expect((await get('/api/health')).status).toBe(200)
    expect(calls).toBe(1)
  })

  it('importar la entrada de la función (src/vercel.ts) no arranca nada (ni deja rechazos sin manejar)', async () => {
    // `api/index.ts` carga su versión empaquetada (`dist/vercel.mjs`), que prueba `pnpm build` con
    // `node` puro (`scripts/smoke-bundle.mjs`).
    const mod = await import('../src/vercel')
    expect(typeof mod.default).toBe('function')
  })
})
