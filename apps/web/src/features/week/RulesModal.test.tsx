import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { RulesModal } from './RulesModal'

describe('RulesModal (§2.4)', () => {
  it('RF-DROP-06: sin marcar las bases no acepta; dice qué falta y enfoca la casilla', () => {
    const onAccept = vi.fn()
    render(
      <RulesModal open weekNumber={41} busy={false} error={null} onClose={() => {}} onAccept={onAccept} />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('link', { name: new RegExp(t('pages.week.rules.full')) })).toHaveAttribute(
      'href',
      '/legal/bases',
    )
    fireEvent.click(screen.getByRole('button', { name: t('pages.week.rules.submit') }))
    expect(onAccept).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(t('pages.week.rules.required'))
    const check = screen.getByRole('button', {
      name: new RegExp(t('pages.week.rules.accept', { number: 41 })),
    })
    expect(document.activeElement).toBe(check)
    fireEvent.click(check)
    fireEvent.click(screen.getByRole('button', { name: t('pages.week.rules.submit') }))
    expect(onAccept).toHaveBeenCalledOnce()
  })
})
