import type { Me } from '@beatbattle/shared'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { EMPTY_ME_GAME } from '../../test/game'
import { useSession } from '../account/session'
import { FLOAT_TIMEOUT_MS, LIVE_MAX, useHud } from './hudStore'
import { RewardsViewport } from './RewardsViewport'
import { achievementXp, applyGameDelta, noticeText, useGameRewards } from './rewards'

const ME: Me = {
  id: 'u1',
  email: 'aina@example.com',
  emailVerified: true,
  username: 'aina',
  displayUsername: 'Aina',
  role: 'user',
  cardNumber: 7,
  xp: 125,
  avatarUrl: null,
  game: { ...EMPTY_ME_GAME, xp: 125, unseenAchievements: [] },
}

/** Lo que el marco monta: la región y lo que pasa al enseñar un aviso (`onShow`). */
function Frame() {
  useGameRewards()
  return <RewardsViewport />
}

/** Los mensajes de la región, en orden. */
const said = () =>
  [...screen.getByRole('log', { name: t('game.live.region') }).children].map((node) => node.textContent)

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 204 })),
  )
  useHud.setState({ holds: 0 })
  useHud.getState().reset()
  useSession.setState({ status: 'signedIn', me: ME })
})

afterEach(() => {
  act(() => useSession.setState({ status: 'anonymous', me: null }))
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('la región viva de las recompensas (RNF-A11Y-07)', () => {
  it('RNF-A11Y-07: está desde el principio, vacía y educada (un registro: cada mensaje se lee al llegar y una vez)', () => {
    render(<Frame />)
    const region = screen.getByRole('log', { name: t('game.live.region') })
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveAttribute('aria-relevant', 'additions')
    expect(region).toHaveAttribute('aria-atomic', 'false')
    expect(region).toBeEmptyDOMElement()
  })

  it('RNF-A11Y-07: el XP, los logros y el nivel que salen a la vez se dicen todos, en su orden y una sola vez', () => {
    render(<Frame />)
    // Una subida: 100 XP del hecho, dos logros y el nivel 2, todo en la misma respuesta.
    const xp = 100 + achievementXp('first_entry') + achievementXp('early_bird')
    act(() => applyGameDelta({ xp, achievements: ['first_entry', 'early_bird'], level: 2 }))
    expect(said()).toEqual([t('game.live.xp', { amount: 100 })])
    // El «+XP» llega al medidor y salen a la vez las dos placas y la subida de nivel.
    act(() => vi.advanceTimersByTime(FLOAT_TIMEOUT_MS))
    const shown = [...useHud.getState().plates, useHud.getState().big].filter((notice) => notice !== null)
    expect(shown).toHaveLength(3)
    expect(said()).toEqual([t('game.live.xp', { amount: 100 }), ...shown.map((notice) => noticeText(notice))])
    // Nada se repite al irse los avisos, ni con otra lectura de la sesión con lo mismo.
    act(() => vi.advanceTimersByTime(10_000))
    act(() =>
      useSession.setState({ me: { ...ME, game: { ...ME.game, unseenAchievements: ['first_entry'] } } }),
    )
    expect(said()).toHaveLength(4)
  })

  it(`RNF-A11Y-07: guarda como mucho los ${LIVE_MAX} últimos (los de antes ya se leyeron)`, () => {
    render(<Frame />)
    for (let vote = 0; vote < LIVE_MAX + 3; vote++) {
      act(() => applyGameDelta({ xp: 5, achievements: [], level: 1 }))
      act(() => vi.advanceTimersByTime(FLOAT_TIMEOUT_MS))
    }
    expect(said()).toHaveLength(LIVE_MAX)
  })
})
