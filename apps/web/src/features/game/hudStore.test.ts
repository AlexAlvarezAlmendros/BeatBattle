import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FLOAT_TIMEOUT_MS,
  hudEffects,
  MAX_PLATES,
  type NoticeInput,
  type RewardNotice,
  useHud,
} from './hudStore'

const achievement = (
  id: 'first_vote' | 'early_bird' | 'golden_ear' | 'jury_full' | 'votes_100' | 'win_3',
  rarity: 'common' | 'rare' | 'epic' | 'legendary',
  pending = 0,
): NoticeInput => ({ kind: 'achievement', id, rarity, xp: 25, pending })

let shown: RewardNotice[] = []

beforeEach(() => {
  shown = []
  hudEffects.onShow = (notice) => shown.push(notice)
  useHud.setState({ holds: 0 })
  useHud.getState().reset()
})

afterEach(() => {
  hudEffects.onShow = () => {}
  vi.useRealTimers()
})

describe('almacén hud (§4.7.2, tarea 7.18)', () => {
  it('RF-GAME-08: el «+XP» suma al XP pendiente hasta que el medidor lo traga, con su pulso', () => {
    const id = useHud
      .getState()
      .gain({ amount: 5, anchor: { x: 10, y: 20, width: 100, height: 40 }, combo: 3 })
    expect(useHud.getState().floats).toEqual([
      { id, amount: 5, anchor: { x: 10, y: 20, width: 100, height: 40 }, combo: 3 },
    ])
    expect(useHud.getState().pendingXp).toBe(5)
    useHud.getState().land(id)
    expect(useHud.getState().floats).toEqual([])
    expect(useHud.getState().pendingXp).toBe(0)
    expect(useHud.getState().landed).toBe(1)
    // Tragado ya, no se traga dos veces.
    useHud.getState().land(id)
    expect(useHud.getState().landed).toBe(1)
  })

  it('RF-GAME-08: sin XP no hay «+XP»', () => {
    expect(useHud.getState().gain({ amount: 0 })).toBe(0)
    expect(useHud.getState().floats).toEqual([])
  })

  it('RF-GAME-08: un «+XP» que no llega (la capa sin cargar) lo traga el medidor igual', () => {
    vi.useFakeTimers()
    useHud.getState().gain({ amount: 5 })
    vi.advanceTimersByTime(FLOAT_TIMEOUT_MS)
    expect(useHud.getState().floats).toEqual([])
    expect(useHud.getState().pendingXp).toBe(0)
  })

  it('§3.8.8: las placas salen de tres en tres y lo grande de uno en uno, siempre en orden', () => {
    useHud
      .getState()
      .notify([
        achievement('first_vote', 'common'),
        achievement('early_bird', 'rare'),
        achievement('golden_ear', 'epic'),
        achievement('win_3', 'legendary'),
        achievement('jury_full', 'rare'),
        { kind: 'level', level: 3, from: 2 },
      ])
    const state = useHud.getState()
    expect(state.plates.map((notice) => notice.kind === 'achievement' && notice.id)).toEqual([
      'first_vote',
      'early_bird',
      'golden_ear',
    ])
    expect(state.plates).toHaveLength(MAX_PLATES)
    expect(state.big?.kind === 'achievement' && state.big.id).toBe('win_3')
    // La placa siguiente espera a que haya sitio, y el nivel, a que se vaya lo grande.
    expect(state.queue.map((notice) => notice.kind)).toEqual(['achievement', 'level'])
    useHud.getState().dismiss(state.plates[0]?.key ?? -1)
    expect(useHud.getState().plates.map((notice) => notice.kind === 'achievement' && notice.id)).toContain(
      'jury_full',
    )
    expect(useHud.getState().big?.kind).toBe('achievement')
    useHud.getState().dismiss(useHud.getState().big?.key ?? -1)
    expect(useHud.getState().big?.kind).toBe('level')
    expect(shown.map((notice) => notice.kind)).toEqual([
      'achievement',
      'achievement',
      'achievement',
      'achievement',
      'achievement',
      'level',
    ])
  })

  it('§3.8.8: nada sale mientras un «+XP» vuela ni mientras una capa a pantalla completa tapa el marco', () => {
    const id = useHud.getState().gain({ amount: 5 })
    useHud.getState().notify([achievement('first_vote', 'common', 25)])
    expect(useHud.getState().plates).toEqual([])
    expect(useHud.getState().pendingXp).toBe(30)
    const release = useHud.getState().hold()
    useHud.getState().land(id)
    // Tragado el «+XP», pero con la ceremonia delante: espera.
    expect(useHud.getState().plates).toEqual([])
    expect(useHud.getState().pendingXp).toBe(25)
    release()
    release()
    expect(useHud.getState().holds).toBe(0)
    expect(useHud.getState().plates).toHaveLength(1)
    // Al salir el aviso, el medidor enseña su XP.
    expect(useHud.getState().pendingXp).toBe(0)
  })

  it('RF-GAME-09: un logro ya avisado en la pestaña no se repite, y dos subidas en cola son un solo aviso con el nivel nuevo', () => {
    const release = useHud.getState().hold()
    useHud.getState().notify([achievement('first_vote', 'common'), { kind: 'level', level: 3, from: 2 }])
    useHud.getState().notify([achievement('first_vote', 'common'), { kind: 'level', level: 5, from: 3 }])
    useHud.getState().notify([{ kind: 'level', level: 4, from: 3 }])
    expect(useHud.getState().queue).toEqual([
      expect.objectContaining({ kind: 'achievement', id: 'first_vote' }),
      expect.objectContaining({ kind: 'level', level: 5, from: 2 }),
    ])
    release()
    expect(useHud.getState().levelAnnounced).toBe(5)
  })

  it('al salir de la cuenta no queda nada en vuelo ni en cola (pero sigue la capa que lo retiene)', () => {
    const release = useHud.getState().hold()
    useHud.getState().gain({ amount: 5 })
    useHud.getState().notify([achievement('first_vote', 'common')])
    useHud.getState().reset()
    expect(useHud.getState()).toMatchObject({ floats: [], queue: [], pendingXp: 0, announced: [], holds: 1 })
    release()
  })
})
