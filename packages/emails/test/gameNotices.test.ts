import { describe, expect, it } from 'vitest'
import { type BattleReminderPayload, type ResultsBlock, renderEmail, TEMPLATES } from '../src'
import { BATTLE_REMINDER_STREAK_FIXTURE } from '../src/templates/battleReminder'

/** La capa de juego en los avisos que ya salen (tarea 7.31, §2.12.7): «tu partida» y la racha en peligro. */

const PUBLIC_URL = 'https://battle.otherpeople.es'
const context = { publicUrl: PUBLIC_URL, family: 'battle' as const }
const monday = TEMPLATES['battle.monday']
const results = TEMPLATES['battle.results']
const reminder = TEMPLATES['battle.reminder']

describe('«tu partida» en el Lunes de batalla y en los resultados', () => {
  it('RF-NOTIF-07: battle.monday y battle.results llevan el XP del sellado, el oído de oro y la racha', async () => {
    for (const email of [
      await renderEmail(monday, monday.fixture, context),
      await renderEmail(results, results.fixture, context),
    ]) {
      expect(email.text).toContain('TU PARTIDA · +495 XP')
      expect(email.text).toContain('Resultado +420 XP')
      expect(email.text).toContain('Oído de oro +75 XP')
      expect(email.text).toContain('Racha 3 semanas')
      expect(email.text).toContain('la racha sube a 4 y tu XP de subir y de resultado lleva un +30 %')
      // En el HTML, la tira troquelada del ticket.
      expect(email.html).toMatch(/border-top:2px dashed/)
    }
  })

  it('RF-NOTIF-07: el comodín que salvó la racha se dice; sin XP, solo la racha', async () => {
    const r: ResultsBlock = {
      ...results.fixture,
      mine: null,
      game: { xp: 0, goldenEarXp: 0, streak: 2, jokerSaved: true, nextBonusPercent: 20 },
    }
    const email = await renderEmail(results, r, context)
    expect(email.text).toContain('Racha 2 semanas · salvada por el comodín')
    expect(email.text).not.toMatch(/TU PARTIDA · \+/)
    expect(email.text).not.toMatch(/Resultado \+|Oído de oro \+/)
  })

  it('sin «tu partida» a los suscriptores ni en lo encolado antes de la Fase 7 (sin el campo)', async () => {
    const { game: _, ...old } = results.fixture
    for (const payload of [{ ...results.fixture, game: null }, old]) {
      const email = await renderEmail(results, payload, context)
      expect(email.text).not.toContain('TU PARTIDA')
      expect(email.text).not.toMatch(/\bXP\b/)
    }
  })
})

describe('battle.reminder, «racha en peligro»', () => {
  it('RF-NOTIF-07: con racha ≥ 3, el asunto es la racha y explica el comodín y el bonus en juego', async () => {
    const email = await renderEmail(reminder, BATTLE_REMINDER_STREAK_FIXTURE, context)
    expect(email.subject).toBe('Tu racha de 5 semanas está en juego')
    expect(email.text).toContain('gastas el comodín de esta temporada: la racha se salva, pero no sube')
    expect(email.text).toContain('la racha sube a 6 y tu XP de subir y de resultado lleva un +50 %')
    expect(email.text).toContain('~26 h')
    expect(email.html).toContain(`${PUBLIC_URL}/api/email/countdown/2026-w42.gif`)
    expect(email.text).toContain(`${PUBLIC_URL}/subir`)
  })

  it('con el comodín gastado, la racha vuelve a 0; sin racha (o sin el campo), el recordatorio de siempre', async () => {
    const spent: BattleReminderPayload = {
      ...BATTLE_REMINDER_STREAK_FIXTURE,
      streak: { weeks: 4, jokerAvailable: false, bonusPercent: 40 },
    }
    const email = await renderEmail(reminder, spent, context)
    expect(email.subject).toBe('Tu racha de 4 semanas está en juego')
    expect(email.text).toContain('Ya gastaste el comodín de esta temporada')
    expect(email.text).toContain('la racha vuelve a 0')
    for (const payload of [reminder.fixture, { ...reminder.fixture, streak: null }]) {
      const plain = await renderEmail(reminder, payload, context)
      expect(plain.subject).toBe('Te quedan ~26 h para subir tu flip')
      expect(plain.text).not.toMatch(/racha|comodín/i)
    }
  })

  it('RF-NOTIF-13: la versión de racha no lleva medias, recuentos ni posiciones', async () => {
    for (const payload of [BATTLE_REMINDER_STREAK_FIXTURE, reminder.fixture]) {
      const email = await renderEmail(reminder, payload, context)
      const content = `${email.subject}\n${email.preheader}\n${email.text}`
      for (const leak of [
        /media/i,
        /puntuaci[oó]n/i,
        /posici[oó]n/i,
        /\d+ votos?\b/i,
        /\d([.,]\d)? ?\/ ?5\b/,
      ])
        expect(content, String(leak)).not.toMatch(leak)
    }
  })
})
