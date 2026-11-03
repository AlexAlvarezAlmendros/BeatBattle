import { type AchievementId, achievementById, rankTitle, XP_ACHIEVEMENT_BY_RARITY } from '@beatbattle/rules'
import type { GameDelta, Me, SeenRequest } from '@beatbattle/shared'
import { useEffect } from 'react'
import { z } from 'zod'
import { formatNumber, t } from '../../i18n'
import { apiFetch } from '../../net/api'
import { useSession } from '../account/session'
import { type Anchor, hudEffects, type NoticeInput, type RewardNotice, useHud } from './hudStore'

/**
 * Lo ganado, de la API al HUD (guía §2.10, §3.4.1, §3.4.2, §3.8.8; tareas 7.18–7.20):
 *
 * - `applyGameDelta`: lo que dice la respuesta de un hecho (`game` del voto o de la entrada). Lo suma a la sesión al
 *   momento (el XP de verdad, el nivel), lanza el «+XP» del hecho desde donde ocurre (sin el XP de los logros, que va
 *   en su aviso) y pone en cola sus logros y la subida de nivel.
 * - `syncGameFromMe`: lo que `GET /api/me` dice pendiente al cargar (los logros cuyo aviso no ha visto y el nivel aún
 *   sin celebrar, `levelSeen`): a la cola, sin repetir lo ya avisado en la pestaña.
 * - Al enseñar un aviso, se marca visto (`POST /api/me/seen`, `RF-GAME-09`: recargar no lo repite) y se dice en la
 *   región viva (`RNF-A11Y-07`).
 */

const Nothing = z.unknown()

/** XP de un logro (por su rareza, Anexo B). */
export function achievementXp(id: AchievementId): number {
  return XP_ACHIEVEMENT_BY_RARITY[achievementById(id).rarity]
}

/** La caja de un elemento en la ventana, para que el «+XP» nazca a su lado (§3.4.2). */
export function anchorOf(element: Element | null | undefined): Anchor | null {
  if (!element?.isConnected) return null
  const box = element.getBoundingClientRect()
  if (box.width < 1 && box.height < 1) return null
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}

function achievementNotice(id: AchievementId, pending: boolean): NoticeInput {
  const { rarity } = achievementById(id)
  const xp = XP_ACHIEVEMENT_BY_RARITY[rarity]
  return { kind: 'achievement', id, rarity, xp, pending: pending ? xp : 0 }
}

/**
 * Lo ganado por un hecho (`GameDelta`): a la sesión, al «+XP» y a los avisos. `anchor` es lo que lo provoca (el
 * combo del Modo Jurado, las estrellas, la línea «+XP» de la subida); `combo`, el del Modo Jurado.
 */
export function applyGameDelta(
  delta: GameDelta,
  options: { anchor?: Element | null; combo?: number } = {},
): void {
  const me = useSession.getState().me
  if (!me) return
  const achievementsXp = delta.achievements.reduce((sum, id) => sum + achievementXp(id), 0)
  const eventXp = Math.max(0, delta.xp - achievementsXp)
  const from = me.game.level
  const level = Math.max(from, delta.level)
  // Primero el HUD (el «+XP» en vuelo y la cola) y después la sesión: así el medidor nunca enseña el XP nuevo antes
  // de tragarlo, y la sesión que cambia (`useGameRewards`) ya encuentra la subida en cola y no la repite.
  const hud = useHud.getState()
  if (eventXp > 0) {
    hud.gain({
      amount: eventXp,
      anchor: anchorOf(options.anchor),
      ...(options.combo ? { combo: options.combo } : {}),
    })
    hud.say(t('game.live.xp', { amount: formatNumber(eventXp) }))
  }
  const notices: NoticeInput[] = delta.achievements.map((id) => achievementNotice(id, true))
  if (level > from && level > me.game.levelSeen) notices.push({ kind: 'level', level, from })
  if (notices.length) hud.notify(notices)
  if (delta.xp > 0 || level !== from)
    useSession.setState((state) =>
      state.me
        ? {
            me: {
              ...state.me,
              xp: state.me.xp + delta.xp,
              game: { ...state.me.game, xp: state.me.game.xp + delta.xp, level },
            },
          }
        : state,
    )
}

