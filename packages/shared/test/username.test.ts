import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { RESERVED_USERNAMES, usernameCandidate, usernameProblem } from '../src/username'

describe('nombre de productor (§2.3)', () => {
  it('RF-AUTH-06: los reservados se rechazan con USERNAME_RESERVED, también con mayúsculas, puntos o guiones bajos', () => {
    expect(usernameProblem('admin')).toBe('USERNAME_RESERVED')
    expect(usernameProblem('ADMIN')).toBe('USERNAME_RESERVED')
    expect(usernameProblem('o.t.p')).toBe('USERNAME_RESERVED')
    expect(usernameProblem('beat_battle')).toBe('USERNAME_RESERVED')
    for (const name of RESERVED_USERNAMES) expect(usernameProblem(name)).toBe('USERNAME_RESERVED')
  })

  it('RF-AUTH-06: 3–20 caracteres de [a-z0-9_.]', () => {
    expect(usernameProblem('lilbru')).toBeNull()
    expect(usernameProblem('LilBru')).toBeNull()
    expect(usernameProblem('kairo.wav')).toBeNull()
    expect(usernameProblem('ab')).toBe('USERNAME_TOO_SHORT')
    expect(usernameProblem('a'.repeat(21))).toBe('USERNAME_TOO_LONG')
    expect(usernameProblem('lil bru')).toBe('INVALID_USERNAME')
    expect(usernameProblem('lil-bru')).toBe('INVALID_USERNAME')
    expect(usernameProblem('gràcia')).toBe('INVALID_USERNAME')
  })

  it('RF-AUTH-06: cualquier nombre válido sigue siéndolo en minúsculas y en mayúsculas (se compara sin distinguirlas)', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9_.]{3,20}$/), (name) => {
        expect(usernameProblem(name.toUpperCase())).toBe(usernameProblem(name))
      }),
    )
  })
})

describe('usernameCandidate (altas con Google o Discord)', () => {
  it('saca un nombre válido de un texto libre o null si no queda nada usable', () => {
    expect(usernameCandidate('Aina Puig')).toBe('aina_puig')
    expect(usernameCandidate('Ñandú Beats!!')).toBe('nandu_beats')
    expect(usernameCandidate('..kairo.wav..')).toBe('kairo.wav')
    expect(usernameCandidate('Productora Nocturna de Gràcia')).toBe('productora_nocturna')
    expect(usernameCandidate('李')).toBeNull()
    expect(usernameCandidate('ab')).toBeNull()
  })
})
