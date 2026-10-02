import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { DataTile, DataTileList } from './DataTile'

describe('DataTile', () => {
  it('es un par término/definición dentro de una lista de descripción', () => {
    render(
      <DataTileList aria-label="Información">
        <DataTile icon="metronome" label="BPM" value="92" mono />
        <DataTile icon="sharp" label="Tonalidad" value="Re♯ menor" />
      </DataTileList>,
    )
    const list = screen.getByLabelText('Información')
    expect(list.tagName).toBe('DL')
    expect(
      within(list)
        .getAllByRole('term')
        .map((el) => el.textContent),
    ).toEqual(['BPM', 'Tonalidad'])
    expect(
      within(list)
        .getAllByRole('definition')
        .map((el) => el.textContent),
    ).toEqual(['92', 'Re♯ menor'])
  })

  it('el icono es decorativo: la etiqueta da el significado', () => {
    render(
      <DataTileList>
        <DataTile icon="calendar" label="Publicado" value="26 sept 2026" />
      </DataTileList>,
    )
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('cargando: esqueleto en el valor, aria-busy y texto para lectores de pantalla', () => {
    render(
      <DataTileList>
        <DataTile icon="clock" label="Duración" value="2:18" loading />
      </DataTileList>,
    )
    const value = screen.getByRole('definition')
    expect(value).toHaveAttribute('aria-busy', 'true')
    expect(value).toHaveTextContent(t('ui.skeleton.loading'))
    expect(value).not.toHaveTextContent('2:18')
  })

  it('RD-VIS-03: hover forzado', () => {
    const { container } = render(
      <DataTileList>
        <DataTile icon="tag" label="Género" value="Drill" state="hover" />
      </DataTileList>,
    )
    expect(container.querySelector('[data-force-state="hover"]')).not.toBeNull()
  })
})
