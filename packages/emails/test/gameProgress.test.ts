import { describe, expect, it } from 'vitest'
import { type GameProgressPayload, renderEmail, TEMPLATES } from '../src'
import { GAME_PROGRESS_LEGENDARY_FIXTURE } from '../src/templates/gameProgress'

/** `game.progress` (tarea 7.29, §2.12.7, Anexo H): el progreso del día, todo en uno. */

const PUBLIC_URL = 'https://battle.otherpeople.es'
const template = TEMPLATES['game.progress']
const render = (payload: GameProgressPayload) =>
  renderEmail(template, payload, {
    publicUrl: PUBLIC_URL,
    family: 'battle',
    unsubscribePageUrl: `${PUBLIC_URL}/api/unsubscribe?token=t`,
  })

describe('game.progress (§2.12.7)', () => {
  it('RF-NOTIF-03: la tarjeta del rango y una por logro, con su rareza y su XP, también en el texto plano', async () => {
    const email = await render(template.fixture)
    expect(email.subject).toBe('Nuevo rango: Beatmaker y 2 logros')
    expect(email.preheader).toBe(
      'Nivel 7: «Sampleador» se queda atrás. Y +300 XP en logros: Disco de oro y Oído de oro.',
    )
    // React separa los textos con `<!-- -->` en el HTML.
    for (const content of [email.html.replaceAll('<!-- -->', ''), email.text]) {
      expect(content).toMatch(/Nuevo rango · nivel 7/i)
      expect(content).toMatch(/Beatmaker/i)
      expect(content).toContain('Dejas atrás «Sampleador»')
      expect(content).toContain('El siguiente rango, Productor, llega en el nivel 9.')
      expect(content).toMatch(/Logro épico · \+150 XP/i)
      expect(content).toMatch(/Disco de oro/i)
      expect(content).toContain('Ganar una semana.')
      expect(content).toMatch(/Oído de oro/i)
      expect(content).toContain(`${PUBLIC_URL}/p/mar_beats`)
      expect(content).toContain('Darme de baja')
    }
    // La placa épica: granate con borde rojo, en la celda (como el botón).
    expect(email.html).toMatch(/<td[^>]*bgcolor="#4a0d1c"[^>]*border:2px solid #ff003c/)
  })

  it('RF-NOTIF-03: un logro legendario sin rango: su placa roja con borde blanco y el asunto con su nombre', async () => {
    const email = await render(GAME_PROGRESS_LEGENDARY_FIXTURE)
    expect(email.subject).toBe('Logro desbloqueado: Doblete')
    expect(email.preheader).toBe('Logro legendario · +300 XP: Ganar dos semanas seguidas.')
    expect(email.text).toMatch(/Logro legendario · \+300 XP/i)
    expect(email.text).not.toMatch(/Nuevo rango/i)
    expect(email.html).toMatch(/<td[^>]*bgcolor="#e6003a"[^>]*border:2px solid #ffffff/)
  })

  it('§3.8.12: el asunto cabe en 50 caracteres con el rango más largo y con varios logros', () => {
    const longest: GameProgressPayload = {
      ...template.fixture,
      rank: { from: 'grooveArchitect', to: 'grooveArchitect', level: 11, next: null },
      achievements: [
        { id: 'streak_26', rarity: 'legendary', xp: 300 },
        { id: 'win_3', rarity: 'legendary', xp: 300 },
        { id: 'unanimous', rarity: 'epic', xp: 150 },
      ],
    }
    expect(template.subject(longest)).toBe('Nuevo rango: Arquitecto del groove y 3 logros')
    const many = { ...longest, rank: null }
    expect(template.subject(many)).toBe('Logros desbloqueados: Medio año sin fallar y 2 más')
    for (const p of [longest, many]) expect(template.subject(p).length).toBeLessThanOrEqual(50)
    expect(template.subject({ ...longest, achievements: [] })).toBe('Nuevo rango: Arquitecto del groove')
  })

  it('el último rango no promete otro; sin nombre de usuario, el botón va a Ajustes → Perfil', async () => {
    const email = await render({
      ...template.fixture,
      username: null,
      rank: { from: 'blockLegend', to: 'otherPeople', level: 20, next: null },
      achievements: [{ id: 'level_20', rarity: 'legendary', xp: 300 }],
    })
    expect(email.text).toContain('Es el último rango: eres de la familia.')
    expect(email.text).toContain(`${PUBLIC_URL}/ajustes/perfil`)
    expect(email.text).toMatch(/De la familia/i)
  })

  it('RF-NOTIF-13: ni medias, ni votos, ni posiciones, ni nada de una semana en juego', async () => {
    for (const payload of [template.fixture, GAME_PROGRESS_LEGENDARY_FIXTURE]) {
      const email = await render(payload)
      // El texto plano es completo (`RF-NOTIF-03`); en el HTML, los colores (`#ff003c`) parecerían números de semana.
      const content = `${email.subject}\n${email.preheader}\n${email.text}`
      for (const leak of [
        /media/i,
        /puntuaci[oó]n/i,
        /posici[oó]n/i,
        /\d+ votos?\b/i,
        /\d([.,]\d)? ?\/ ?5\b/,
        /#\d+/,
      ])
        expect(content, String(leak)).not.toMatch(leak)
    }
  })
})
