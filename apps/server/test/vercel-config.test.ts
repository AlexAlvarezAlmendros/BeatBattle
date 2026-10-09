// Comprueba `vercel.json` (tarea 0.12): construcción, reescrituras y cabeceras de seguridad de la
// guía §4.13 (`RNF-SEC-01`). El despliegue real se valida al crear el proyecto en Vercel (Fase 10);
// el test de humo sobre la respuesta de `/` y `/api/health` en producción llega entonces.
//
// Reescrituras, según la documentación de Vercel (`vercel.json` › rewrites): «precedence is given to
// the filesystem prior to rewrites being applied». Es decir, un fichero estático que existe
// (`/index.html`, `/assets/index-abc123.js`, `/favicon.svg`) o una función (`/api` → `api/index.ts`)
// se sirve tal cual y las reescrituras solo se aplican a lo que no existe. Por eso:
//
// 1. `/api/(.*)` → `/api`: toda la API la atiende la app de Fastify, que recibe la URL original.
// 2. Fallback SPA `/((?!api(?:/|$)|assets/).*)` → `/index.html`: las rutas del cliente
//    (`/semana/41`, `/dev/galeria`…) cargan la SPA. Excluye `/api` y `/assets/` aunque el sistema
//    de ficheros ya gane: una ruta de API inexistente debe dar el 404 de la API (con su sobre
//    `{ error }`), no HTML; y un recurso de `/assets/` que no existe (p. ej. un trozo de un
//    despliegue anterior) debe dar 404 y no un `index.html` con 200 servido como JS y además
//    cacheado como inmutable durante un año.
//
// Vercel compila `source` con path-to-regexp 6 (`strict`, `sensitive`, delimitador `/`). Para fuentes
// hechas solo de segmentos literales y grupos sin nombre, como estas, el resultado equivale a la
// expresión regular tal cual anclada con `^…$` (comprobado con path-to-regexp 6.1.0, la versión que
// usa la CLI de Vercel). El test lo aprovecha y exige que las fuentes no usen parámetros `:nombre`.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface VercelHeader {
  key: string
  value: string
}

interface VercelConfig {
  installCommand: string
  buildCommand: string
  outputDirectory: string
  regions: string[]
  functions: Record<string, { includeFiles?: string; maxDuration?: number }>
  crons?: { path: string; schedule: string }[]
  rewrites: { source: string; destination: string }[]
  headers: { source: string; headers: VercelHeader[] }[]
}

const config = JSON.parse(
  readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8'),
) as VercelConfig

/** CSP literal de la guía §4.13 (tabla de seguridad, fila «Cabeceras»). */
const GUIDE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://res.cloudinary.com; media-src 'self' blob: https://res.cloudinary.com; connect-src 'self' https://api.cloudinary.com https://res.cloudinary.com; font-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

/** La misma CSP, directiva a directiva, para que un fallo diga cuál se ha roto. */
const EXPECTED_CSP: [directive: string, sources: string[]][] = [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'"]],
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['img-src', ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com']],
  ['media-src', ["'self'", 'blob:', 'https://res.cloudinary.com']],
  ['connect-src', ["'self'", 'https://api.cloudinary.com', 'https://res.cloudinary.com']],
  ['font-src', ["'self'"]],
  ['worker-src', ["'self'", 'blob:']],
  ['frame-ancestors', ["'none'"]],
  ['base-uri', ["'self'"]],
  ['form-action', ["'self'"]],
]

const ONE_YEAR_S = 31_536_000

/** Rutas representativas: raíz, rutas del cliente, API y un recurso con hash de Vite. */
const CLIENT_ROUTES = ['/', '/semana/41', '/semana/41/resultados', '/e/abc', '/p/productor', '/dev/galeria']
const API_ROUTES = ['/api/health', '/api/auth/sign-in/email', '/api/']
const ASSET = '/assets/index-abc123.js'

function sourceMatches(source: string, path: string): boolean {
  return new RegExp(`^${source}$`).test(path)
}

/** Cabeceras que Vercel añadiría a `path`: todas las reglas que casan, en orden. */
function headersFor(path: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const rule of config.headers) {
    if (!sourceMatches(rule.source, path)) continue
    for (const h of rule.headers) out.set(h.key.toLowerCase(), h.value)
  }
  return out
}

