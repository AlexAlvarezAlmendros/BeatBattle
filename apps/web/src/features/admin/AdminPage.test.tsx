import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderInRouter } from '../../app/layout/testing'
import { t } from '../../i18n'
import { useSession } from '../account/session'
import { AdminPage } from './AdminPage'

const ME = {
  id: 'u1',
  email: 'lilbru@example.com',
  emailVerified: true,
  username: 'lilbru',
  displayUsername: 'LilBru',
  cardNumber: 1,
  xp: 0,
  avatarUrl: null,
}

afterEach(() => useSession.setState({ status: 'loading', me: null }))

describe('AdminPage (§2.14)', () => {
  it('RF-AUTH-03 (en la web): sin sesión pide entrar; un productor ve que es solo para administración', () => {
    useSession.setState({ status: 'anonymous', me: null })
    const { unmount } = renderInRouter(<AdminPage />, '/admin')
    expect(screen.getByText(t('admin.require'))).toBeInTheDocument()
    unmount()
    useSession.setState({ status: 'signedIn', me: { ...ME, role: 'user' } })
    renderInRouter(<AdminPage />, '/admin')
    expect(screen.getByText(t('admin.forbidden'))).toBeInTheDocument()
  })

  it('RF-ADM-02: con el rol, enseña el calendario y los samples', () => {
    useSession.setState({ status: 'signedIn', me: { ...ME, role: 'admin' } })
    renderInRouter(<AdminPage />, '/admin')
    expect(screen.getByRole('heading', { name: t('admin.calendar.title') })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: t('admin.samples.title') })).toBeInTheDocument()
  })
})
