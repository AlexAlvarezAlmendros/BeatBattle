import { describe, expect, it } from 'vitest'
import { PACKAGE_STAGE } from '../src/index'

describe('@beatbattle/rules', () => {
  it('se puede importar', () => {
    expect(PACKAGE_STAGE).toBe('scaffold')
  })
})
