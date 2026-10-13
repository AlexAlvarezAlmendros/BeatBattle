import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/*
 * Qué suena en cada pieza de la interfaz (guía §3.7, Anexo E; tarea 2.27). El motor se sustituye por uno
 * que solo anota: los niveles, el tope de frecuencia y el silencio se prueban en `engine.test.ts` y el
 * render offline, en el E2E de audio.
 */
const played = vi.hoisted(() => [] as string[])
vi.mock('./engine', () => ({ audio: { play: (id: string) => played.push(id) } }))

const { Button } = await import('../ui/Button')
const { FilterChip } = await import('../ui/Chip')
const { Tabs } = await import('../ui/Tabs')
const { Modal } = await import('../ui/Modal')
const { toast, useToasts } = await import('../ui/Toast/useToasts')
const { useRovingMenu } = await import('../ui/hooks/useRovingMenu')
const { Done, PaperNotice } = await import('../features/account/FormBits')

afterEach(() => {
  played.length = 0
  act(() => useToasts.getState().clear())
})

function Menu() {
  const menu = useRovingMenu({ count: 3, onActivate: () => {} })
  return (
    <ul {...menu.getContainerProps({ 'aria-label': 'Modos' })}>
      {['Jugar', 'Jurado', 'Ajustes'].map((label, index) => (
        <li key={label} role="none">
          <div {...menu.getItemProps<HTMLDivElement>(index)}>{label}</div>
        </li>
      ))}
    </ul>
  )
}

function ModalHost() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Ventana">
        <p>Contenido</p>
      </Modal>
    </>
  )
}

describe('efectos de la interfaz (Anexo E, tarea 2.27)', () => {
  it('RD-SND-02: un botón suena a clic al pulsarlo y a tic al pasar el ratón; deshabilitado, nada', async () => {
    render(
      <>
        <Button onClick={() => {}}>Entrar</Button>
        <Button disabled disabledReason="No se puede">
          Bloqueado
        </Button>
      </>,
    )
    fireEvent.pointerEnter(screen.getByRole('button', { name: /Entrar/ }), { pointerType: 'mouse' })
    await userEvent.click(screen.getByRole('button', { name: /Entrar/ }))
    await userEvent.click(screen.getByRole('button', { name: /Bloqueado/ }))
    // `userEvent.click` pasa el ratón por encima antes de pulsar, como en el navegador.
    expect(played).toEqual(['ui.hover', 'ui.hover', 'ui.press'])
  })

  it('RD-SND-02: un chip de filtro suena a conmutador', async () => {
    render(<FilterChip label="Solo sin votar" pressed={false} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Solo sin votar/ }))
    expect(played).toEqual(['ui.hover', 'ui.toggle'])
  })

  it('RD-SND-02: en un menú, mover el cursor da `ui.move` y elegir, `ui.press`', async () => {
    render(<Menu />)
    const items = screen.getAllByRole('menuitem')
    items[0]?.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(played).toEqual(['ui.move', 'ui.move', 'ui.press'])
  })

  it('RD-SND-02: cambiar de pestaña suena a conmutador, sin el tic del cursor', async () => {
    render(
      <Tabs
        label="Orden"
        globalKeys={false}
        tabs={[
          { id: 'a', label: 'Ronda justa', panel: <p>a</p> },
          { id: 'b', label: 'Recién subidas', panel: <p>b</p> },
        ]}
      />,
    )
    screen.getAllByRole('tab')[0]?.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(played).toEqual(['ui.toggle'])
  })

  it('RD-SND-02: una ventana suena al abrirse y al cerrarse, no al montarse cerrada', async () => {
    render(<ModalHost />)
    expect(played).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    await userEvent.keyboard('{Escape}')
    expect(played).toEqual(['ui.open', 'ui.close'])
  })

  it('RD-SND-02: los avisos suenan con su tono; el informativo y el aviso fijo, en silencio', () => {
    act(() => {
      toast.error('Algo ha fallado')
      toast.success('Hecho')
      toast.info('Sabías que…')
    })
    render(
      <>
        <PaperNotice>Ese email no parece válido.</PaperNotice>
        <PaperNotice live={false}>Borrar la cuenta no se puede deshacer.</PaperNotice>
        <Done>Guardado.</Done>
      </>,
    )
    expect(played).toEqual(['ui.error', 'ui.success', 'ui.error', 'ui.success'])
  })
})
