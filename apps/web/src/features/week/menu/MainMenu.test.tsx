import { act, fireEvent, getDefaultNormalizer, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOBILE_QUERY } from '../../../app/layout/ArenaBackdrop'
import { RootLayout } from '../../../app/layout/RootLayout'
import { MENU_SCREEN } from '../../../app/layout/screen'
import { t } from '../../../i18n'
import { mockMatchMedia } from '../../../ui/hooks/mockMatchMedia'
import { MainMenu } from './MainMenu'
import type { MenuModel } from './model'

const WEEK: NonNullable<MenuModel['week']> = {
  phase: 'open',
  number: 41,
  title: 'Lluvia en Gràcia',
  credits: 'Rhodes y lluvia',
  range: '5–11 oct',
  bpm: 92,
  musicalKey: 'Re menor',
  durationSeconds: 72,
  genre: 'Boom bap',
  peaks: [[-0.5, 0.5]],
  challenge: 'Usa solo el primer compás',
  entries: 23,
  closesAt: Date.UTC(2026, 9, 11, 18),
  when: 'domingo 11 a las 20:00',
  clockWhen: 'Domingo 11 a las 20:00 · votos hasta las 23:59',
  weekBar: { today: 2, progress: 0.4 },
}

const PLAYER: NonNullable<MenuModel['player']> = {
  name: 'LilBru',
  initials: 'LB',
  level: 7,
  rank: 'Beatmaker',
  xp: { value: 2980, min: 2650, max: 3350 },
  uploaded: false,
  unvoted: 16,
  streak: 3,
}

