import { describe, expect, it } from 'vitest'
import { EnvError, loadEnv } from '../src/config/env'

function envError(source: Record<string, string | undefined>): EnvError {
  try {
    loadEnv(source)
  } catch (e) {
    if (e instanceof EnvError) return e
    throw e
  }
  throw new Error('loadEnv debía fallar')
}

describe('loadEnv', () => {
  it('sin variables usa los valores locales por defecto', () => {
    const c = loadEnv({})
    expect(c).toMatchObject({
      env: 'development',
      host: '127.0.0.1',
      port: 3000,
      publicUrl: 'http://localhost:5173',
      allowedOrigins: ['http://localhost:5173'],
      databaseUrl: 'file:./data/local.db',
      testClock: false,
      logLevel: 'info',
      trustProxy: false,
    })
    expect(c.databaseAuthToken).toBeUndefined()
  })

  it('es pura: no lee process.env', () => {
    process.env.PORT = '4999'
    try {
      expect(loadEnv({}).port).toBe(3000)
    } finally {
      delete process.env.PORT
    }
  })

  it('interpreta y normaliza los valores', () => {
    const c = loadEnv({
      NODE_ENV: 'test',
      PORT: '3320',
      ALLOWED_ORIGINS: ' http://localhost:5173 , https://preview.example.com/ ,',
      BB_PUBLIC_URL: 'https://battle.otherpeople.es/',
      DATABASE_URL: 'libsql://bb.turso.io',
      DATABASE_AUTH_TOKEN: 'token',
      BB_TEST_CLOCK: 'true',
      LOG_LEVEL: 'debug',
      TRUST_PROXY: '1',
    })
    expect(c.port).toBe(3320)
    expect(c.publicUrl).toBe('https://battle.otherpeople.es')
    // el origen de la URL pública se permite siempre
    expect(c.allowedOrigins).toEqual([
      'http://localhost:5173',
      'https://preview.example.com',
      'https://battle.otherpeople.es',
    ])
    expect(c.databaseAuthToken).toBe('token')
    expect(c.testClock).toBe(true)
    expect(c.logLevel).toBe('debug')
    expect(c.trustProxy).toBe(true)
  })

  it('las variables vacías (VAR= en un .env) cuentan como ausentes', () => {
    const c = loadEnv({ PORT: '', DATABASE_AUTH_TOKEN: '', BB_TEST_CLOCK: '  ', MIGRATIONS_DIR: '' })
    expect(c.port).toBe(3000)
    expect(c.databaseAuthToken).toBeUndefined()
    expect(c.migrationsDir).toBeUndefined()
    expect(loadEnv({ MIGRATIONS_DIR: ' /var/task/drizzle ' }).migrationsDir).toBe('/var/task/drizzle')
    expect(c.testClock).toBe(false)
  })

  it('agrupa todos los errores en uno legible y sin valores', () => {
    const e = envError({
      PORT: '99999',
      LOG_LEVEL: 'chatty',
      TRUST_PROXY: 'quizá',
      ALLOWED_ORIGINS: 'ftp://secreto-en-origen',
      DATABASE_AUTH_TOKEN: 'super-secreto',
    })
    expect(e.issues.map((i) => i.variable).sort()).toEqual([
      'ALLOWED_ORIGINS',
      'LOG_LEVEL',
      'PORT',
      'TRUST_PROXY',
    ])
    expect(e.message).toMatch(/4 problemas/)
    expect(e.message).toContain('PORT')
    expect(e.message).not.toContain('99999')
    expect(e.message).not.toContain('chatty')
    expect(e.message).not.toContain('secreto')
  })

  it('rechaza orígenes con ruta y URLs públicas que no son http(s)', () => {
    expect(envError({ ALLOWED_ORIGINS: 'http://localhost:5173/app' }).issues[0]?.variable).toBe(
      'ALLOWED_ORIGINS',
    )
    expect(envError({ BB_PUBLIC_URL: 'javascript:alert(1)' }).issues[0]?.variable).toBe('BB_PUBLIC_URL')
  })

  it('guarda §4.12: BB_TEST_CLOCK=1 con NODE_ENV=production impide arrancar', () => {
    for (const flag of ['1', 'true']) {
      const e = envError({ NODE_ENV: 'production', BB_PUBLIC_URL: 'https://b.example', BB_TEST_CLOCK: flag })
      expect(e.issues).toEqual([
        { variable: 'BB_TEST_CLOCK', message: expect.stringContaining('NODE_ENV=production') },
      ])
    }
    // la guarda se informa aunque haya otros errores a la vez
    const both = envError({ NODE_ENV: 'production', BB_TEST_CLOCK: '1', PORT: 'x' })
    expect(both.issues.map((i) => i.variable).sort()).toEqual(['BB_PUBLIC_URL', 'BB_TEST_CLOCK', 'PORT'])
  })

  it('en producción exige BB_PUBLIC_URL y permite el reloj apagado', () => {
    expect(envError({ NODE_ENV: 'production' }).issues).toEqual([
      { variable: 'BB_PUBLIC_URL', message: 'es obligatoria en producción' },
    ])
    const c = loadEnv({ NODE_ENV: 'production', BB_PUBLIC_URL: 'https://b.example', BB_TEST_CLOCK: '0' })
    expect(c.testClock).toBe(false)
    // en producción, sin ALLOWED_ORIGINS solo vale el origen público (nada de localhost)
    expect(c.allowedOrigins).toEqual(['https://b.example'])
    const extra = loadEnv({
      NODE_ENV: 'production',
      BB_PUBLIC_URL: 'https://b.example',
      ALLOWED_ORIGINS: 'https://www.b.example',
    })
    expect(extra.allowedOrigins).toEqual(['https://www.b.example', 'https://b.example'])
  })
})
