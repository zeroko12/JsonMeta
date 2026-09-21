import { describe, expect, it, vi } from 'vitest'

vi.mock('ps-list', () => ({
  default: vi.fn(async () => [
    { pid: 1, name: 'IonImplantationSystem.exe' },
    { pid: 2, name: 'notepad.exe' },
  ]),
}))

describe('detectMainProgram', () => {
  it('returns running=true and matched pids when target process is present', async () => {
    const { detectMainProgram } = await import('../../../src/main/ipc/process')
    const result = await detectMainProgram()
    expect(result.running).toBe(true)
    expect(result.pids).toContain(1)
    expect(result.matchedNames).toContain('IonImplantationSystem.exe')
  })

  it('returns running=false when no match', async () => {
    vi.doMock('ps-list', () => ({
      default: vi.fn(async () => [{ pid: 99, name: 'unrelated.exe' }]),
    }))
    // Re-import won't pick up the new mock, so we just call with a strict pattern
    const { detectMainProgram } = await import('../../../src/main/ipc/process')
    const result = await detectMainProgram([/nonexistent-pattern/i])
    expect(result.running).toBe(false)
    expect(result.pids).toEqual([])
  })
})
