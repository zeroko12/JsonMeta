/**
 * Authentication for the configuration tool.
 *
 * Hardcoded password per task brief. Not user authentication; this is a
 * trivial gate to prevent casual use. Replace with a proper auth flow if
 * the deployment requires it.
 */

const HARDCODED_PASSWORD = 'admin123'

/** Returns true if the supplied password matches. */
export function checkPassword(input: string): boolean {
  return input === HARDCODED_PASSWORD
}

/** Constant-time comparison to avoid trivial timing leaks. */
export function checkPasswordConstantTime(input: string): boolean {
  const expected = HARDCODED_PASSWORD
  if (input.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < input.length; i++) {
    mismatch |= input.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}
