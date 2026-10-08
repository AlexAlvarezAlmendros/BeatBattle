import { levelProgress, rankTitle } from '@beatbattle/rules'
import { type Me, MeSchema } from '@beatbattle/shared'
import { create } from 'zustand'
import { t } from '../../i18n'
import { ApiClientError, apiFetch } from '../../net/api'
import type { MenuPlayer } from '../week/menu/model'

/**
 * La sesión en la web (guía §4.9, tarea 2.15): quién ha entrado, para el HUD y las pantallas. Sale de
 * `GET /api/me` (la cuenta con su carta y su XP); sin sesión, `null` → visitante. Se pide una vez al cargar
 * y otra después de entrar, verificar o salir. No usa el cliente de Better Auth: así la primera pintura
 * no carga su librería (solo lo hacen las pantallas de cuenta).
 */

export type SessionStatus = 'loading' | 'anonymous' | 'signedIn'

interface SessionState {
  status: SessionStatus
  me: Me | null
  refresh(): Promise<Me | null>
  /** Sin sesión, sin pedir nada (al salir). */
  clear(): void
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  me: null,
  async refresh() {
    try {
      const me = await apiFetch('/api/me', { schema: MeSchema.nullable() })
      set(me ? { status: 'signedIn', me } : { status: 'anonymous', me: null })
      return me
    } catch (error) {
      // Sin sesión (401) o sin API: visitante. Un fallo del servidor, también (el HUD no se rompe por
      // esto), pero queda en la consola.
      if (error instanceof ApiClientError && error.status >= 500)
        console.warn('No se pudo leer la sesión', error)
      set({ status: 'anonymous', me: null })
      return null
    }
  },
  clear() {
    set({ status: 'anonymous', me: null })
  },
}))

/** Iniciales del nombre para la placa del HUD («LilBru» → «LB»; «kairo.wav» → «KW»). */
export function initialsOf(name: string): string {
  const parts = name.match(/[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? [name]
  const letters = parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]) : [name[0], name[1]]
  return letters.filter(Boolean).join('').toUpperCase()
}

/** El jugador del HUD a partir de la sesión: nombre, nivel, rango y XP (la capa de juego llega en la Fase 7). */
export function playerOf(me: Me): MenuPlayer {
  const progress = levelProgress(me.xp)
  return {
    name: me.displayUsername,
    initials: initialsOf(me.displayUsername),
    level: progress.level,
    rank: t(`rank.${rankTitle(progress.level)}`),
    xp: { value: me.xp, min: progress.levelXp, max: progress.nextLevelXp ?? progress.levelXp },
    uploaded: false,
    unvoted: 0,
  }
}
