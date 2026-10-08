import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderInRouter } from '../../app/layout/testing'
import { useSession } from './session'
import { WelcomePage } from './WelcomePage'

const ME = {
  id: 'u1',
  email: 'k@example.com',
  emailVerified: true,
  username: 'kairo.wav',
  displayUsername: 'Kairo.wav',
  role: 'user' as const,
  cardNumber: 42,
  xp: 0,
}

afterEach(() => useSession.setState({ status: 'loading', me: null }))

describe('bienvenida (§3.8.9)', () => {
  it('enseña la carta impresa con su número, «Bienvenido a la batalla» y el primer logro por ganar', () => {
    useSession.setState({ status: 'signedIn', me: ME })
    renderInRouter(<WelcomePage />, '/bienvenida')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bienvenido a la batalla')
    expect(
      screen.getByRole('article', { name: 'Carta de luchador de Kairo.wav, número 42' }),
    ).toHaveTextContent('#0042')
    expect(screen.getByText('Primer sample')).toBeInTheDocument()
  })

  it('sin sesión, a entrar', async () => {
    useSession.setState({ status: 'anonymous', me: null })
    const { router } = renderInRouter(<WelcomePage />, '/bienvenida')
    await waitFor(() => expect(router.state.location.pathname).toBe('/entrar'))
  })
})
