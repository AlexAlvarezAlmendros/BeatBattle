import { render, screen, waitFor, within } from '@testing-library/react'
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

/** Un modal que abre otro encima (el de arriba es hijo del de abajo en el árbol de React). */
function StackHarness() {
  const [base, setBase] = useState(false)
  const [top, setTop] = useState(false)
  return (
    <>
      <Button onClick={() => setBase(true)}>Abrir</Button>
      <Modal open={base} onClose={() => setBase(false)} title="Base">
        <Button onClick={() => setTop(true)}>Abrir encima</Button>
        <Modal open={top} onClose={() => setTop(false)} title="Encima" footer={<Button>Vale</Button>} />
      </Modal>
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
    // El bloqueo se quita en el mismo commit en el que empieza a cerrarse (efecto de diseño), no
    // en un efecto pasivo posterior a la retirada del DOM.
    expect(document.body.style.overflow).toBe('')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.body.style.overflow).toBe(''))

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

  it('RNF-A11Y-01: modales apilados — solo el de arriba atrapa el foco y Esc; al cerrarlo manda el de abajo', async () => {
    const user = userEvent.setup()
    render(<StackHarness />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    const base = await screen.findByRole('dialog', { name: 'Base' })
    const openTop = within(base).getByRole('button', { name: 'Abrir encima' })
    await user.click(openTop)
    const top = await screen.findByRole('dialog', { name: 'Encima' })
    expect(top).toHaveFocus()

    // Tab da la vuelta dentro del de arriba sin que el de abajo se lleve el foco.
    const topButtons = within(top).getAllByRole('button')
    for (let i = 0; i < topButtons.length + 1; i++) {
      await user.tab()
      expect(top.contains(document.activeElement)).toBe(true)
    }
    // Un foco que se escapa vuelve al de arriba, no al de abajo (y no hay un tira y afloja infinito).
    openTop.focus()
    expect(top).toHaveFocus()

    // Esc cierra solo el de arriba; el foco vuelve a su botón y el de abajo recupera el control.
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Encima' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Base' })).toBeInTheDocument()
    expect(openTop).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    await user.tab()
    expect(base.contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.style.overflow).toBe('')
  })

  it('ModalSurface se pinta quieta (galería), sin rol de diálogo', () => {
    render(<ModalSurface title="Vista previa" description="Sin comportamiento" titleAs="h3" />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: 'Vista previa' })).toBeInTheDocument()
  })
})
