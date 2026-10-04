import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { DataTile, DataTileList } from './DataTile'

describe('DataTile (§3.3 «Tesela», 0.25)', () => {
  it('es un par término y valor con su unidad, en un marco de chaflán --bb-cut-md', () => {
    render(
      <DataTileList>
        <DataTile label="Tempo" value="94" unit="BPM" hot />
      </DataTileList>,
    )
    expect(screen.getByRole('term')).toHaveTextContent('Tempo')
    expect(screen.getByRole('definition')).toHaveTextContent('94 BPM')
    expect(screen.getByRole('term').parentElement).toHaveAttribute('data-frame-cut', 'md')
  })

  it('cargando: esqueleto con aria-busy y «Cargando…»', () => {
    render(
      <DataTileList>
        <DataTile label="Media" value="" loading />
      </DataTileList>,
    )
    const value = screen.getByRole('definition')
    expect(value).toHaveAttribute('aria-busy', 'true')
    expect(value).toHaveTextContent(t('ui.skeleton.loading'))
  })
})
