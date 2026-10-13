import { markCeremonySeen } from '../../net/weeks'

/**
 * Ceremonia vista (`RF-RES-09`): con sesión, en el servidor (`seen_flag` `ceremony`, la misma en cualquier
 * dispositivo); sin sesión, en este navegador. Una vez por semana sellada, como la revelación del drop.
 */
const KEY = (slug: string) => `bb:ceremony-seen:${slug}`

export function ceremonySeenLocally(slug: string): boolean {
  try {
    return window.localStorage.getItem(KEY(slug)) === 'yes'
  } catch {
    return false
  }
}

export async function rememberCeremonySeen(slug: string, signedIn: boolean): Promise<void> {
  try {
    window.localStorage.setItem(KEY(slug), 'yes')
  } catch {
    // Sin almacenamiento (modo privado): con sesión ya queda en el servidor.
  }
  if (signedIn) await markCeremonySeen(slug).catch(() => undefined)
}
