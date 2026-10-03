import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from './index'
import { Trans } from './Trans'

describe('i18n: <Trans>', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pinta el mensaje con sus elementos en el orden y con los separadores de es.json', () => {
    const consoleError = vi.spyOn(console, 'error')
    const { container } = render(
      <p>
        <Trans
          k="app.pageTitle"
          values={{ page: <a href="https://otherpeople.es">Other People Records</a> }}
        />
      </p>,
    )
    expect(container.textContent).toBe(`Other People Records · ${t('app.name')}`)
    expect(screen.getByRole('link', { name: 'Other People Records' })).toHaveAttribute(
      'href',
      'https://otherpeople.es',
    )
    // Los trozos van como hijos sueltos: React no avisa de que falten `key`.
    expect(consoleError).not.toHaveBeenCalled()
  })
})
