import type { OwnEntry } from '@beatbattle/shared'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useScreen } from '../../app/layout/screen'
import { renderInRouter } from '../../app/layout/testing'
import { t } from '../../i18n'
import { UploadCelebration, UploadMeter } from './UploadProgress'

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
})
