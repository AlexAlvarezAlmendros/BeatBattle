import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { FighterCard } from './FighterCard'

const ENTRY = {
  alias: 'Tigre Púrpura',
  title: 'Charcos en Verdi',
  bpm: 94,
  musicalKey: 'Re menor',
  durationSeconds: 171,
  genre: 'Boom bap',
  peaks: [[-0.4, 0.5] as const, [-0.8, 0.7] as const],
}

describe('FighterCard (§3.3 «Ficha de luchador», 0.25)', () => {
  it('se nombra por el alias y enseña las cuatro teselas, la autoría oculta y el estado propio', () => {
    render(<FighterCard entry={ENTRY} />)
    const card = screen.getByRole('region', { name: 'Tigre Púrpura' })
    expect(screen.getByRole('heading', { level: 2, name: 'Tigre Púrpura' })).toBeInTheDocument()
    expect(card).toHaveTextContent(t('ui.fighterCard.authorHidden'))
    expect(card).toHaveTextContent('94')
    expect(card).toHaveTextContent('Re menor')
    expect(card).toHaveTextContent('2:51')
    expect(card).toHaveTextContent(t('ui.fighterCard.notVoted'))
    expect(screen.getAllByRole('term')).toHaveLength(4)
  })

  it('§1.3: nada de autoría, medias, recuentos ni posición; tu voto sí (es estado propio)', () => {
    const { rerender } = render(<FighterCard entry={ENTRY} />)
    const text = () => screen.getByRole('region').textContent ?? ''
    expect(text()).not.toMatch(/votos|media|posici|prod\. by/i)
    rerender(<FighterCard entry={{ ...ENTRY, myVote: 4 }} />)
    expect(text()).toContain(t('ui.fighterCard.voted', { vote: 4 }))
  })

  it('cargando: esqueleto con aria-busy; error: aviso de papel y reintentar', () => {
    const { rerender } = render(<FighterCard loading />)
    expect(document.querySelector('[aria-busy="true"]')).toHaveTextContent(t('ui.fighterCard.loading'))
    rerender(<FighterCard error onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent(t('ui.fighterCard.error'))
    expect(screen.getByRole('button', { name: t('ui.fighterCard.retry') })).toBeInTheDocument()
  })
})
