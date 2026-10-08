import { afterEach, describe, expect, it, vi } from 'vitest'
import { avatarProblem, uploadAvatar } from './avatarUpload'

const PROFILE = {
  username: 'aina',
  displayUsername: 'aina',
  cardNumber: 7,
  joinedAt: 0,
  xp: 0,
  bio: null,
  city: null,
  links: {},
  accent: 'red',
  avatarUrl:
    'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_256,h_256/f_auto,q_auto/bb/avatars/u1/a',
  usernameChangeAvailableAt: null,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('subida del avatar (§4.8.2, RF-PRF-02)', () => {
  it('rechaza antes de pedir nada lo que no es PNG, JPG o WebP, o pasa de 10 MB', () => {
    expect(avatarProblem(new File(['x'], 'a.gif', { type: 'image/gif' }))).toBe('type')
    const big = new File(['x'], 'a.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 })
    expect(avatarProblem(big)).toBe('size')
    expect(avatarProblem(new File(['x'], 'a.webp', { type: 'image/webp' }))).toBeNull()
  })

  it('RF-PRF-02: firma, sube directo a Cloudinary con los campos firmados y confirma el public_id del servidor', async () => {
    const calls: { url: string; method: string; body: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push({ url, method: init?.method ?? 'GET', body: init?.body })
        if (url === '/api/uploads/sign')
          return json({
            data: {
              uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
              publicId: 'bb/avatars/u1/a',
              fields: { public_id: 'bb/avatars/u1/a', signature: 'firma', api_key: 'k', timestamp: '1' },
            },
          })
        if (url.startsWith('https://api.cloudinary.com')) return json({ public_id: 'bb/avatars/u1/a' })
        return json({ data: PROFILE })
      }),
    )
    const file = new File(['png'], 'yo.png', { type: 'image/png' })
    const profile = await uploadAvatar(file)
    expect(profile.avatarUrl).toContain('w_256,h_256')
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST /api/uploads/sign',
      'POST https://api.cloudinary.com/v1_1/demo/image/upload',
      'PUT /api/me/avatar',
    ])
    expect(JSON.parse(String(calls[0]?.body))).toEqual({ kind: 'avatar', mime: 'image/png', bytes: 3 })
    const form = calls[1]?.body as FormData
    expect(form.get('public_id')).toBe('bb/avatars/u1/a')
    expect(form.get('signature')).toBe('firma')
    expect(form.get('file')).toBeInstanceOf(File)
    expect(JSON.parse(String(calls[2]?.body))).toEqual({ publicId: 'bb/avatars/u1/a' })
  })

  it('si Cloudinary no acepta la imagen, no confirma nada', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        if (url === '/api/uploads/sign')
          return json({ data: { uploadUrl: 'https://api.cloudinary.com/x', publicId: 'p', fields: {} } })
        return json({ error: { message: 'Invalid image file' } }, 400)
      }),
    )
    await expect(uploadAvatar(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toMatchObject({
      code: 'UPLOAD_FAILED',
    })
    expect(calls).not.toContain('/api/me/avatar')
  })
})
