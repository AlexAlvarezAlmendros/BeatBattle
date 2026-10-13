import { createHmac } from 'node:crypto'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Lo que se guarda una señal de IP (`ip_signal`, §4.11): 7 días; la purga la tarea `cleanup` del `tick`. */
export const IP_SIGNAL_RETENTION_MS = WEEK_MS

/**
 * Hash de una IP con sal rotatoria semanal (guía §4.14): sirve contra el abuso dentro de la semana y deja
 * de poder relacionarse después. Nunca se guarda la IP en claro.
 */
export function ipHash(ip: string | null | undefined, secret: string, now: number): string | null {
  if (!ip) return null
  const week = Math.floor(now / WEEK_MS)
  return createHmac('sha256', secret).update(`${week}|${ip}`).digest('hex').slice(0, 32)
}
