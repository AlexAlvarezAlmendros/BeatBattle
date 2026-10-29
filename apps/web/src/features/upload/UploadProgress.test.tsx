import type { Me, OwnEntry } from '@beatbattle/shared'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useScreen } from '../../app/layout/screen'
import { renderInRouter } from '../../app/layout/testing'
import { t } from '../../i18n'
import { EMPTY_ME_GAME } from '../../test/game'
import { useSession } from '../account/session'
import { useHud } from '../game/hudStore'
import { NEW_BEAT_IMPACT_MS, UploadCelebration, UploadMeter } from './UploadProgress'

const ME: Me = {
  id: 'u1',
  email: 'aina@example.com',
  emailVerified: true,
  username: 'aina',
  displayUsername: 'Aina',
  role: 'user',
  cardNumber: 7,
  xp: 0,
  avatarUrl: null,
  game: EMPTY_ME_GAME,
}

/** Las teclas que enseñaría la barra de controles (`useScreen`, con lo que ponga la pantalla). */
function BarKeys() {
  return <p data-testid="keys">{useScreen().keys.join(' ')}</p>
}

const ENTRY: OwnEntry = {
  id: 'e1',
  weekSlug: '2026-w42',
  alias: 'Tigre Púrpura',
  title: 'Bruma',
  description: null,
  bpm: 140,
  musicalKey: 'Am',
  daw: null,
  genres: [],
  durationMs: 150_000,
  peaks: null,
  gainDb: -4,
  streamUrl: '/stream',
  cover: { kind: 'generative', seed: 7 },
  producer: null,
  result: null,
  status: 'active',
  receiptCode: 'BB-2026W42-0001',
  format: 'wav',
  bytes: 1000,
  loudnessLufs: -10,
  truePeakDb: -1,
  ownCoverUrl: null,
  challengeClaimed: false,
  canReplaceAudio: true,
  submittedAt: 1,
  updatedAt: 1,
}

describe('/subir: el medidor de súper (§3.8.5)', () => {
  it('RF-ENT-07: al llegar, el foco en «Cancelar»; Esc cancela y la barra dice ESC CANCELAR (§3.4.1)', async () => {
    const onCancel = vi.fn()
    renderInRouter(
      <>
        <UploadMeter
          sent={512}
          total={2048}
          speed={1}
          remaining={2}
          registering={false}
          onCancel={onCancel}
        />
        <BarKeys />
      </>,
    )
    const cancel = screen.getByRole('button', { name: new RegExp(t('pages.upload.progress.cancel')) })
    await waitFor(() => expect(cancel).toHaveFocus())
    expect(screen.getByTestId('keys')).toHaveTextContent('cancel sound')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '25 % subido'.replace(' ', ' '))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('mientras verifica, el foco en su título y Esc no cancela ni se sale (jurado de la 4.20, A12)', async () => {
    const onCancel = vi.fn()
    renderInRouter(
      <UploadMeter sent={2048} total={2048} speed={null} remaining={null} registering onCancel={onCancel} />,
    )
    const title = screen.getByRole('heading', { name: t('pages.upload.progress.registering') })
    await waitFor(() => expect(title).toHaveFocus())
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.body.dispatchEvent(esc)
    expect(esc.defaultPrevented).toBe(true)
    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe('/subir: la celebración (§3.8.5)', () => {
  it('el foco va al alias, su título, y la única acción es «Ver mi entrada»', async () => {
    renderInRouter(<UploadCelebration entry={ENTRY} weekNumber={42} />)
    const alias = screen.getByRole('heading', { name: 'Tigre Púrpura' })
    await waitFor(() => expect(alias).toHaveFocus())
    expect(screen.getByRole('link', { name: t('pages.upload.done.view') })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Volver al menú/ })).toBeNull()
  })

  it('RF-GAME-08: dice «+125 XP» (sin el XP de sus logros) y en el impacto lanza el «+XP» y los avisos, una vez', async () => {
    useSession.setState({ status: 'signedIn', me: ME })
    useHud.setState({ holds: 0 })
    useHud.getState().reset()
    const hold = useHud.getState().hold()
    const game = { xp: 225, achievements: ['first_entry' as const, 'early_bird' as const], level: 2 }
    renderInRouter(<UploadCelebration entry={ENTRY} weekNumber={42} game={game} />)
    const line = screen.getByText((_, node) => node?.textContent?.replace(/\s+/g, ' ') === '+125 XP')
    expect(line).toBeInTheDocument()
    // Hasta el impacto del anunciador, nada.
    expect(useHud.getState().floats).toEqual([])
    await waitFor(() => expect(useHud.getState().floats).toHaveLength(1), {
      timeout: NEW_BEAT_IMPACT_MS + 1000,
    })
    expect(useHud.getState().floats[0]?.amount).toBe(125)
    expect(useHud.getState().queue.map((notice) => notice.kind)).toEqual([
      'achievement',
      'achievement',
      'level',
    ])
    expect(useSession.getState().me?.game.xp).toBe(225)
    hold()
    useHud.getState().reset()
    useSession.setState({ status: 'anonymous', me: null })
  })
})
