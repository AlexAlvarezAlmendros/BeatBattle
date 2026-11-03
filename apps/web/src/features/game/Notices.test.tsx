import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { audio } from '../../audio/engine'
import { t } from '../../i18n'
import { flash } from '../../ui/flash'
import { setSeriousMode } from '../../ui/hooks/useSeriousMode'
import { hudEffects, NOTICE_MS, useHud, useRewardsHold } from './hudStore'
import { Notices } from './Notices'

/** Testing Library normaliza los espacios del nodo (también el de no separación), no los del texto buscado. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

let play: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  play = vi.spyOn(audio, 'play').mockImplementation(() => {})
  hudEffects.onShow = () => {}
  flash.reset()
  useHud.setState({ holds: 0 })
  useHud.getState().reset()
})

afterEach(() => {
  act(() => useHud.getState().reset())
  setSeriousMode(false)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('avisos de logro y de subida de nivel (§3.8.8, tarea 7.20)', () => {
  it('RNF-A11Y-05: un logro sale como placa con su rareza en palabra, su nombre, su descripción y su XP, y suena su `ach.*`', () => {
    render(<Notices />)
    act(() =>
      useHud
        .getState()
        .notify([{ kind: 'achievement', id: 'jury_full', rarity: 'rare', xp: 75, pending: 0 }]),
    )
    expect(screen.getByText(t('achievement.jury_full.name'))).toBeInTheDocument()
    expect(screen.getByText(t('achievement.jury_full.desc'))).toBeInTheDocument()
    expect(screen.getByText(t('game.rarity.rare'))).toBeInTheDocument()
    expect(screen.getByText(plain(t('game.notice.xp', { xp: 75 })))).toBeInTheDocument()
    expect(play).toHaveBeenCalledWith('ach.rare')
  })

  it('§3.8.8: las placas se van solas a los 4 s y entra la siguiente', () => {
    vi.useFakeTimers()
    render(<Notices />)
    act(() =>
      useHud.getState().notify([
        { kind: 'achievement', id: 'first_vote', rarity: 'common', xp: 25, pending: 0 },
        { kind: 'achievement', id: 'first_drop', rarity: 'common', xp: 25, pending: 0 },
        { kind: 'achievement', id: 'first_entry', rarity: 'common', xp: 25, pending: 0 },
        { kind: 'achievement', id: 'profile_done', rarity: 'common', xp: 25, pending: 0 },
      ]),
    )
    expect(useHud.getState().plates).toHaveLength(3)
    expect(useHud.getState().queue).toHaveLength(1)
    act(() => vi.advanceTimersByTime(NOTICE_MS))
    expect(useHud.getState().plates.map((notice) => notice.kind === 'achievement' && notice.id)).toEqual([
      'profile_done',
    ])
  })

  it('RD-MOT-01: el legendario sale al centro con «¡LOGRO LEGENDARIO!» y cualquier tecla lo quita sin bloquearla', async () => {
    vi.useFakeTimers()
    render(<Notices />)
    act(() =>
      useHud
        .getState()
        .notify([{ kind: 'achievement', id: 'win_3', rarity: 'legendary', xp: 300, pending: 0 }]),
    )
    expect(screen.getByText(t('game.notice.legendary'), { selector: 'p' })).toBeInTheDocument()
    expect(play).toHaveBeenCalledWith('ach.legendary')
    // La tecla que lo provoca (el voto) no lo quita: solo las de después.
    act(() => vi.advanceTimersByTime(400))
    const key = new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true })
    act(() => {
      window.dispatchEvent(key)
    })
    expect(key.defaultPrevented).toBe(false)
    expect(useHud.getState().big).toBeNull()
  })

  it('RD-MOT-04: las chispas del legendario piden permiso al limitador; en modo serio, ni chispas ni anunciador', () => {
    const request = vi.spyOn(flash, 'request')
    const { unmount } = render(<Notices />)
    act(() =>
      useHud
        .getState()
        .notify([{ kind: 'achievement', id: 'win_3', rarity: 'legendary', xp: 300, pending: 0 }]),
    )
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ reason: 'achievement' }))
    unmount()
    act(() => useHud.getState().reset())
    request.mockClear()
    setSeriousMode(true)
    render(<Notices />)
    act(() =>
      useHud
        .getState()
        .notify([{ kind: 'achievement', id: 'season_champ', rarity: 'legendary', xp: 300, pending: 0 }]),
    )
    expect(request).not.toHaveBeenCalled()
    // La placa con todo su texto se queda (el anunciador lo quita el CSS del modo serio, `data-fx`).
    expect(screen.getByText(t('achievement.season_champ.name'))).toBeInTheDocument()
  })

  it('RF-GAME-09: la subida de nivel dice el nivel y, si cambia, el rango nuevo, con `level.up`', () => {
    render(<Notices />)
    act(() => useHud.getState().notify([{ kind: 'level', level: 9, from: 7 }]))
    expect(screen.getByText(t('game.notice.levelUp', { level: 9 }))).toBeInTheDocument()
    expect(
      screen.getByText(t('game.notice.rank', { rank: t('rank.producer').toUpperCase() }), { exact: false }),
    ).toBeInTheDocument()
    expect(play).toHaveBeenCalledWith('level.up')
  })

  it('RF-GAME-09: sin cambio de rango, el de siempre', () => {
    render(<Notices />)
    act(() => useHud.getState().notify([{ kind: 'level', level: 8, from: 7 }]))
    expect(screen.getByText(t('rank.beatmaker'))).toBeInTheDocument()
  })

  it('§3.8.8: con una capa a pantalla completa (la ceremonia) los avisos esperan y salen al cerrarse', () => {
    render(<Notices />)
    const { unmount } = renderHook(() => useRewardsHold())
    act(() => useHud.getState().notify([{ kind: 'level', level: 8, from: 7 }]))
    expect(screen.queryByText(t('game.notice.levelUp', { level: 8 }))).toBeNull()
    act(() => unmount())
    expect(screen.getByText(t('game.notice.levelUp', { level: 8 }))).toBeInTheDocument()
  })

  it('un clic quita la subida de nivel', () => {
    vi.useFakeTimers()
    render(<Notices />)
    act(() => useHud.getState().notify([{ kind: 'level', level: 8, from: 7 }]))
    act(() => vi.advanceTimersByTime(400))
    act(() => {
      fireEvent.pointerDown(window)
    })
    expect(useHud.getState().big).toBeNull()
  })
})
