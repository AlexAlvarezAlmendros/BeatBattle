import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { type MatchMediaController, mockMatchMedia } from '../../hooks/mockMatchMedia'
import { REDUCED_MOTION_QUERY } from '../../hooks/useReducedMotion'
import { t } from '../../i18n'
import { Button } from '../Button'
import { Modal, ModalSurface } from './Modal'

function Harness({ dismissible = true }: { dismissible?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir</Button>
      <p>Contenido de la página</p>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Entra y vota"
        description="Tu voto queda guardado."
        dismissible={dismissible}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Ahora no
            </Button>
            <Button>Entrar</Button>
          </>
        }
      />
    </>
  )
}

let media: MatchMediaController | undefined
afterEach(() => {
  media?.restore()
  media = undefined
})

async function openModal() {
  const user = userEvent.setup()
  render(<Harness />)
  const trigger = screen.getByRole('button', { name: 'Abrir' })
  await user.click(trigger)
  const dialog = await screen.findByRole('dialog', { name: 'Entra y vota' })
  return { user, trigger, dialog }
}

describe('Modal', () => {
  it('es un diálogo modal con título y descripción, en un portal fuera de la página', async () => {
    const { dialog } = await openModal()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Tu voto queda guardado.')
    expect(dialog.closest('[data-modal-scrim]')?.parentElement).toBe(document.body)
    expect(dialog).toHaveFocus()
  })

  it('RNF-A11Y-01: el foco queda atrapado dentro con Tab y Mayús+Tab', async () => {
    const { user } = await openModal()
    const close = screen.getByRole('button', { name: t('ui.modal.close') })
    const later = screen.getByRole('button', { name: 'Ahora no' })
    const enter = screen.getByRole('button', { name: 'Entrar' })
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab()
    expect(later).toHaveFocus()
    await user.tab()
    expect(enter).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(enter).toHaveFocus()
  })

  it('RNF-A11Y-01: Esc cierra y el foco vuelve al botón que lo abrió', async () => {
    const { user, trigger } = await openModal()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it('el botón de cerrar y el fondo cierran; el scroll de la página se bloquea mientras tanto', async () => {
    const { user } = await openModal()
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(screen.getByRole('button', { name: t('ui.modal.close') }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.style.overflow).toBe('')

    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    const dialog = await screen.findByRole('dialog')
    await user.pointer({ keys: '[MouseLeft]', target: dialog.closest('[data-modal-scrim]')! })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('con dismissible={false} el fondo no cierra', async () => {
    const user = userEvent.setup()
    render(<Harness dismissible={false} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    const dialog = await screen.findByRole('dialog')
    await user.pointer({ keys: '[MouseLeft]', target: dialog.closest('[data-modal-scrim]')! })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('RNF-A11Y-03 / RD-MOT-03: con «reducir movimiento» entra sin escala, solo con fundido', async () => {
    media = mockMatchMedia({ [REDUCED_MOTION_QUERY]: true })
    const { dialog } = await openModal()
    const frame = dialog.parentElement!
    await waitFor(() => expect(frame.style.opacity).toBe('1'))
    expect(frame.style.transform).not.toMatch(/scale\(0\.96\)/)
  })

  it('ModalSurface se pinta quieta (galería), sin rol de diálogo', () => {
    render(<ModalSurface title="Vista previa" description="Sin comportamiento" titleAs="h3" />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: 'Vista previa' })).toBeInTheDocument()
  })
})
