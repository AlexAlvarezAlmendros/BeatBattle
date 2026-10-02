import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { runBatch } from '../src/db/batch'
import { createDb, filePathOf, isLocalDb } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'
import { appRateLimit } from '../src/db/schema'
import { createTestDb } from '../src/db/testDb'

const tables = async (db: Awaited<ReturnType<typeof createDb>>) =>
  (await db.$client.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).rows.map(
    (r) => r.name,
  )

describe('base de datos', () => {
  it('createTestDb: BD en memoria con las migraciones aplicadas (tabla app_rate_limit de §4.11)', async () => {
    const db = await createTestDb()
    expect(await tables(db)).toContain('app_rate_limit')
    const cols = await db.$client.execute('PRAGMA table_info(app_rate_limit)')
    expect(cols.rows.map((c) => [c.name, c.type, Number(c.notnull), Number(c.pk)])).toEqual([
      ['key', 'TEXT', 1, 1],
      ['count', 'INTEGER', 1, 0],
      ['reset_at', 'INTEGER', 1, 0],
    ])
  })

  it('cada createTestDb es una BD aislada', async () => {
    const a = await createTestDb()
    const b = await createTestDb()
    await a.insert(appRateLimit).values({ key: 'k', count: 1, resetAt: 1 })
    expect(await b.select().from(appRateLimit)).toEqual([])
  })

  it('las migraciones son idempotentes', async () => {
    const db = await createTestDb()
    await runMigrations(db)
    await runMigrations(db)
    expect(await tables(db)).toContain('app_rate_limit')
  })

  it('con un fichero crea su carpeta si no existe', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bb-db-'))
    const dir = join(root, 'anidada', 'data')
    const url = `file:${join(dir, 'local.db')}`
    expect(existsSync(dir)).toBe(false)
    const db = await createDb(url)
    try {
      await runMigrations(db)
      expect(existsSync(join(dir, 'local.db'))).toBe(true)
      expect(await tables(db)).toContain('app_rate_limit')
    } finally {
      db.$client.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('en local las claves ajenas quedan activas tras migrar', async () => {
    const db = await createTestDb()
    expect(isLocalDb(db)).toBe(true)
    expect((await db.$client.execute('PRAGMA foreign_keys')).rows[0]?.foreign_keys).toBe(1)
  })

  it('con una BD remota createDb no hace ninguna petición (ni el PRAGMA de claves ajenas)', async () => {
    // nada escucha en el puerto 1: si createDb consultara algo, fallaría
    const db = await createDb('http://127.0.0.1:1')
    try {
      expect(isLocalDb(db)).toBe(false)
    } finally {
      db.$client.close()
    }
  })

  it('filePathOf distingue ficheros de memoria y remotas', () => {
    expect(filePathOf('file:./data/local.db')).toBe('./data/local.db')
    expect(filePathOf('file:/tmp/x.db?mode=rwc')).toBe('/tmp/x.db')
    expect(filePathOf(':memory:')).toBeNull()
    expect(filePathOf('file::memory:')).toBeNull()
    expect(filePathOf('libsql://bb.turso.io')).toBeNull()
    expect(filePathOf('http://127.0.0.1:8080')).toBeNull()
  })
})

describe('runBatch (borrados explícitos y atómicos, §4.11)', () => {
  it('aplica todas las sentencias o ninguna', async () => {
    const db = await createTestDb()
    await db.insert(appRateLimit).values({ key: 'a', count: 1, resetAt: 1 })
    await expect(
      runBatch(db, [
        db.delete(appRateLimit).where(eq(appRateLimit.key, 'a')),
        db.insert(appRateLimit).values({ key: 'b', count: 1, resetAt: 1 }),
        // clave repetida: falla y deshace todo el batch
        db.insert(appRateLimit).values({ key: 'b', count: 1, resetAt: 1 }),
      ]),
    ).rejects.toThrow()
    expect((await db.select().from(appRateLimit)).map((r) => r.key)).toEqual(['a'])

    await runBatch(db, [
      db.delete(appRateLimit).where(eq(appRateLimit.key, 'a')),
      db.insert(appRateLimit).values({ key: 'b', count: 2, resetAt: 3 }),
    ])
    expect(await db.select().from(appRateLimit)).toEqual([{ key: 'b', count: 2, resetAt: 3 }])
  })

  it('una lista vacía no hace nada', async () => {
    const db = await createTestDb()
    await expect(runBatch(db, [])).resolves.toBeUndefined()
  })
})