/** Destino de la primera reescritura que casa (solo se aplica si el fichero no existe). */
function rewriteFor(path: string): string | undefined {
  return config.rewrites.find((r) => sourceMatches(r.source, path))?.destination
}

function parseCsp(csp: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const part of csp.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) out.set(name, sources)
  }
  return out
}

const securityHeaders = headersFor('/')
const csp = parseCsp(securityHeaders.get('content-security-policy') ?? '')

describe('vercel.json: construcción y función', () => {
  it('instala con el lockfile congelado, construye con pnpm build y publica apps/web/dist en fra1', () => {
    expect(config.installCommand).toBe('pnpm install --frozen-lockfile')
    expect(config.buildCommand).toBe('pnpm build')
    expect(config.outputDirectory).toBe('apps/web/dist')
    expect(config.regions).toEqual(['fra1'])
  })

  it('la función api/index.ts lleva las migraciones y tiene un máximo de 10 s', () => {
    expect(config.functions['api/index.ts']).toEqual({
      includeFiles: 'apps/server/drizzle/**',
      maxDuration: 10,
    })
  })

  it('el build empaqueta la API antes de la función y la prueba con node puro', () => {
    const rootPackage = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as {
      scripts: Record<string, string>
    }
    const serverPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: Record<string, string>
    }
    // `buildCommand` de Vercel es `pnpm build`, que construye la web y empaqueta la API.
    expect(config.buildCommand).toBe('pnpm build')
    expect(rootPackage.scripts.build).toContain('pnpm --filter @beatbattle/server build')
    expect(serverPackage.scripts.build).toBe(
      'vite build --config build.config.mjs && node scripts/smoke-bundle.mjs',
    )
  })

  it('api/index.ts carga el artefacto empaquetado y no la fuente TypeScript', () => {
    const source = readFileSync(new URL('../../../api/index.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/^import handler from '\.\.\/apps\/server\/dist\/vercel\.mjs'$/m)
    // De la fuente, solo tipos (se borran al compilar): ningún import de valor de `apps/server/src`.
    const valueImports = [...source.matchAll(/^import (?!type )[^\n]* from '([^']+)'/gm)].map(
      (match) => match[1],
    )
    expect(valueImports).toEqual(['../apps/server/dist/vercel.mjs'])
  })
})

