import type { Me } from '@beatbattle/shared'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_ME_GAME } from '../../test/game'
import { useSession } from '../account/session'
import { useHud } from '../game/hudStore'
import { shareStory } from './shareStory'
import type { StoryCard } from './storyCard'

// El lienzo no existe en jsdom: la tarjeta es un PNG cualquiera.
vi.mock('./storyCard', () => ({ storyPng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }))

const ME: Me = {
  id: 'u1',
  email: 'aina@example.com',
  emailVerified: true,
  username: 'aina',
  displayUsername: 'Aina',
  role: 'user',
  cardNumber: 7,
  xp: 0,
  avatarUrl: null,
  game: EMPTY_ME_GAME,
}

const CARD = { kind: 'producer', url: 'http://localhost/p/aina' } as unknown as StoryCard

let fetchMock: ReturnType<typeof vi.fn>
let clicked: string[]

beforeEach(() => {
  fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: { xp: 25, achievements: ['share_card'], level: 1 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  clicked = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this.download)
  })
  URL.createObjectURL = vi.fn(() => 'blob:tarjeta')
  URL.revokeObjectURL = vi.fn()
  useHud.getState().reset()
  useSession.setState({ status: 'signedIn', me: ME })
})

afterEach(() => {
  act(() => useSession.setState({ status: 'anonymous', me: null }))
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'canShare')
  Reflect.deleteProperty(navigator, 'share')
})

/** Los cuerpos de `POST /api/me/achievements`. */
const declared = () =>
  fetchMock.mock.calls
    .filter(([url]) => String(url) === '/api/me/achievements')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))

describe('compartir una tarjeta para stories (6.14, 7.28)', () => {
  it('RF-SHARE-03 / RF-GAME-05: sin Web Share con ficheros se descarga el PNG y se declara share_card con la tarjeta', async () => {
    expect(await shareStory({ card: CARD, fileName: 'carta.png', shared: { kind: 'producer' } })).toBe(
      'downloaded',
    )
    expect(clicked).toEqual(['carta.png'])
    expect(declared()).toEqual([{ achievement: 'share_card', card: { kind: 'producer' } }])
    // Lo ganado va a la sesión y al HUD: el aviso del logro, en placa o en cola.
    expect(useSession.getState().me?.xp).toBe(25)
    const hud = useHud.getState()
    expect([...hud.plates, ...hud.queue]).toContainEqual(
      expect.objectContaining({ kind: 'achievement', id: 'share_card' }),
    )
  })

  it('§2.10 (7.28): la de la batalla dice su entrada (el servidor apunta el logro con su semana)', async () => {
    Object.assign(navigator, { canShare: () => true, share: vi.fn(async () => {}) })
    expect(
      await shareStory({ card: CARD, fileName: 'semana.png', shared: { kind: 'battle', entryId: 'e-1' } }),
    ).toBe('shared')
    expect(navigator.share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.any(File)] }))
    expect(clicked).toEqual([])
    expect(declared()).toEqual([{ achievement: 'share_card', card: { kind: 'battle', entryId: 'e-1' } }])
  })

  it('RF-GAME-05: cancelar la hoja de compartir no es compartir: ni descarga ni logro', async () => {
    Object.assign(navigator, {
      canShare: () => true,
      share: vi.fn(async () => {
        throw new DOMException('cancelado', 'AbortError')
      }),
    })
    expect(await shareStory({ card: CARD, fileName: 'carta.png', shared: { kind: 'producer' } })).toBe(
      'cancelled',
    )
    expect(clicked).toEqual([])
    expect(declared()).toEqual([])
  })

  it('RF-SHARE-03: sin sesión se descarga igual, sin declarar nada', async () => {
    act(() => useSession.setState({ status: 'anonymous', me: null }))
    expect(await shareStory({ card: CARD, fileName: 'carta.png', shared: { kind: 'result' } })).toBe(
      'downloaded',
    )
    expect(declared()).toEqual([])
  })
})
