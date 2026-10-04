import { afterEach, describe, expect, it, vi } from 'vitest'
import { IDLE_FALLBACK_MS, IDLE_TIMEOUT_MS, whenIdleAfterFirstPaint } from './afterFirstPaint'

/** `PerformanceObserver` de mentira que mide `paint` y deja emitir la FCP a mano. */
function fakePaintTiming() {
  const observers: { callback: PerformanceObserverCallback; connected: boolean }[] = []
  class FakeObserver {
    static supportedEntryTypes = ['paint']
    private entry: { callback: PerformanceObserverCallback; connected: boolean }
    constructor(callback: PerformanceObserverCallback) {
      this.entry = { callback, connected: false }
      observers.push(this.entry)
    }
    observe() {
      this.entry.connected = true
    }
    disconnect() {
      this.entry.connected = false
    }
  }
  vi.stubGlobal('PerformanceObserver', FakeObserver)
  return {
    connected: () => observers.filter((observer) => observer.connected).length,
    paint(name: string) {
      const list = { getEntriesByName: (wanted: string) => (wanted === name ? [{ name }] : []) }
      for (const observer of observers.filter((item) => item.connected))
        observer.callback(list as unknown as PerformanceObserverEntryList, {} as PerformanceObserver)
    },
  }
}

/** `requestIdleCallback` a mano. */
function fakeIdle() {
  const callbacks: { run: IdleRequestCallback; timeout?: number; cancelled: boolean }[] = []
  vi.stubGlobal('requestIdleCallback', (run: IdleRequestCallback, options?: IdleRequestOptions) => {
    callbacks.push({ run, timeout: options?.timeout, cancelled: false })
    return callbacks.length
  })
  vi.stubGlobal('cancelIdleCallback', (id: number) => {
    callbacks[id - 1]!.cancelled = true
  })
  return {
    callbacks,
    runAll: () => {
      for (const item of callbacks.filter((c) => !c.cancelled))
        item.run({ didTimeout: false, timeRemaining: () => 50 })
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('whenIdleAfterFirstPaint (§4.7.1)', () => {
  it('con Paint Timing espera a la FCP y, después, a que el navegador quede libre', () => {
    const paint = fakePaintTiming()
    const idle = fakeIdle()
    const run = vi.fn()
    whenIdleAfterFirstPaint(run)
    expect(paint.connected()).toBe(1)
    paint.paint('first-paint')
    expect(idle.callbacks).toHaveLength(0)
    paint.paint('first-contentful-paint')
    expect(paint.connected()).toBe(0)
    expect(idle.callbacks).toMatchObject([{ timeout: IDLE_TIMEOUT_MS }])
    expect(run).not.toHaveBeenCalled()
    idle.runAll()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('si la FCP ya ocurrió, solo espera a que el navegador quede libre', () => {
    fakePaintTiming()
    const idle = fakeIdle()
    vi.spyOn(performance, 'getEntriesByName').mockImplementation((name) =>
      name === 'first-contentful-paint' ? [{ name } as PerformanceEntry] : [],
    )
    const run = vi.fn()
    whenIdleAfterFirstPaint(run)
    expect(idle.callbacks).toHaveLength(1)
    idle.runAll()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('sin Paint Timing ni requestIdleCallback: tras el fotograma siguiente y la espera fija', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    vi.stubGlobal('PerformanceObserver', undefined)
    vi.stubGlobal('requestIdleCallback', undefined)
    const run = vi.fn()
    whenIdleAfterFirstPaint(run)
    vi.advanceTimersByTime(IDLE_FALLBACK_MS * 2)
    // Sin fotograma todavía, nada: la espera fija cuenta desde la pintura.
    expect(run).not.toHaveBeenCalled()
    frames[0]!(0)
    vi.advanceTimersByTime(IDLE_FALLBACK_MS - 1)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('se cancela en cualquier fase: esperando la FCP o el rato libre', () => {
    const paint = fakePaintTiming()
    const idle = fakeIdle()
    const run = vi.fn()
    whenIdleAfterFirstPaint(run)()
    expect(paint.connected()).toBe(0)

    const cancel = whenIdleAfterFirstPaint(run)
    paint.paint('first-contentful-paint')
    cancel()
    idle.runAll()
    expect(run).not.toHaveBeenCalled()
  })
})
