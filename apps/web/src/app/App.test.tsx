import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

describe('App', () => {
  // jsdom no implementa el scroll; ScrollRestoration lo usa al montar.
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('monta la home', async () => {
    render(<App />)
    // La home llega en su trozo diferido: con toda la batería en paralelo puede tardar más de 1 s.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Beat Battle' }, { timeout: 5000 }),
    ).toBeInTheDocument()
  })
})
