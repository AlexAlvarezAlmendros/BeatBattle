import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { useRovingGrid } from '../hooks/useRovingGrid'
import { EntryCell } from './EntryCell'

function Grid() {
  const grid = useRovingGrid({ count: 4, columns: 2 })
  return (
    <div {...grid.getContainerProps({ 'aria-label': 'Entradas' })}>
      <EntryCell alias="Tigre Púrpura" bpm={94} musicalKey="Re menor" itemProps={grid.getItemProps(0)} />
      <EntryCell
        alias="Cobra Lunar"
        bpm={88}
        musicalKey="La menor"
        myVote={4}
        itemProps={grid.getItemProps(1)}
      />
      <EntryCell
        alias="Lince Eléctrico"
        bpm={90}
        musicalKey="Do menor"
        error
        itemProps={grid.getItemProps(2)}
      />
      <EntryCell itemProps={grid.getItemProps(3)} />
    </div>
  )
}

describe('EntryCell (§3.3 «Casilla de entrada», 0.25)', () => {
  it('se anuncia con alias, tempo, tonalidad y tu estado (§3.8.13)', () => {
    render(<Grid />)
    expect(
      screen.getByRole('option', { name: 'Tigre Púrpura, 94\u00a0BPM, Re menor, sin votar' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', {
        name: `Cobra Lunar, 88\u00a0BPM, La menor, ${t('ui.entryCell.votedState', { vote: 4 })}`,
      }),
    ).toHaveAttribute('data-voted', 'true')
    expect(screen.getByRole('option', { name: t('ui.entryCell.randomLabel') })).toHaveAttribute(
      'data-random',
      'true',
    )
  })

  it('§1.3: sin números de orden, medias, recuentos ni autoría en ninguna casilla', () => {
    render(<Grid />)
    for (const option of screen.getAllByRole('option')) {
      // Lo que se ve, sin la etiqueta 1P del cursor.
      const visible = (option.textContent ?? '').replace(t('ui.cursor.player'), '')
      expect(visible).not.toMatch(/^\s*\d|media|votos|prod/i)
    }
  })

  it('RD-MOT-05: rejilla 2D con el cursor 1P encima; las flechas mueven la selección', async () => {
    const user = userEvent.setup()
    render(<Grid />)
    const options = screen.getAllByRole('option')
    expect(options[0]!.querySelector('[data-cursor-player="top"]')).toHaveTextContent('1P')
    options[0]!.focus()
    await user.keyboard('{ArrowDown}')
    expect(options[2]).toHaveFocus()
    expect(options[2]).toHaveAttribute('aria-selected', 'true')
  })
})
