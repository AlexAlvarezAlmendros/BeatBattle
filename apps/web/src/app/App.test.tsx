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
    expect(await screen.findByRole('heading', { level: 1, name: 'Beat Battle' })).toBeInTheDocument()
  })
})
