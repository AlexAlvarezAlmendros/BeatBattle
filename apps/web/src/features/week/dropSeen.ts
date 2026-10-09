import { markDropSeen } from '../../net/weeks'

/**
 * Revelación del drop vista (`RF-DROP-11`): con sesión, en el servidor (`seen_flag`, la misma en cualquier
 * dispositivo); sin sesión, en este navegador. Una vez por semana.
 */
const KEY = (slug: string) => `bb:drop-seen:${slug}`

export function seenLocally(slug: string): boolean {
  try {
    return window.localStorage.getItem(KEY(slug)) === 'yes'
  } catch {
    return false
  }
}

export async function rememberDropSeen(slug: string, signedIn: boolean): Promise<void> {
  try {
    window.localStorage.setItem(KEY(slug), 'yes')
  } catch {
    // Sin almacenamiento (modo privado): con sesión ya queda en el servidor.
  }
  if (signedIn) await markDropSeen(slug).catch(() => undefined)
}
