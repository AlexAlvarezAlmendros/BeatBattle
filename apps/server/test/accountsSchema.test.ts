import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createTestDb } from '../src/db/testDb'

/** Esquema de cuentas (tarea 2.3, guía §4.9 y §4.11): tablas de Better Auth + perfil de productor. */
describe('esquema de cuentas', () => {
  const insertUser = (id: string, email: string, username: string) =>
    `INSERT INTO user (id, name, email, username, display_username, updated_at) VALUES ('${id}', '${username}', '${email}', '${username.toLowerCase()}', '${username}', 0)`

  it('las migraciones crean las tablas de Better Auth, el perfil y las redirecciones', async () => {
    const db = await createTestDb()
    const { rows } = await db.$client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    const tables = rows.map((row) => row.name)
    for (const table of [
      'user',
      'session',
      'account',
      'verification',
      'rate_limit',
      'producer_profile',
      'username_redirect',
    ])
      expect(tables).toContain(table)
  })

  it('RF-AUTH-06: el nombre se guarda en minúsculas y es único: LilBru y lilbru chocan', async () => {
    const db = await createTestDb()
    await db.$client.execute(insertUser('u1', 'a@example.com', 'LilBru'))
    await expect(db.$client.execute(insertUser('u2', 'b@example.com', 'lilbru'))).rejects.toThrow(/UNIQUE/)
  })

  it('el número de carta es único y el acento solo admite la paleta', async () => {
    const db = await createTestDb()
    await db.$client.execute(insertUser('u1', 'a@example.com', 'aina'))
    await db.$client.execute(insertUser('u2', 'b@example.com', 'kairo'))
    await db.$client.execute(
      "INSERT INTO producer_profile (user_id, card_number, created_at) VALUES ('u1', 1, 0)",
    )
    await expect(
      db.$client.execute(
        "INSERT INTO producer_profile (user_id, card_number, created_at) VALUES ('u2', 1, 0)",
      ),
    ).rejects.toThrow(/UNIQUE/)
    const { rows } = await db.$client.execute(
      "SELECT accent, links FROM producer_profile WHERE user_id = 'u1'",
    )
    expect(rows[0]).toMatchObject({ accent: 'red', links: '{}' })
  })

  it('§4.11: ninguna tabla borra en cascada (en Turso no ocurriría): los borrados son explícitos', async () => {
    const sql = readdirSync(new URL('../drizzle', import.meta.url))
      .filter((file) => file.endsWith('.sql'))
      .map((file) => readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'))
      .join('\n')
    expect(sql).not.toMatch(/ON DELETE CASCADE/i)
    // En local, con las claves ajenas activas, borrar un usuario con sesiones falla: obliga al orden explícito.
    const db = await createTestDb()
    await db.$client.execute(insertUser('u1', 'a@example.com', 'aina'))
    await db.$client.execute(
      "INSERT INTO session (id, expires_at, token, updated_at, user_id) VALUES ('s1', 0, 't1', 0, 'u1')",
    )
    await expect(db.$client.execute("DELETE FROM user WHERE id = 'u1'")).rejects.toThrow(/FOREIGN KEY/)
  })
})
