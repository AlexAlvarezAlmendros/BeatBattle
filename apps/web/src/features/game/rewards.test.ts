import type { Me } from '@beatbattle/shared'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { EMPTY_ME_GAME } from '../../test/game'
import { useSession } from '../account/session'
import { useHud } from './hudStore'
import { achievementXp, applyGameDelta, syncGameFromMe, useGameRewards } from './rewards'

const ME: Me = {
  id: 'u1',
  email: 'aina@example.com',
  emailVerified: true,
  username: 'aina',
  displayUsername: 'Aina',
  role: 'user',
  cardNumber: 7,
  xp: 125,
  avatarUrl: null,
  game: { ...EMPTY_ME_GAME, xp: 125, unseenAchievements: [] },
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  useHud.setState({ holds: 0 })
  useHud.getState().reset()
  useSession.setState({ status: 'signedIn', me: ME })
})

afterEach(() => {
  act(() => useSession.setState({ status: 'anonymous', me: null }))
  vi.unstubAllGlobals()
})

/** Las peticiones a `POST /api/me/seen`, con su cuerpo. */
function seenRequests(): unknown[] {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith('/api/me/seen'))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
}

describe('lo ganado, de la API al HUD (tareas 7.18–7.20)', () => {
  it('RF-GAME-08: lo ganado por un voto llega a la sesión al momento; el «+XP» lleva el XP del hecho sin el del logro', () => {
    const anchor = document.createElement('div')
    document.body.append(anchor)
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 600, 200, 30))
    applyGameDelta({ xp: 30, achievements: ['first_vote'], level: 2 }, { anchor, combo: 2 })
    const { me } = useSession.getState()
    expect(me?.xp).toBe(155)
    expect(me?.game.xp).toBe(155)
    expect(me?.game.level).toBe(2)
    const hud = useHud.getState()
    expect(hud.floats).toEqual([
      expect.objectContaining({ amount: 5, anchor: { x: 40, y: 600, width: 200, height: 30 }, combo: 2 }),
    ])
    // El medidor aún no enseña ni el «+5 XP» (en vuelo) ni el logro (en cola): 30 pendientes.
    expect(achievementXp('first_vote')).toBe(25)
    expect(hud.pendingXp).toBe(30)
    expect(hud.queue.map((notice) => notice.kind)).toEqual(['achievement', 'level'])
    anchor.remove()
  })

  it('RF-GAME-08: un voto sin XP (repetido o pasado el tope) no lanza nada', () => {
    applyGameDelta({ xp: 0, achievements: [], level: 1 })
    expect(useSession.getState().me?.xp).toBe(125)
    expect(useHud.getState().floats).toEqual([])
    expect(useHud.getState().queue).toEqual([])
  })

  it('RNF-A11Y-07: la región viva dice el XP ganado', () => {
    applyGameDelta({ xp: 5, achievements: [], level: 1 })
    expect(useHud.getState().live?.text).toBe(t('game.live.xp', { amount: 5 }))
  })

  it('RF-GAME-09: lo pendiente de `me` va a la cola: los logros sin ver y el nivel sin celebrar', () => {
    syncGameFromMe({
      ...ME,
      game: {
        ...ME.game,
        xp: 500,
        level: 3,
        levelSeen: 1,
        unseenAchievements: ['first_entry', 'early_bird'],
      },
    })
    const hud = useHud.getState()
    const all = [...hud.plates, ...(hud.big ? [hud.big] : []), ...hud.queue]
    expect(all).toEqual([
      expect.objectContaining({ kind: 'achievement', id: 'first_entry', pending: 0 }),
      expect.objectContaining({ kind: 'achievement', id: 'early_bird', pending: 0 }),
      expect.objectContaining({ kind: 'level', level: 3, from: 1 }),
    ])
    // Lo de `me` ya lo enseñaba el medidor: nada pendiente.
    expect(hud.pendingXp).toBe(0)
  })

  it('RF-GAME-09: al enseñarse, el logro y el nivel se marcan vistos (POST /api/me/seen) y la sesión queda al día', async () => {
    const { unmount } = renderHook(() => useGameRewards())
    act(() =>
      useSession.setState({
        me: {
          ...ME,
          game: { ...ME.game, xp: 500, level: 3, levelSeen: 1, unseenAchievements: ['first_entry'] },
        },
      }),
    )
    await vi.waitFor(() => expect(seenRequests()).toHaveLength(2))
    expect(seenRequests()).toEqual([
      { kind: 'achievement', ref: 'first_entry' },
      { kind: 'level', ref: 3 },
    ])
    expect(useSession.getState().me?.game.levelSeen).toBe(3)
    expect(useSession.getState().me?.game.unseenAchievements).toEqual([])
    // RNF-A11Y-07: el último aviso, en la región viva.
    expect(useHud.getState().live?.text).toBe(t('game.live.levelRank', { level: 3, rank: t('rank.looper') }))
    // Otra lectura de `me` con lo mismo pendiente (el servidor aún no lo había apuntado) no lo repite.
    act(() =>
      useSession.setState({
        me: {
          ...ME,
          game: { ...ME.game, xp: 500, level: 3, levelSeen: 1, unseenAchievements: ['first_entry'] },
        },
      }),
    )
    expect(seenRequests()).toHaveLength(2)
    unmount()
  })

  it('RF-GAME-09: un voto que sube de nivel pone en cola la subida una sola vez (también al cambiar la sesión)', () => {
    const { unmount } = renderHook(() => useGameRewards())
    const release = useHud.getState().hold()
    act(() => applyGameDelta({ xp: 30, achievements: ['first_vote'], level: 2 }))
    const levels = useHud.getState().queue.filter((notice) => notice.kind === 'level')
    expect(levels).toEqual([expect.objectContaining({ level: 2, from: 1 })])
    release()
    unmount()
  })

  it('cambiar de cuenta vacía lo que estaba en vuelo y en cola', () => {
    const { unmount } = renderHook(() => useGameRewards())
    const release = useHud.getState().hold()
    act(() => applyGameDelta({ xp: 30, achievements: ['first_vote'], level: 2 }))
    act(() => useSession.setState({ status: 'anonymous', me: null }))
    expect(useHud.getState()).toMatchObject({ floats: [], queue: [], pendingXp: 0 })
    release()
    unmount()
  })
})
