import type { Me } from '@beatbattle/shared'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerCard } from '../../app/layout/PlayerCard'
import { audio } from '../../audio/engine'
import { t } from '../../i18n'
import { EMPTY_ME_GAME } from '../../test/game'
import { playerOf, useSession } from '../account/session'
import { FloatXpLayer, placeFloat } from './FloatXp'
import { useHud } from './hudStore'
import { applyGameDelta } from './rewards'

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
  game: { ...EMPTY_ME_GAME, xp: 125 },
}

/** La ficha del HUD con lo que dice la sesión, como la pinta el marco. */
function SessionCard() {
  const me = useSession((state) => state.me)
  return me ? <PlayerCard {...playerOf(me)} /> : null
}

beforeEach(() => {
  useHud.setState({ holds: 0 })
  useHud.getState().reset()
  useSession.setState({ status: 'signedIn', me: ME })
})

afterEach(() => {
  act(() => useSession.setState({ status: 'anonymous', me: null }))
  act(() => useHud.getState().reset())
  vi.restoreAllMocks()
})

describe('XP flotante (§3.4.2, tarea 7.19)', () => {
  it('RF-GAME-08: votar muestra «+5 XP» y el medidor sube cuando lo traga, con `xp.gain`', async () => {
    const play = vi.spyOn(audio, 'play').mockImplementation(() => {})
    render(
      <>
        <SessionCard />
        <FloatXpLayer />
      </>,
    )
    const meter = screen.getByRole('meter', { name: t('frame.player.xp') })
    expect(meter).toHaveAttribute('aria-valuenow', '125')
    const anchor = document.createElement('div')
    document.body.append(anchor)
    act(() => applyGameDelta({ xp: 5, achievements: [], level: 1 }, { anchor, combo: 3 }))
    // El «+5 XP» se ve (solo para la vista: la región viva ya lo dice) y el medidor aún no lo enseña.
    const float = screen.getByText((_, node) => node?.hasAttribute('data-float-xp') ?? false)
    expect(float).toHaveTextContent(/^\+5\sXP$/)
    expect(float).toHaveAttribute('aria-hidden', 'true')
    expect(meter).toHaveAttribute('aria-valuenow', '125')
    await vi.waitFor(() => expect(meter).toHaveAttribute('aria-valuenow', '130'), { timeout: 4000 })
    expect(play).toHaveBeenCalledWith('xp.gain', { xpCombo: 3 })
    expect(screen.queryByText((_, node) => node?.hasAttribute('data-float-xp') ?? false)).toBeNull()
    anchor.remove()
  })

  it('RF-GAME-08: nace a la derecha de lo que lo provoca si cabe y, si no, encima: nunca sobre una tecla ni una estrella', () => {
    const stars = { x: 400, y: 600, width: 500, height: 80 }
    const right = placeFloat(stars, null, 1440)
    expect(right.side).toBe('right')
    expect(right.x).toBeGreaterThan(stars.x + stars.width)
    // En una ventana estrecha no cabe a la derecha: encima, con su borde derecho en el de las estrellas.
    const above = placeFloat({ x: 16, y: 600, width: 358, height: 80 }, null, 390)
    expect(above.side).toBe('above')
    expect(above.y).toBeLessThan(600)
    expect(above.x).toBe(16 + 358)
    // Sin nada que lo provoque, bajo el medidor del HUD.
    expect(placeFloat(null, { x: 160, y: 60, width: 192, height: 24 }, 1440)).toMatchObject({
      side: 'meter',
      x: 256,
    })
  })
})
