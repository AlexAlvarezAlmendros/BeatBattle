import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  detectGlassCapability,
  type GlassEnvironment,
  GlassProvider,
  isLowEndDevice,
  resetGlassCapabilityCache,
  useGlassCapability,
} from './index'

const CHROME =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'

const capable: GlassEnvironment = {
  deviceMemory: 8,
  hardwareConcurrency: 8,
  saveData: false,
  reducedMotion: false,
  reducedTransparency: false,
  userAgent: CHROME,
  supportsSvgBackdrop: true,
}

describe('glass: detección de capacidad (useGlassCapability del sello)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.motion
    vi.unstubAllGlobals()
    resetGlassCapabilityCache()
  })

  it('un Chromium capaz pinta el cristal', () => {
    expect(detectGlassCapability(capable)).toBe(true)
  })

  it.each([
    ['poca memoria', { deviceMemory: 2 }],
    ['pocos núcleos', { hardwareConcurrency: 2 }],
    ['ahorro de datos', { saveData: true }],
  ])('equipo modesto (%s): sin cristal', (_, patch) => {
    expect(isLowEndDevice({ ...capable, ...patch })).toBe(true)
    expect(detectGlassCapability({ ...capable, ...patch })).toBe(false)
  })

  it('RNF-A11Y-03: con «reducir movimiento» o «reducir transparencia», sin cristal', () => {
    expect(detectGlassCapability({ ...capable, reducedMotion: true })).toBe(false)
    expect(detectGlassCapability({ ...capable, reducedTransparency: true })).toBe(false)
  })

  it('Safari y Firefox no aplican backdrop-filter: url(#…); tampoco sin soporte', () => {
    expect(detectGlassCapability({ ...capable, userAgent: SAFARI })).toBe(false)
    expect(detectGlassCapability({ ...capable, userAgent: FIREFOX })).toBe(false)
    expect(detectGlassCapability({ ...capable, supportsSvgBackdrop: false })).toBe(false)
  })

  it('sin datos de hardware (navegadores que no los dan) no se da por modesto', () => {
    expect(isLowEndDevice({})).toBe(false)
  })

  it('el hook mira el soporte real de backdrop-filter: url(#…) del navegador', () => {
    vi.stubGlobal('CSS', { supports: () => false })
    expect(renderHook(() => useGlassCapability()).result.current).toBe(false)
    resetGlassCapabilityCache()
    vi.stubGlobal('CSS', { supports: (property: string) => property === 'backdrop-filter' })
    expect(renderHook(() => useGlassCapability()).result.current).toBe(true)
  })

  it('RNF-A11Y-03: el hook se apaga en caliente con «reducir movimiento» aunque el equipo sea capaz', async () => {
    vi.stubGlobal('CSS', { supports: () => true })
    const { result } = renderHook(() => useGlassCapability())
    expect(result.current).toBe(true)
    await act(async () => {
      document.documentElement.dataset.motion = 'reduced'
    })
    await vi.waitFor(() => expect(result.current).toBe(false))
  })
})

describe('glass: GlassProvider (calidad baja y galería)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetGlassCapabilityCache()
  })

  it('RNF-A11Y-03: un proveedor apagado fuerza la alternativa aunque el equipo sea capaz', () => {
    vi.stubGlobal('CSS', { supports: () => true })
    const off = ({ children }: { children: ReactNode }) => (
      <GlassProvider enabled={false}>{children}</GlassProvider>
    )
    const on = ({ children }: { children: ReactNode }) => <GlassProvider enabled>{children}</GlassProvider>
    expect(renderHook(() => useGlassCapability(), { wrapper: on }).result.current).toBe(true)
    expect(renderHook(() => useGlassCapability(), { wrapper: off }).result.current).toBe(false)
  })

  it('un proveedor encendido dentro de uno apagado no vuelve a encender el cristal', () => {
    vi.stubGlobal('CSS', { supports: () => true })
    const nested = ({ children }: { children: ReactNode }) => (
      <GlassProvider enabled={false}>
        <GlassProvider enabled>{children}</GlassProvider>
      </GlassProvider>
    )
    expect(renderHook(() => useGlassCapability(), { wrapper: nested }).result.current).toBe(false)
  })
})
