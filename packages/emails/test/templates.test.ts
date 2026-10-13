import { describe, expect, it } from 'vitest'
import { type EmailFamily, renderEmail, TEMPLATES, type TemplateKind } from '../src'

const PUBLIC_URL = 'https://battle.otherpeople.es'
const KINDS = Object.keys(TEMPLATES) as TemplateKind[]
const family = (kind: TemplateKind): EmailFamily => (kind.startsWith('battle.') ? 'battle' : 'service')

async function renderFixture(
  kind: TemplateKind,
  extra: Partial<{ family: EmailFamily; unsubscribePageUrl: string }> = {},
) {
  const template = TEMPLATES[kind] as (typeof TEMPLATES)[TemplateKind]
  // biome-ignore lint/suspicious/noExplicitAny: cada plantilla con su propio fixture
  return renderEmail(template as any, template.fixture, {
    publicUrl: PUBLIC_URL,
    family: family(kind),
    ...extra,
  })
}

describe('plantillas de email (§3.8.12, §4.19.4)', () => {
  for (const kind of KINDS) {
    it(`RF-NOTIF-03: ${kind} genera HTML y una versión de texto plano completa`, async () => {
      const email = await renderFixture(kind)
      expect(email.html).toContain('<!DOCTYPE html')
      expect(email.text.length).toBeGreaterThan(80)
      // El texto plano lleva lo esencial: el asunto se entiende y no queda HTML suelto.
      expect(email.text).not.toMatch(/<[a-z]+[\s>]/i)
      expect(email.text).toContain('Un juego de Other People Records')
    })

    it(`§3.8.12: ${kind} es accesible (lang, tablas de maquetación, alt, texto ≥ 14 px)`, async () => {
      const { html } = await renderFixture(kind)
      expect(html).toMatch(/<html[^>]*lang="es"/)
      for (const table of html.match(/<table[^>]*>/g) ?? []) expect(table).toContain('role="presentation"')
      for (const img of html.match(/<img[^>]*>/g) ?? []) expect(img).toMatch(/alt="[^"]+"/)
      for (const size of html.matchAll(/font-size:\s*(\d+)px/g))
        expect(Number(size[1])).toBeGreaterThanOrEqual(14)
      expect(html).toContain('color-scheme')
    })

    it(`RF-NOTIF-12: ${kind} no lleva píxeles de seguimiento ni parámetros por persona en las imágenes`, async () => {
      const { html } = await renderFixture(kind)
      for (const img of html.match(/<img[^>]*>/g) ?? []) {
        expect(img).not.toMatch(/width="1"|height="1"/)
        const src = img.match(/src="([^"]+)"/)?.[1] ?? ''
        // La onda del recibo es la imagen de la propia entrada (§4.19.5): firmada (`v` y `sig`), sin id de
        // usuario ni nada más en la URL, y el servidor no registra quién la pide.
        if (src.includes('/api/email/waveform/')) {
          expect(src).toMatch(/\/api\/email\/waveform\/[\w-]+\.png\?v=[0-9a-f]*&(amp;)?sig=[\w-]+$/)
          continue
        }
        // Las imágenes del juego, la cuenta atrás en vivo (§4.19.5) o la portada del sample (Cloudinary).
        const allowed = [
          `${PUBLIC_URL}/img/email/`,
          `${PUBLIC_URL}/api/email/countdown/`,
          'https://res.cloudinary.com/',
        ]
        expect(
          allowed.some((prefix) => src.startsWith(prefix)),
          src,
        ).toBe(true)
        expect(src).not.toContain('?')
      }
    })

    it(`§3.8.12: el asunto de ${kind} cabe en 50 caracteres, también con un nombre de 20`, () => {
      const template = TEMPLATES[kind]
      // biome-ignore lint/suspicious/noExplicitAny: cada plantilla con su propio fixture
      const long = { ...(template.fixture as any), name: 'a'.repeat(20) }
      // biome-ignore lint/suspicious/noExplicitAny: ídem
      expect((template as any).subject(long).length).toBeLessThanOrEqual(50)
      // biome-ignore lint/suspicious/noExplicitAny: ídem
      expect((template as any).preheader(long).length).toBeGreaterThan(0)
    })
  }

  it('el pie de un email de servicio no lleva baja; el de un aviso, sí (la página de baja de ese tipo)', async () => {
    const service = await renderFixture('auth.verify')
    expect(service.html).not.toContain('Darme de baja')
    expect(service.text).toContain('necesario para usar tu cuenta')
    const page = `${PUBLIC_URL}/api/unsubscribe?token=abc`
    const battle = await renderFixture('auth.welcome', { family: 'battle', unsubscribePageUrl: page })
    expect(battle.html).toContain(page)
    expect(battle.text).toContain('Darme de baja')
  })

  it('el botón es una tabla con el color en la celda (a prueba de balas) y el enlace de texto también está', async () => {
    const { html, text } = await renderFixture('auth.verify')
    expect(html).toMatch(/<td[^>]*bgcolor="#e6003a"/)
    expect(text).toContain('/api/auth/verify-email?token=ejemplo')
  })

  it('battle.drop: el asunto es «Nuevo drop: <sample> · <BPM> BPM · <tonalidad>» y un título largo se corta', () => {
    const drop = TEMPLATES['battle.drop']
    expect(drop.subject(drop.fixture)).toBe('Nuevo drop: Lluvia en Gràcia · 92 BPM · Re menor')
    const long = drop.subject({
      ...drop.fixture,
      title: 'Un título larguísimo que no cabe de ninguna manera',
    })
    expect(long.length).toBeLessThanOrEqual(50)
    expect(long).toMatch(/…· 92 BPM · Re menor$|… · 92 BPM · Re menor$/)
  })

  it('battle.drop: a quien solo dejó su email se le invita a crear cuenta; a una cuenta, no', async () => {
    const drop = TEMPLATES['battle.drop']
    const subscriber = await renderEmail(drop, drop.fixture, { publicUrl: PUBLIC_URL, family: 'battle' })
    const account = await renderEmail(
      drop,
      { ...drop.fixture, subscriber: false },
      { publicUrl: PUBLIC_URL, family: 'battle' },
    )
    expect(subscriber.text).toContain('crea la tuya')
    expect(account.text).not.toContain('crea la tuya')
    expect(subscriber.html).toContain(`${PUBLIC_URL}/api/email/countdown/2026-w41.gif`)
  })
})