describe('vercel.json: reescrituras', () => {
  it('las fuentes solo usan segmentos literales y grupos sin nombre', () => {
    for (const { source } of [...config.rewrites, ...config.headers]) {
      expect(source).toMatch(/^\//)
      expect(source).not.toMatch(/:[A-Za-z]/)
    }
  })

  it.each(API_ROUTES)('%s → función /api', (path) => {
    expect(rewriteFor(path)).toBe('/api')
  })

  it.each(CLIENT_ROUTES)('%s → /index.html (fallback SPA)', (path) => {
    expect(rewriteFor(path)).toBe('/index.html')
  })

  it('el fallback SPA no captura /api ni /assets/ (un recurso que falta da 404, no HTML)', () => {
    const spa = config.rewrites.find((r) => r.destination === '/index.html')
    expect(spa).toBeDefined()
    for (const path of ['/api', ...API_ROUTES, ASSET, '/assets/trozo-que-ya-no-existe.css']) {
      expect(sourceMatches(spa!.source, path), path).toBe(false)
    }
    // Lo que solo empieza por «api» sigue siendo una ruta del cliente.
    expect(sourceMatches(spa!.source, '/apiario')).toBe(true)
  })

  it('la reescritura de la API va antes que el fallback SPA', () => {
    const destinations = config.rewrites.map((r) => r.destination)
    expect(destinations.indexOf('/api')).toBeLessThan(destinations.indexOf('/index.html'))
  })
})

describe('vercel.json: cabeceras de seguridad (RNF-SEC-01)', () => {
  it('RNF-SEC-01: la CSP es exactamente la de la guía §4.13', () => {
    expect(securityHeaders.get('content-security-policy')).toBe(GUIDE_CSP)
  })

  it.each(EXPECTED_CSP)('RNF-SEC-01: CSP %s', (directive, sources) => {
    expect(csp.get(directive)).toEqual(sources)
  })

  it('RNF-SEC-01: la CSP no tiene directivas de más', () => {
    expect([...csp.keys()].sort()).toEqual(EXPECTED_CSP.map(([d]) => d).sort())
  })

  it('RNF-SEC-01: HSTS de al menos un año con subdominios', () => {
    const hsts = securityHeaders.get('strict-transport-security') ?? ''
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1])
    expect(maxAge).toBeGreaterThanOrEqual(ONE_YEAR_S)
    expect(hsts).toContain('includeSubDomains')
  })

  it('RNF-SEC-01: X-Content-Type-Options nosniff', () => {
    expect(securityHeaders.get('x-content-type-options')).toBe('nosniff')
  })

  it('RNF-SEC-01: Referrer-Policy strict-origin-when-cross-origin', () => {
    expect(securityHeaders.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  })

  it('RNF-SEC-01: X-Frame-Options DENY', () => {
    expect(securityHeaders.get('x-frame-options')).toBe('DENY')
  })

  it('RNF-SEC-01: Permissions-Policy mínima (cámara, micrófono, geolocalización y pago apagados)', () => {
    const policy = new Map(
      (securityHeaders.get('permissions-policy') ?? '').split(',').map((part) => {
        const [feature = '', allow = ''] = part.trim().split('=')
        return [feature, allow] as const
      }),
    )
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
      expect(policy.get(feature), feature).toBe('()')
    }
  })

  it.each([...CLIENT_ROUTES, '/index.html', ...API_ROUTES, ASSET])(
    'RNF-SEC-01: %s lleva todas las cabeceras de seguridad',
    (path) => {
      const headers = headersFor(path)
      for (const key of [
        'content-security-policy',
        'strict-transport-security',
        'x-content-type-options',
        'referrer-policy',
        'x-frame-options',
        'permissions-policy',
      ]) {
        expect(headers.get(key), `${path} ${key}`).toBe(securityHeaders.get(key))
      }
    },
  )
})

describe('vercel.json: caché', () => {
  it('/assets/* (nombres con hash de Vite) se cachea un año como inmutable', () => {
    expect(headersFor(ASSET).get('cache-control')).toBe(`public, max-age=${ONE_YEAR_S}, immutable`)
  })

  it.each(['/', '/index.html', '/semana/41', '/api/health'])('%s no se cachea como inmutable', (path) => {
    expect(headersFor(path).get('cache-control')).toBeUndefined()
  })
})

describe('vercel.json: tareas programadas (§4.12, tarea 3.12)', () => {
  it('Vercel Cron llama a /api/cron/tick una vez al día (Hobby), a las 06:00 UTC (las 08:00 del drop en verano)', () => {
    expect(config.crons).toEqual([{ path: '/api/cron/tick', schedule: '0 6 * * *' }])
  })

  it('el flujo de GitHub Actions lo llama cada 15 minutos con el secreto, y sin la URL no hace nada', () => {
    const workflow = readFileSync(new URL('../../../.github/workflows/tick.yml', import.meta.url), 'utf8')
    expect(workflow).toContain('cron: "*/15 * * * *"')
    expect(workflow).toContain("if: ${{ vars.BB_TICK_URL != '' }}")
    expect(workflow).toContain('Authorization: Bearer ${CRON_SECRET}')
    expect(workflow).toContain('permissions: {}')
  })
})
