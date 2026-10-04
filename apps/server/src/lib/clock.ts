/**
 * Reloj inyectable (guía §4.12). Los instantes son ms Unix (UTC). Ninguna lógica del servidor llama
 * a `Date.now()`: en una petición se usa `request.now` (lo fija `plugins/clock.ts`) y fuera de ellas
 * (arranque, tareas) el `Clock` que recibe `buildApp`.
 */
export interface Clock {
  now(): number
}

export const systemClock: Clock = { now: () => Date.now() }

/** Reloj fijo para tests: no avanza solo; se mueve con `set` y `advance`. */
export interface FixedClock extends Clock {
  set(ms: number): void
  advance(ms: number): void
}

export function fixedClock(start: number): FixedClock {
  assertInstant(start)
  let t = start
  return {
    now: () => t,
    set(ms) {
      assertInstant(ms)
      t = ms
    },
    advance(ms) {
      assertInstant(t + ms)
      t += ms
    },
  }
}

function assertInstant(ms: number): void {
  if (!Number.isSafeInteger(ms) || ms < 0) throw new RangeError('El instante debe ser un entero de ms ≥ 0')
}

/** Cabecera del reloj de prueba. Solo se lee con `BB_TEST_CLOCK=1` (nunca en producción). */
export const TEST_NOW_HEADER = 'x-bb-test-now'

// ISO 8601 con zona explícita (Z u offset): sin zona, `Date.parse` usaría la del proceso.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/

/**
 * Interpreta el valor de `x-bb-test-now`: ms Unix (`1790000000000`) o ISO 8601 con zona
 * (`2026-10-05T00:00:00+02:00`). Devuelve `null` si no es ninguno de los dos.
 */
export function parseTestNow(value: string): number | null {
  const v = value.trim()
  if (/^\d+$/.test(v)) {
    const ms = Number(v)
    return Number.isSafeInteger(ms) ? ms : null
  }
  if (!ISO_INSTANT.test(v)) return null
  const ms = Date.parse(v)
  return Number.isNaN(ms) || ms < 0 ? null : ms
}
