import { afterEach, describe, expect, it } from 'vitest'
import { clearDraft, draftToFields, EMPTY_DRAFT, loadDraft, saveDraft, validateDraft } from './entrySheet'

const messages = {
  title: 'título',
  bpm: 'bpm',
  daw: 'daw',
  genres: 'géneros',
  description: 'descripción',
  declaration: 'declaración',
}

afterEach(() => window.sessionStorage.clear())

describe('la hoja del luchador (§2.5)', () => {
  it('pasa a la ficha de la API: BPM con coma, DAW «otro», descripción vacía → null', () => {
    expect(
      draftToFields({
        ...EMPTY_DRAFT,
        title: '  Bruma  ',
        bpm: '139,5',
        musicalKey: 'Am',
        daw: 'other',
        dawOther: 'Renoise',
        genres: ['Trap'],
        description: '   ',
        declaration: true,
      }),
    ).toEqual({
      title: 'Bruma',
      bpm: 139.5,
      musicalKey: 'Am',
      daw: 'Renoise',
      genres: ['Trap'],
      description: null,
      declaration: true,
    })
  })

  it('valida con el esquema del servidor: título de 2 a 60, BPM de 40 a 250, la declaración', () => {
    expect(validateDraft({ ...EMPTY_DRAFT, title: 'A' }, messages)).toMatchObject({
      title: 'título',
      declaration: 'declaración',
    })
    expect(validateDraft({ ...EMPTY_DRAFT, title: 'Bruma', bpm: '20', declaration: true }, messages)).toEqual(
      {
        bpm: 'bpm',
      },
    )
    expect(validateDraft({ ...EMPTY_DRAFT, title: 'Bruma', declaration: true }, messages)).toEqual({})
  })

  it('RF-ENT-12: el borrador se guarda por semana y vuelve sin la declaración marcada', () => {
    saveDraft('2026-w42', { ...EMPTY_DRAFT, title: 'Bruma', declaration: true })
    expect(loadDraft('2026-w42')).toMatchObject({ title: 'Bruma', declaration: false })
    expect(loadDraft('2026-w43')).toBeNull()
    clearDraft('2026-w42')
    expect(loadDraft('2026-w42')).toBeNull()
  })
})
