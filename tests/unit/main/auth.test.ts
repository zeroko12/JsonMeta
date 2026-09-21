import { describe, expect, it } from 'vitest'
import { checkPassword, checkPasswordConstantTime } from '../../../src/main/auth'

describe('auth', () => {
  it('accepts correct password', () => {
    expect(checkPassword('admin123')).toBe(true)
  })

  it('rejects wrong password', () => {
    expect(checkPassword('admin')).toBe(false)
    expect(checkPassword('admin1234')).toBe(false)
    expect(checkPassword('')).toBe(false)
  })

  it('constant-time check rejects wrong password', () => {
    expect(checkPasswordConstantTime('wrong')).toBe(false)
    expect(checkPasswordConstantTime('admin123')).toBe(true)
  })
})
