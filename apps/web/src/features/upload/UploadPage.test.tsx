import type { CurrentWeek, PublicWeek } from '@beatbattle/shared'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderInRouter } from '../../app/layout/testing'
import { t } from '../../i18n'
import { queryKeys } from '../../net/queryKeys'
import { UploadPage } from './UploadPage'

function weekWith(overrides: Partial<PublicWeek> = {}): PublicWeek {
  const now = Date.now()
  return {
    number: 42,
    slug: '2026-w42',
    label: '2026-W42',
    seasonId: '2026-T4',
    phase: 'open',
    startsAt: now - 3_600_000,
    submitEndsAt: now + 86_400_000,
    voteEndsAt: now + 90_000_000,
    challenge: null,
    golden: false,
    entries: 3,
    sample: {
      title: 'Lluvia en Gràcia',
      credits: 'Other People Records',
      origin: null,
      licenseText: 'Uso libre',
      bpm: 92,
      musicalKey: 'Dm',
      genreHint: null,
      durationMs: 72_000,
      peaks: '',
      chops: [],
      hasStems: false,
      coverUrl: '/cover',
      streamUrl: '/stream',
    },
    viewer: { rulesAccepted: true, dropSeen: true, entry: null },
    ...overrides,
  }
}

function render(week: PublicWeek | null) {
  return renderInRouter(<UploadPage />, '/subir', (client) =>
    client.setQueryData<CurrentWeek>(queryKeys.weeks.current(), { week, next: null }),
  )
}

/** Un fichero falso con el nombre y el tamaño que digamos. */
function fakeFile(name: string, size = 1000): File {
  const file = new File([new Uint8Array(4)], name)
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function choose(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

describe('/subir: comprobaciones previas (§2.5, paso 1)', () => {
  it('RF-ENT-02: con los envíos cerrados no se ofrece la ranura', () => {
    render(weekWith({ phase: 'voting' }))
    expect(screen.getByText(t('pages.upload.closed.summary'))).toBeInTheDocument()
    expect(screen.queryByText(t('pages.upload.slot.title'))).toBeNull()
  })

  it('sin semana en juego, tampoco', () => {
    render(null)
    expect(screen.getByText(t('pages.upload.closed.summary'))).toBeInTheDocument()
  })

  it('RF-DROP-06: sin las bases aceptadas, primero las bases', () => {
    render(weekWith({ viewer: { rulesAccepted: false, dropSeen: true, entry: null } }))
    expect(screen.getByRole('button', { name: t('pages.upload.rules.open') })).toBeInTheDocument()
    expect(screen.queryByText(t('pages.upload.slot.title'))).toBeNull()
  })

  it('RF-ENT-01: con su entrada en la semana, no hay ranura: está dentro, con su alias', () => {
    render(
      weekWith({
        viewer: {
          rulesAccepted: true,
          dropSeen: true,
          entry: { id: 'e1', status: 'active', alias: 'Tigre Púrpura' },
        },
      }),
    )
    expect(screen.getByText(/Tigre Púrpura/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: t('pages.upload.inside.view') })).toHaveAttribute('href', '/e/e1')
  })
})

describe('/subir: la ranura (§3.8.5)', () => {
  it('«Elegir archivo» tiene el foco al llegar (Intro abre el selector)', async () => {
    render(weekWith())
    const pick = screen.getByRole('button', { name: new RegExp(t('pages.upload.slot.pick')) })
    await waitFor(() => expect(pick).toHaveFocus())
    expect(screen.getByRole('region', { name: t('pages.upload.slot.title') })).toBeInTheDocument()
  })

  it('RF-ENT-03: un fichero que no es audio se rechaza en el navegador, con su motivo', () => {
    render(weekWith())
    choose(fakeFile('beat.txt'))
    expect(screen.getByRole('alert')).toHaveTextContent(t('pages.upload.problems.unsupportedFormat'))
    // La ranura sigue esperando.
    expect(screen.getByRole('region', { name: t('pages.upload.slot.title') })).toBeInTheDocument()
  })

  it('RF-ENT-03: más de 100 MB, también (antes de leerlo)', () => {
    render(weekWith())
    choose(fakeFile('beat.wav', 101 * 1024 * 1024))
    expect(screen.getByRole('alert')).toHaveTextContent('101')
  })
})