/** Lo pendiente de `GET /api/me` (al cargar o al volver a pedirla): a la cola, sin repetir. */
export function syncGameFromMe(me: Me): void {
  const { game } = me
  const notices: NoticeInput[] = game.unseenAchievements.map((id) => achievementNotice(id, false))
  if (game.level > game.levelSeen) notices.push({ kind: 'level', level: game.level, from: game.levelSeen })
  if (notices.length) useHud.getState().notify(notices)
}

/** El rango de un nivel, como se dice («Beatmaker»). */
export function rankName(level: number): string {
  return t(`rank.${rankTitle(level)}`)
}

/** ¿Cambia el rango al subir de `from` a `level`? */
export function rankChanges(notice: Extract<RewardNotice, { kind: 'level' }>): boolean {
  return rankTitle(notice.level) !== rankTitle(notice.from)
}

/** Lo que dice la región viva al enseñar un aviso. */
export function noticeText(notice: RewardNotice): string {
  if (notice.kind === 'level')
    return rankChanges(notice)
      ? t('game.live.levelRank', { level: notice.level, rank: rankName(notice.level) })
      : t('game.live.level', { level: notice.level })
  return t('game.live.achievement', {
    name: t(`achievement.${notice.id}.name`),
    rarity: t(`game.rarity.${notice.rarity}`),
    xp: formatNumber(notice.xp),
  })
}

/** `POST /api/me/seen` (§4.10): el nivel celebrado o el aviso de un logro, una sola vez (`RF-GAME-09`). */
export function markSeen(request: Extract<SeenRequest, { kind: 'level' | 'achievement' }>): Promise<unknown> {
  return apiFetch('/api/me/seen', { method: 'POST', body: request, schema: Nothing })
}

/** Al enseñar un aviso: la región viva, el visto en el servidor y la sesión al día. */
function onShow(notice: RewardNotice): void {
  useHud.getState().say(noticeText(notice))
  if (!useSession.getState().me) return
  if (notice.kind === 'level') {
    useSession.setState((state) =>
      state.me
        ? {
            me: {
              ...state.me,
              game: { ...state.me.game, levelSeen: Math.max(state.me.game.levelSeen, notice.level) },
            },
          }
        : state,
    )
    markSeen({ kind: 'level', ref: notice.level }).catch((error) =>
      console.warn('No se pudo marcar el nivel como visto', error),
    )
  } else {
    useSession.setState((state) =>
      state.me
        ? {
            me: {
              ...state.me,
              game: {
                ...state.me.game,
                unseenAchievements: state.me.game.unseenAchievements.filter((id) => id !== notice.id),
              },
            },
          }
        : state,
    )
    markSeen({ kind: 'achievement', ref: notice.id }).catch((error) =>
      console.warn('No se pudo marcar el logro como visto', error),
    )
  }
}

/**
 * Engancha la capa de juego a la sesión (una vez, en el marco): lo pendiente de cada `me` que llega y, al salir de la
 * cuenta o cambiar de cuenta, nada en vuelo ni en cola.
 */
export function useGameRewards(): void {
  useEffect(() => {
    hudEffects.onShow = onShow
    const first = useSession.getState().me
    if (first) syncGameFromMe(first)
    const unsubscribe = useSession.subscribe((state, previous) => {
      if (state.me?.id !== previous.me?.id) useHud.getState().reset()
      if (state.me && state.me.game !== previous.me?.game) syncGameFromMe(state.me)
    })
    return () => {
      unsubscribe()
      hudEffects.onShow = () => {}
    }
  }, [])
}
