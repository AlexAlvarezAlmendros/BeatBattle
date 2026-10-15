/**
 * El momento más enérgico de un beat (§3.8.6; tarea 6.17): la ceremonia suena 4 s de cada puesto del podio (6 s
 * del 1.º) desde ahí. Sale de la forma de onda medida de la entrada (pares mín./máx. repartidos por toda su
 * duración): la ventana de `windowMs` con más amplitud. Puro y determinista; sin onda o más corta que la
 * ventana, desde el principio.
 */
export function loudestWindowMs(
  peaks: readonly (readonly [number, number])[],
  durationMs: number,
  windowMs: number,
): number {
  if (peaks.length === 0 || durationMs <= windowMs) return 0
  const span = Math.max(1, Math.round((windowMs / durationMs) * peaks.length))
  const energy = peaks.map(([min, max]) => max - min)
  let sum = 0
  for (let i = 0; i < span; i++) sum += energy[i] ?? 0
  let best = sum
  let bestStart = 0
  for (let start = 1; start + span <= peaks.length; start++) {
    sum += (energy[start + span - 1] ?? 0) - (energy[start - 1] ?? 0)
    if (sum > best) {
      best = sum
      bestStart = start
    }
  }
  const startMs = Math.round((bestStart / peaks.length) * durationMs)
  return Math.min(startMs, durationMs - windowMs)
}
