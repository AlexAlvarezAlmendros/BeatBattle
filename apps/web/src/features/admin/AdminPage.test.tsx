import type { AdminSample } from '@beatbattle/shared'
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderInRouter } from '../../app/layout/testing'
import { t } from '../../i18n'
import { EMPTY_ME_GAME } from '../../test/game'
import { useSession } from '../account/session'
import { AdminPage, ScheduleForm } from './AdminPage'

const SAMPLE: AdminSample = {
  id: 's1',
  title: 'Polvo de vinilo',
  credits: '',
  origin: null,
  licenseText: '',
  bpm: null,
  musicalKey: null,
  genreHint: null,
  durationMs: 1000,
  bytes: 1,
  format: 'wav',
  loudnessLufs: null,
  peaks: '',
  chops: [],
  hasStems: false,
  coverUrl: '',
  streamUrl: '',
  weeks: [],
  createdAt: 0,
}

const ME = {
  id: 'u1',
  email: 'lilbru@example.com',
  emailVerified: true,
  username: 'lilbru',
  displayUsername: 'LilBru',
  cardNumber: 1,
  xp: 0,
  avatarUrl: null,
  game: EMPTY_ME_GAME,
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

  it('RF-ADM-02: el selector de semana dorada explica qué es', () => {
    renderInRouter(<ScheduleForm gaps={['2099-01-05']} samples={[SAMPLE]} onDone={() => {}} />, '/admin')
    const chip = screen.getByRole('button', { name: t('admin.calendar.golden') })
    expect(chip).toHaveAccessibleDescription(t('admin.calendar.goldenHelp'))
  })
})
