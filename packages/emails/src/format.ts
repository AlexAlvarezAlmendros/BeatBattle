/** Fecha y hora de Madrid para los emails («8 de octubre de 2026, 13:20»). */
export function madridDateTime(ms: number): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ms)
}

/** Número de carta con cuatro cifras («#0042»). */
export const cardNumber = (n: number) => `#${String(n).padStart(4, '0')}`
