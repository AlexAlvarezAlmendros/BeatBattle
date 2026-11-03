import type { PublicProfile } from '@beatbattle/shared'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { useStageQuality } from '../../stage/quality'
import { setStageRunning, setViewLive, useStageRuntime } from '../../stage/runtime'
import { EMPTY_PROFILE_GAME } from '../../test/game'
import { type MatchMediaController, mockMatchMedia } from '../../ui/hooks/mockMatchMedia'
import { REDUCED_MOTION_QUERY } from '../../ui/hooks/useReducedMotion'
import { setSeriousMode } from '../../ui/hooks/useSeriousMode'
import { PASS_OVERRIDE_KEY, ProfileCard, TWO_COLUMNS_QUERY } from './ProfileCard'

const PROFILE: PublicProfile = {
  username: 'kairo.wav',
  displayUsername: 'Kairo.wav',
  cardNumber: 42,
  joinedAt: Date.UTC(2026, 2, 10),
  xp: 0,
  bio: null,
  city: null,
  links: {},
  accent: 'red',
  avatarUrl: null,
  game: EMPTY_PROFILE_GAME,
}

let media: MatchMediaController | undefined

function slot() {
  return document.querySelector('[data-producer-card]')?.parentElement as HTMLElement
}

afterEach(() => {
  window.localStorage.removeItem(PASS_OVERRIDE_KEY)
  media?.restore()
  media = undefined
  setSeriousMode(false)
  setStageRunning(false)
  useStageRuntime.setState({ pass: null })
  useStageQuality.setState({ quality: null, source: null })
})

describe('la carta del perfil y su pase (§3.4.4, tarea 7.23)', () => {
  it('RF-GAME-07: en dos columnas y con el Escenario, la carta registra su pase y reserva su hueco', () => {
    media = mockMatchMedia({ [TWO_COLUMNS_QUERY]: true })
    useStageQuality.setState({ quality: 'alta', source: 'manual' })
    render(<ProfileCard profile={PROFILE} />)
    expect(slot()).toHaveAttribute('data-pass-room')
    const pass = useStageRuntime.getState().pass
    expect(pass?.face.front.name).toBe('Kairo.wav')
    expect(pass?.face.front.variant).toBe('standard')
    expect(pass?.side).toBe('front')
    expect(pass?.card).toBe(document.querySelector('[data-producer-card]'))
    // Hasta que el Escenario la pinta, se ve la plana.
    expect(slot()).not.toHaveAttribute('data-pass-live')
  })

  it('RF-GAME-07: cuando el Escenario pinta el pase, la plana se queda para el lector y C gira las dos', async () => {
    media = mockMatchMedia({ [TWO_COLUMNS_QUERY]: true })
    useStageQuality.setState({ quality: 'media', source: 'manual' })
    render(<ProfileCard profile={PROFILE} />)
    const id = useStageRuntime.getState().pass?.id as number
    act(() => {
      setStageRunning(true)
      setViewLive(id, true)
    })
    expect(slot()).toHaveAttribute('data-pass-live')
    // La plana sigue en el árbol accesible con su nombre.
    expect(screen.getByRole('article', { name: /Kairo\.wav, número 42/ })).toBeInTheDocument()
    await userEvent.keyboard('c')
    expect(useStageRuntime.getState().pass?.side).toBe('back')
    expect(document.querySelector('[data-producer-card]')).toHaveAttribute('data-side', 'back')
  })

  it('RF-GAME-07: `bb:pass` = `on` cuelga el pase también en una columna (para mirar el móvil), no con «reducir movimiento»', () => {
    window.localStorage.setItem(PASS_OVERRIDE_KEY, 'on')
    useStageQuality.setState({ quality: 'alta', source: 'manual' })
    media = mockMatchMedia({})
    const { unmount } = render(<ProfileCard profile={PROFILE} />)
    expect(slot()).toHaveAttribute('data-pass-room')
    unmount()
    media.restore()
    media = mockMatchMedia({ [REDUCED_MOTION_QUERY]: true })
    render(<ProfileCard profile={PROFILE} />)
    expect(slot()).not.toHaveAttribute('data-pass-room')
  })

  it.each([
    ['con «reducir movimiento»', { [TWO_COLUMNS_QUERY]: true, [REDUCED_MOTION_QUERY]: true }, 'alta', false],
    ['con la calidad apagada', { [TWO_COLUMNS_QUERY]: true }, 'apagada', false],
    ['con la calidad baja (el 3D, solo en las ceremonias)', { [TWO_COLUMNS_QUERY]: true }, 'baja', false],
    ['en una columna (la diagonal cruza la pieza)', {}, 'alta', false],
    ['en contraste alto', { [TWO_COLUMNS_QUERY]: true, '(forced-colors: active)': true }, 'alta', false],
    ['en modo serio', { [TWO_COLUMNS_QUERY]: true }, 'alta', true],
  ] as const)('RF-GAME-07: %s, la carta plana y sin pase', (_name, queries, quality, serious) => {
    media = mockMatchMedia(queries)
    setSeriousMode(serious)
    useStageQuality.setState({ quality, source: 'manual' })
    render(<ProfileCard profile={PROFILE} />)
    expect(slot()).not.toHaveAttribute('data-pass-room')
    expect(document.querySelector('[data-pass-view]')).toBeNull()
    expect(useStageRuntime.getState().pass).toBeNull()
    expect(screen.getByRole('article', { name: /Kairo\.wav, número 42/ })).toBeVisible()
  })
})
