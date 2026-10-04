import { useQuery } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '../net/api'
import { createQueryClient, DEFAULT_QUERY_RETRIES, Providers, shouldRetryQuery } from './providers'

const networkError = () => new ApiClientError('NETWORK_ERROR', 0, 'sin red')
const serverError = () => new ApiClientError('INTERNAL', 500, 'roto')
const notFound = () => new ApiClientError('NOT_FOUND', 404, 'no existe')
const badShape = () => new ApiClientError('BAD_RESPONSE', 200, 'forma inesperada')

describe('proveedores: reintentos por defecto de las consultas', () => {
  it('el cliente usa shouldRetryQuery como retry por defecto', () => {
    expect(createQueryClient().getDefaultOptions().queries?.retry).toBe(shouldRetryQuery)
  })

  it('reintenta los fallos pasajeros (sin red, 5xx) hasta el límite', () => {
    for (const error of [networkError(), serverError()]) {
      expect(shouldRetryQuery(0, error)).toBe(true)
      expect(shouldRetryQuery(DEFAULT_QUERY_RETRIES, error)).toBe(false)
    }
  })

  it('no reintenta un 4xx, un desajuste de contrato ni un error que no es de la API', () => {
    expect(shouldRetryQuery(0, notFound())).toBe(false)
    expect(shouldRetryQuery(0, badShape())).toBe(false)
    expect(shouldRetryQuery(0, new Error('fallo de código'))).toBe(false)
  })

  it('dentro de <Providers>, un 404 falla a la primera y un 500 se repite una vez', async () => {
    const notFoundFn = vi.fn().mockRejectedValue(notFound())
    const serverFn = vi.fn().mockRejectedValue(serverError())
    function Probe() {
      const a = useQuery({ queryKey: ['a'], queryFn: notFoundFn, retryDelay: 0 })
      const b = useQuery({ queryKey: ['b'], queryFn: serverFn, retryDelay: 0 })
      return <p>{`${a.status}/${b.status}`}</p>
    }
    render(
      <Providers>
        <Probe />
      </Providers>,
    )
    await waitFor(() => expect(screen.getByText('error/error')).toBeInTheDocument())
    expect(notFoundFn).toHaveBeenCalledTimes(1)
    expect(serverFn).toHaveBeenCalledTimes(1 + DEFAULT_QUERY_RETRIES)
  })
})
