import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { ReportDialog } from './ReportDialog'

let fetchMock: Mock<typeof fetch>
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('denunciar (§2.7)', () => {
  it('RF-VOTE-12: con el motivo y el detalle; sin motivo no se envía', async () => {
    fetchMock.mockResolvedValue(respond({ data: { ok: true } }, 201))
    render(<ReportDialog entryId="e-1" alias="Tigre Púrpura" open onClose={() => {}} />)
    const send = screen.getByRole('button', { name: /Enviar denuncia/ })
    expect(send).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByRole('radio', { name: 'Plagio o derechos' }))
    await userEvent.type(screen.getByRole('textbox', { name: /Detalle/ }), 'Es de otro tema')
    await userEvent.click(screen.getByRole('button', { name: /Enviar denuncia/ }))
    expect(await screen.findByText('Denuncia enviada. Gracias.')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/entries/e-1/report')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      reason: 'rights',
      details: 'Es de otro tema',
    })
  })

  it('RF-VOTE-12: la segunda denuncia a la misma entrada lo dice', async () => {
    fetchMock.mockResolvedValue(respond({ error: { code: 'REPORT_EXISTS', message: 'Ya' } }, 409))
    render(<ReportDialog entryId="e-1" alias="Tigre Púrpura" open onClose={() => {}} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Spam' }))
    await userEvent.click(screen.getByRole('button', { name: /Enviar denuncia/ }))
    expect(await screen.findByText('Ya habías denunciado esta entrada.')).toBeInTheDocument()
  })
})
