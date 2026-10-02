import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  detectGlassCapability,
  type GlassEnvironment,
  isLowEndDevice,
  prefersReducedMotion,
  resetGlassCapabilityCache,
  useGlassCapability,
  useReducedMotion,
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

/** `matchMedia` falso: jsdom no lo trae. `matching` son las consultas que casan. */
function stubMatchMedia(matching: string[]) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: matching.includes(query),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
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

describe('glass: «reducir movimiento» (sistema o ajuste de la app)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.motion
    vi.unstubAllGlobals()
  })

  it('RNF-A11Y-08: el ajuste de la app (html[data-motion="reduced"]) cuenta igual que el del sistema', () => {
    expect(prefersReducedMotion()).toBe(false)
    document.documentElement.dataset.motion = 'reduced'
    expect(prefersReducedMotion()).toBe(true)
  })

  it('RNF-A11Y-03: la preferencia del sistema (prefers-reduced-motion) también', () => {
    stubMatchMedia(['(prefers-reduced-motion: reduce)'])
    expect(prefersReducedMotion()).toBe(true)
  })

  it('el hook se actualiza en caliente al cambiar el ajuste de la app', async () => {
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
    await act(async () => {
      document.documentElement.dataset.motion = 'reduced'
    })
    await vi.waitFor(() => expect(result.current).toBe(true))
    await act(async () => {
      delete document.documentElement.dataset.motion
    })
    await vi.waitFor(() => expect(result.current).toBe(false))
  })
})
