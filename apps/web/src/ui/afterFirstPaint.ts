/**
 * Programar trabajo que no debe competir con la primera pintura (guía §4.7.1): trozos diferidos que
 * se piden en cuanto la página ya se ve y el navegador queda libre.
 */

/** Espera máxima de `requestIdleCallback` una vez pintada la página, en ms. */
export const IDLE_TIMEOUT_MS = 3000

/** Sin `requestIdleCallback` (Safari): espera fija tras la primera pintura, en ms. */
export const IDLE_FALLBACK_MS = 2000

const FCP = 'first-contentful-paint'

/** `run` después de pintar el fotograma en curso: un `setTimeout` lanzado desde `requestAnimationFrame` corre tras la pintura. */
function afterNextPaint(run: () => void): () => void {
  let cancel = () => {}
  const frame = requestAnimationFrame(() => {
    const timer = setTimeout(run, 0)
    cancel = () => clearTimeout(timer)
  })
  return () => {
    cancelAnimationFrame(frame)
    cancel()
  }
}

/** `run` cuando el navegador queda libre (o a los `IDLE_FALLBACK_MS` sin `requestIdleCallback`). */
function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => run(), { timeout: IDLE_TIMEOUT_MS })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(run, IDLE_FALLBACK_MS)
  return () => clearTimeout(id)
}

/** ¿Mide el navegador la primera pintura con contenido (Paint Timing)? */
function measuresPaint(): boolean {
  return (
    typeof PerformanceObserver !== 'undefined' &&
    (PerformanceObserver.supportedEntryTypes ?? []).includes('paint')
  )
}

/**
 * Ejecuta `run` cuando la página ya se ha pintado con contenido (FCP) y el navegador está libre.
 *
 * - Con Paint Timing, espera a la entrada `first-contentful-paint` (si ya está, no espera): el primer
 *   fotograma puede salir sin texto todavía (la fuente en su periodo de bloqueo, el hero en su entrada).
 * - Sin él, al fotograma siguiente.
 * - En una pestaña oculta no hay FCP: no corre hasta que la página se pinte. Quien necesite el trozo
 *   antes (un aviso que llega) lo pide en ese momento.
 *
 * Devuelve la cancelación.
 */
export function whenIdleAfterFirstPaint(run: () => void): () => void {
  let cancel = () => {}
  const next = () => {
    cancel = whenIdle(run)
  }
  if (!measuresPaint()) {
    cancel = afterNextPaint(next)
  } else if (performance.getEntriesByName(FCP).length > 0) {
    next()
  } else {
    const observer = new PerformanceObserver((list) => {
      if (list.getEntriesByName(FCP).length === 0) return
      observer.disconnect()
      next()
    })
    observer.observe({ type: 'paint', buffered: true })
    cancel = () => observer.disconnect()
  }
  return () => cancel()
}
