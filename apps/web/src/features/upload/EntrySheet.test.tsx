import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { ApiClientError } from '../../net/api'
import { EntrySheet, type EntrySheetResult, genreLabel } from './EntrySheet'
import { EMPTY_DRAFT, type EntryDraft } from './entrySheet'
import { mimeOf, uploadErrorMessage } from './useEntryUpload'

function Harness({
  onSubmit,
  initial = EMPTY_DRAFT,
}: {
  onSubmit: (r: EntrySheetResult) => void
  initial?: EntryDraft
}) {
  const [draft, setDraft] = useState(initial)
  return <EntrySheet draft={draft} onChange={setDraft} onSubmit={onSubmit} blind />
}

describe('la hoja del luchador (§2.5, 4.15)', () => {
  it('RF-ENT-06: llega con BPM y tonalidad del análisis y los deja cambiar', () => {
    render(<Harness onSubmit={() => {}} initial={{ ...EMPTY_DRAFT, bpm: '140', musicalKey: 'Am' }} />)
    expect(screen.getByLabelText(t('pages.upload.sheet.fields.bpm'))).toHaveValue('140')
    expect(screen.getByLabelText(t('pages.upload.sheet.fields.key'))).toHaveValue('Am')
    fireEvent.change(screen.getByLabelText(t('pages.upload.sheet.fields.bpm')), { target: { value: '70' } })
    expect(screen.getByLabelText(t('pages.upload.sheet.fields.bpm'))).toHaveValue('70')
  })

  it('sin título ni declaración no se envía: dice qué falta y el foco va al primer problema', () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('pages.upload.sheet.submit')) }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(t('pages.upload.sheet.errors.title'))).toBeInTheDocument()
    expect(screen.getByText(t('pages.upload.sheet.errors.declaration'))).toBeInTheDocument()
    expect(screen.getByLabelText(t('pages.upload.sheet.fields.title'))).toHaveFocus()
  })

  it('hasta 3 géneros: con 3 elegidos, los demás no se pueden marcar', () => {
    render(<Harness onSubmit={() => {}} />)
    for (const genre of ['Trap', 'Drill', 'Jersey'] as const)
      fireEvent.click(screen.getByRole('button', { name: new RegExp(genreLabel(genre)) }))
    expect(screen.getByRole('button', { name: new RegExp(genreLabel('Club')) })).toBeDisabled()
    expect(screen.getByRole('button', { name: new RegExp(genreLabel('Trap')) })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('con todo en regla, sale la ficha para la API', () => {
    const onSubmit = vi.fn()
    render(
      <Harness
        onSubmit={onSubmit}
        initial={{ ...EMPTY_DRAFT, title: 'Bruma', bpm: '140', musicalKey: 'Am' }}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(t('pages.upload.sheet.fields.declaration')) }),
    )
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('pages.upload.sheet.submit')) }))
    expect(onSubmit).toHaveBeenCalledWith({
      fields: {
        title: 'Bruma',
        bpm: 140,
        musicalKey: 'Am',
        daw: null,
        genres: [],
        description: null,
        declaration: true,
      },
      cover: null,
      removeCover: false,
    })
  })

  it('RF-ENT-10: avisa de que en voto ciego la portada propia no se ve hasta el sellado', () => {
    render(<Harness onSubmit={() => {}} />)
    expect(screen.getByText(t('pages.upload.sheet.cover.blind'))).toBeInTheDocument()
  })
})

describe('la subida (4.16)', () => {
  it('el tipo declarado sale de la extensión si el navegador no lo da', () => {
    expect(mimeOf(new File([], 'beat.AIF'))).toBe('audio/aiff')
    expect(mimeOf(new File([], 'beat.flac'))).toBe('audio/flac')
  })

  it('RF-ENT-03 / RF-ENT-01: los fallos del servidor, con la frase de la UI', () => {
    const tooLong = new ApiClientError('DURATION_OUT_OF_RANGE', 422, 'x', {
      code: 'DURATION_OUT_OF_RANGE',
      durationMs: 252_000,
      limit: 'max',
      limitMs: 240_000,
    })
    expect(uploadErrorMessage(tooLong)).toBe(t('pages.upload.problems.durationTooLong', { duration: '4:12' }))
    expect(uploadErrorMessage(new ApiClientError('ENTRY_EXISTS', 409, 'x'))).toBe(
      t('pages.upload.errors.exists'),
    )
    expect(uploadErrorMessage(new Error('red'))).toBe(t('pages.upload.errors.network'))
  })
})
