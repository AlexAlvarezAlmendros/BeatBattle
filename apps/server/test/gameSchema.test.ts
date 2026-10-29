import { readFileSync } from 'node:fs'
import { ACHIEVEMENT_IDS } from '@beatbattle/rules'
import { AchievementIdSchema } from '@beatbattle/shared'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { Db } from '../src/db/client'
import { MIGRATIONS_DIR } from '../src/db/migrate'
import { achievementUnlock, streakState, xpEvent } from '../src/db/schema'
import { createTestDb } from '../src/db/testDb'
import { T0 } from './helpers'

/**
 * Las tablas de la capa de juego (guía §2.10, §4.11; tarea 7.7): el libro de XP, los logros y la racha, con la
 * migración `0008_capa_de_juego` aplicada desde cero en la BD de prueba (`createTestDb`).
 */

const columns = async (db: Db, table: string) =>
  (await db.$client.execute(`pragma table_info("${table}")`)).rows.map((row) => ({
    name: String(row.name),
    notnull: Number(row.notnull),
    dflt: row.dflt_value === null ? null : String(row.dflt_value),
  }))

let serial = 0
const xp = (overrides: Partial<typeof xpEvent.$inferInsert> = {}) => {
  serial += 1
  return {
    id: `xp-${serial}`,
    userId: 'u1',
    kind: 'vote' as const,
    ref: 'entry-1',
    weekId: 'week-1',
    amount: 5,
    createdAt: T0,
    ...overrides,
  }
}

describe('tablas de la capa de juego (§4.11, tarea 7.7)', () => {
  it('§4.11: la migración desde cero crea xp_event, achievement_unlock y streak_state con sus columnas', async () => {
    const db = await createTestDb()
    expect((await columns(db, 'xp_event')).map((c) => c.name)).toEqual([
      'id',
      'user_id',
      'kind',
      'ref',
      'week_id',
      'amount',
      'created_at',
    ])
    expect((await columns(db, 'achievement_unlock')).map((c) => c.name)).toEqual([
      'user_id',
      'achievement_id',
      'ref',
      'week_id',
      'unlocked_at',
      'seen_at',
    ])
    expect((await columns(db, 'streak_state')).map((c) => c.name)).toEqual([
      'user_id',
      'current',
      'best',
      'last_week_number',
      'joker_season',
    ])
    const indexes = await db.$client.execute("select name from sqlite_master where type = 'index'")
    expect(indexes.rows.map((row) => String(row.name))).toEqual(
      expect.arrayContaining(['xp_event_once', 'xp_event_first_entry_of_week', 'xp_event_user_week']),
    )
  })

  it('§4.11: la migración es solo aditiva (main puede ir por delante de producción) y la casilla del reto nace desmarcada', async () => {
    const sql = readFileSync(`${MIGRATIONS_DIR}/0008_capa_de_juego.sql`, 'utf8')
    expect(sql).not.toMatch(/\bDROP\b|\bRENAME\b|__new_/i)
    for (const statement of sql.split('--> statement-breakpoint').map((s) => s.trim()))
      expect(statement).toMatch(/^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE `entry` ADD)/)
    const db = await createTestDb()
    expect((await columns(db, 'entry')).find((c) => c.name === 'challenge_claimed')).toEqual({
      name: 'challenge_claimed',
      notnull: 1,
      dflt: 'false',
    })
  })

  it('RF-GAME-01: un movimiento por cuenta, tipo y referencia; repetirlo con ON CONFLICT DO NOTHING no suma', async () => {
    const db = await createTestDb()
    await db.insert(xpEvent).values(xp())
    await expect(db.insert(xpEvent).values(xp())).rejects.toThrow()
    await db.insert(xpEvent).values(xp()).onConflictDoNothing()
    expect(await db.select().from(xpEvent)).toHaveLength(1)
    // Otra referencia, otro tipo u otra cuenta, sí.
    await db
      .insert(xpEvent)
      .values([xp({ ref: 'entry-2' }), xp({ kind: 'entry', ref: 'week-1' }), xp({ userId: 'u2' })])
    expect(await db.select().from(xpEvent)).toHaveLength(4)
  })

  it('§2.10: la primera entrada de la semana es una por semana para toda la batalla', async () => {
    const db = await createTestDb()
    const first = (userId: string, ref: string) =>
      xp({ userId, kind: 'first_entry_of_week', ref, weekId: ref, amount: 25 })
    await db.insert(xpEvent).values(first('u1', 'week-1'))
    await db.insert(xpEvent).values(first('u2', 'week-1')).onConflictDoNothing()
    await db.insert(xpEvent).values(first('u2', 'week-2'))
    const rows = await db.select().from(xpEvent).where(eq(xpEvent.kind, 'first_entry_of_week'))
    expect(rows.map((row) => [row.userId, row.ref])).toEqual([
      ['u1', 'week-1'],
      ['u2', 'week-2'],
    ])
  })

  it('RF-GAME-05: un logro por cuenta, para siempre, y su aviso sin ver', async () => {
    const db = await createTestDb()
    const unlock = {
      userId: 'u1',
      achievementId: 'first_vote',
      ref: 'entry-1',
      weekId: 'week-1',
      unlockedAt: T0,
    }
    await db.insert(achievementUnlock).values(unlock)
    await db
      .insert(achievementUnlock)
      .values({ ...unlock, ref: 'entry-2', unlockedAt: T0 + 1 })
      .onConflictDoNothing()
    expect(await db.select().from(achievementUnlock)).toEqual([{ ...unlock, seenAt: null }])
  })

  it('RF-GAME-04: una racha por cuenta, con la última semana aplicada y la temporada del comodín', async () => {
    const db = await createTestDb()
    await db
      .insert(streakState)
      .values({ userId: 'u1', current: 4, best: 4, lastWeekNumber: 5, jokerSeason: '2026-T4' })
    await expect(
      db.insert(streakState).values({ userId: 'u1', current: 0, best: 4, lastWeekNumber: 6 }),
    ).rejects.toThrow()
    expect(await db.select().from(streakState)).toEqual([
      { userId: 'u1', current: 4, best: 4, lastWeekNumber: 5, jokerSeason: '2026-T4' },
    ])
  })

  it('RF-GAME-05: los logros de @beatbattle/shared son los del catálogo de @beatbattle/rules, en su orden', () => {
    expect(AchievementIdSchema.options).toEqual([...ACHIEVEMENT_IDS])
  })
})
