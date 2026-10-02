// Validación de argumentos compartida por los módulos de reglas. No se exporta desde el paquete.
// Las reglas son totales sobre su dominio y estrictas fuera de él: un argumento imposible (NaN, un
// nivel 0, una posición fraccionaria) es un fallo del llamante y lanza `RangeError` en vez de
// devolver un número que parezca válido.

/** Comprueba que `value` es un número finito. */
export function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} debe ser un número finito (recibido: ${value})`)
  }
}

/** Comprueba que `value` es un número finito y `≥ min`. */
export function assertFiniteAtLeast(value: number, min: number, name: string): void {
  assertFinite(value, name)
  if (value < min) {
    throw new RangeError(`${name} debe ser ≥ ${min} (recibido: ${value})`)
  }
}

/** Comprueba que `value` es un entero seguro dentro de `[min, max]` (ambos incluidos). */
export function assertIntegerInRange(value: number, min: number, max: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} debe ser un entero en [${min}, ${max}] (recibido: ${value})`)
  }
}
