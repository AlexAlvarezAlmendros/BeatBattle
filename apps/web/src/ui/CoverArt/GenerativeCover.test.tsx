import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GenerativeCover } from './GenerativeCover'

describe('GenerativeCover (§3.4.5)', () => {
  it('es decorativa y, sin contexto 2D (jsdom), se queda con el fondo común sin romperse', () => {
    const onPainted = vi.fn()
    const { container } = render(
      <GenerativeCover seed={1234} bpm={140} musicalKey="Am" onPainted={onPainted} />,
    )
    const canvas = container.querySelector('canvas')
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    expect(onPainted).not.toHaveBeenCalled()
  })

  it('RD-VIS-04: pide el contexto 2D por CPU (willReadFrequently)', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(160)
    render(<GenerativeCover seed={1} />)
    expect(spy).toHaveBeenCalledWith('2d', { willReadFrequently: true })
    vi.restoreAllMocks()
  })
})