function renderMenu(model: Partial<MenuModel> = {}) {
  const full: MenuModel = {
    week: WEEK,
    player: PLAYER,
    lastSealed: { number: 40, unseen: true },
    chronicle: ['Hola'],
    ...model,
  }
  const router = createMemoryRouter(
    [
      {
        element: <RootLayout />,
        children: [
          { index: true, handle: { screen: MENU_SCREEN }, element: <MainMenu model={full} /> },
          { path: '*', element: <h1>Destino</h1> },
        ],
      },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(Date.UTC(2026, 9, 7, 10))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const items = () => within(screen.getByRole('menu')).getAllByRole('menuitem')

describe('MainMenu (0.24, §3.8.3)', () => {
  it('con semana y sesión: el reloj de ronda en el HUD, el jugador, la racha y el número de semana en la cuña', () => {
    renderMenu()
    const hud = screen.getByRole('banner')
    expect(within(hud).getByRole('timer', { name: t('home.clock.closes') })).toBeInTheDocument()
    expect(within(hud).getByText('LilBru')).toBeInTheDocument()
    expect(within(hud).getByRole('meter', { name: t('frame.player.xp') })).toBeInTheDocument()
    expect(within(hud).getByText(t('home.hud.streakValue', { count: 3 }))).toBeInTheDocument()
    expect(document.querySelector('[data-frame-slot="arena"]')).toHaveTextContent('41')
    // La crónica, en la barra de controles, con el crédito delante: «Inserta tu beat» (que respira) y
    // el crédito en Oxanium rojo, en caja mixta (§3.8.3). Sus palabras van unidas por espacios de no
    // separación (parte por el «·»): se compara sin convertirlos en espacios normales.
    const credit = within(screen.getByRole('contentinfo')).getByText(t('home.chronicle.insertAction'), {
      normalizer: getDefaultNormalizer({ collapseWhitespace: false }),
    })
    expect(credit.closest('[data-credit]')).toHaveTextContent(/Inserta tu beat · Crédito 01/)
    expect(credit.closest('[data-credit]')?.querySelector('em')).toHaveTextContent('01')
  })

  it('Jugar sube; Jurado dice cuántas te quedan por votar (tu dato); Resultados lleva el NUEVO', () => {
    renderMenu()
    const [play, jury, results] = items()
    expect(play).toHaveAttribute('href', '/subir')
    expect(play).toHaveAttribute('data-cursor-active', 'true')
    expect(jury).toHaveAttribute('href', '/jurado')
    expect(jury).toHaveTextContent(t('home.modes.jury.unvoted', { count: 16 }))
    expect(results).toHaveTextContent(t('home.modes.results.new'))
  })

  it('§1.3: el menú no enseña medias, posiciones ni autoría; los números son de la semana o del jugador', () => {
    renderMenu()
    const text = screen.getByRole('main').textContent ?? ''
    expect(text).not.toMatch(/media|\d\.º|prod\. by/i)
  })

  it('subida ya hecha: Jugar pasa a «Editar mi entrada» y el cursor empieza en Jurado', () => {
    renderMenu({ player: { ...PLAYER, uploaded: true } })
    const [play, jury] = items()
    expect(play).toHaveTextContent(t('home.modes.play.edit'))
    expect(jury).toHaveAttribute('data-cursor-active', 'true')
  })

  it('domingo de votos: Jugar deshabilitado con «Envíos cerrados» y el reloj del cierre de votos', () => {
    renderMenu({ week: { ...WEEK, phase: 'voting' } })
    expect(items()[0]).toHaveAttribute('aria-disabled', 'true')
    expect(items()[0]).toHaveTextContent(t('home.modes.play.closed'))
    expect(screen.getByRole('timer', { name: t('home.clock.votes') })).toBeInTheDocument()
  })

  it('RD-VIS-02 e / §3.8.3: en voting la barra no invita a subir; la crónica empieza por «Envíos cerrados · votos hasta las 23:59»', () => {
    renderMenu({ week: { ...WEEK, phase: 'voting' } })
    const bar = screen.getByRole('contentinfo')
    // Sin «Inserta tu beat · Crédito 01» (ni su respiro): con los envíos cerrados no hay crédito que gastar.
    expect(bar.querySelector('[data-credit]')).toBeNull()
    expect(bar).not.toHaveTextContent(/Inserta tu beat|Crédito/)
    // El primer mensaje de la crónica (el que se ve al abrir) es el del cierre.
    expect(bar.querySelector('[data-chronicle]')).toHaveTextContent(
      /^Crónica de la arena: Envíos cerrados · votos hasta las 23:59$/,
    )
  })

  it('RD-VIS-02 e / §3.8.3: con la semana abierta a envíos, la crónica empieza por «Inserta tu beat · Crédito 01»', () => {
    renderMenu()
    expect(screen.getByRole('contentinfo').querySelector('[data-chronicle] [data-credit]')).toHaveTextContent(
      /Inserta tu beat · Crédito 01/,
    )
  })

  it('RD-VIS-02 e / §3.8.3: en la composición estrecha con teclado y ratón, «ELIGE MODO» y sus placas van antes que la tarjeta (también en el DOM); en táctil, después', () => {
    const media = mockMatchMedia({ [MOBILE_QUERY]: true })
    try {
      renderMenu()
      const nav = screen.getByRole('navigation', { name: t('home.menu.title') })
      const card = screen.getByRole('article', { name: WEEK.title })
      const precedes = (a: Node, b: Node) =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
      expect(precedes(nav, card)).toBe(true)
      // La tarjeta sale de la sección del título (el logo y el lockup siguen ahí, antes que las placas).
      expect(screen.getByRole('region', { name: t('home.title.label') })).not.toContainElement(card)
      // En táctil, el orden de la maqueta: la tarjeta antes que las placas.
      act(() => media.set('(hover: none), (pointer: coarse)', true))
      expect(precedes(screen.getByRole('article', { name: WEEK.title }), nav)).toBe(true)
    } finally {
      media.restore()
    }
  })

  it('RD-MOT-05: con el foco en ningún control, ↓ lleva el cursor al menú e Intro entra', async () => {
    renderMenu()
    expect(document.activeElement).toBe(document.body)
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(items()[1]).toHaveFocus()
    const help = screen.getByRole('navigation').querySelector('[aria-live="polite"]')
    expect(help).toHaveTextContent(t('home.modes.jury.beats', { count: 16 }))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'Destino' })).toBeInTheDocument()
    await act(async () => {})
  })

  it('RD-MOT-05: ↑/↓ en bucle dentro del menú y el panel de ayuda sigue al cursor', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderMenu()
    items()[0]!.focus()
    await user.keyboard('{ArrowUp}')
    expect(items()[5]).toHaveFocus()
    expect(screen.getByText(t('home.modes.settings.help'))).toBeInTheDocument()
    await user.keyboard('{Home}')
    expect(items()[0]).toHaveFocus()
  })
})
