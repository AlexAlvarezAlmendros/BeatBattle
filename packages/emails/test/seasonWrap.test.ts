import { describe, expect, it } from 'vitest'
import { renderEmail, type SeasonWrapPayload, TEMPLATES } from '../src'
import {
  SEASON_WRAP_CHAMPION_FIXTURE,
  SEASON_WRAP_JUROR_FIXTURE,
  seasonLabel,
} from '../src/templates/seasonWrap'

/** `season.wrap` (tarea 7.30, §2.12.7, Anexo H): «Tu T4 de 2026 en cifras». */

const PUBLIC_URL = 'https://battle.otherpeople.es'
const template = TEMPLATES['season.wrap']
const render = (payload: SeasonWrapPayload) =>
  renderEmail(template, payload, {
    publicUrl: PUBLIC_URL,
    family: 'battle',
    unsubscribePageUrl: `${PUBLIC_URL}/api/unsubscribe?token=t`,
  })

describe('season.wrap (§2.12.7)', () => {
  it('RF-NOTIF-15 / RF-NOTIF-03: puesto, campeón, semanas, mejor puesto, votos, logros y la carta, también en el texto plano', async () => {
    const email = await render(template.fixture)
    expect(email.subject).toBe('Tu T4 de 2026 en cifras')
    expect(email.preheader).toBe('3.º de 12 con 182 puntos, 13 semanas en juego y 214 votos.')
    for (const content of [email.html.replaceAll('<!-- -->', ''), email.text]) {
      expect(content).toMatch(/Temporada T4 de 2026 · cerrada/i)
      expect(content).toMatch(/3\.º de 12/i)
      expect(content).toContain('182 puntos en la clasificación de la temporada, con 2 victorias y 7 podios.')
      expect(content).toContain('Campeón: kairo.wav.')
      expect(content).toMatch(/Semanas jugadas/i)
      expect(content).toMatch(/Mejor puesto/i)
      expect(content).toMatch(/Votos emitidos/i)
      expect(content).toMatch(/Oído de oro/i)
      expect(content).toContain('logro épico · +150 XP')
      expect(content).toContain(`${PUBLIC_URL}/temporada/2026-T4`)
      expect(content).toContain(`${PUBLIC_URL}/p/mar_beats`)
      expect(content).toContain('Darme de baja')
    }
    // La carta del trimestre: la carta sola del perfil, en vertical (pública, de semanas selladas; jurado de la 7.35:
    // la OG apaisada se leía a 3–6 px en el móvil), con su texto alternativo.
    expect(email.html).toContain(`src="${PUBLIC_URL}/api/og/profile/mar_beats/card.png"`)
    expect(email.html).toMatch(/width="376"[^>]*max-width:376px|max-width:376px[^>]*width="376"/)
    expect(email.html).toContain('alt="Carta de productor de mar_beats, 3.º de la temporada T4 de 2026"')
  })

  it('RF-NOTIF-15: la campeona lo ve en el asunto; quien solo votó, su temporada como jurado y los campeones ex aequo', async () => {
    const champion = await render(SEASON_WRAP_CHAMPION_FIXTURE)
    expect(champion.subject).toBe('¡Campeón de la T4 de 2026!')
    expect(champion.text).toMatch(/¡Campeón de la temporada!/i)
    expect(champion.text).toContain('Tu carta ya lleva la corona.')
    const juror = await render(SEASON_WRAP_JUROR_FIXTURE)
    expect(juror.subject).toBe('Tu T4 de 2026 en cifras')
    expect(juror.preheader).toBe('149 votos como jurado y 1 logro. Ya hay campeones.')
    expect(juror.text).toMatch(/Tu temporada como jurado/i)
    expect(juror.text).toContain('Campeones ex aequo: kairo.wav y nuria.beats.')
    // Sin semanas jugadas ni puesto: «—».
    expect(juror.text).toMatch(/Mejor puesto\s+—/i)
  })

  it('§3.8.12: el asunto cabe en 50 caracteres; sin nombre, ni carta ni perfil (el botón va a Ajustes → Perfil)', async () => {
    for (const p of [template.fixture, SEASON_WRAP_CHAMPION_FIXTURE, SEASON_WRAP_JUROR_FIXTURE])
      expect(template.subject(p).length).toBeLessThanOrEqual(50)
    expect(seasonLabel('2027-T1')).toBe('T1 de 2027')
    const email = await render({ ...template.fixture, username: null })
    expect(email.html).not.toContain('/api/og/profile/')
    expect(email.text).not.toMatch(/Tu carta del trimestre/i)
  })

  it('participar sin clasificar: lo dice, sin puesto', async () => {
    const email = await render({ ...template.fixture, standing: null, bestPosition: null, weeksPlayed: 2 })
    expect(email.text).toMatch(/Tu temporada, sin clasificar/i)
    expect(email.text).toContain(
      'Has jugado 2 semanas y ninguna ha llegado a clasificar: hacen falta 3 votos.',
    )
  })

  it('RF-NOTIF-13 / RF-NOTIF-12: ni medias ni nada de una semana en juego; ninguna imagen de seguimiento', async () => {
    for (const payload of [template.fixture, SEASON_WRAP_CHAMPION_FIXTURE, SEASON_WRAP_JUROR_FIXTURE]) {
      const email = await render(payload)
      const content = `${email.subject}\n${email.preheader}\n${email.text}`
      for (const leak of [/media/i, /puntuaci[oó]n/i, /\d([.,]\d)? ?\/ ?5\b/, /#\d+/, /semana #/i])
        expect(content, String(leak)).not.toMatch(leak)
      expect(email.html).not.toMatch(/width="1"|height="1"/)
    }
  })
})
