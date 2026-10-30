import { describe, expect, it } from 'vitest'
import { decideHostKey, normalizeFingerprint } from '../src/host/protocols/host-key.js'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

describe('SFTP host key policy', () => {
  it('accepts an already pinned key without a prompt', () => {
    const decision = decideHostKey(A, { knownFingerprint: A })
    expect(decision.accepted).toBe(true)
    expect(decision.fingerprint).toBe(A)
  })

  it('refuses an unknown key without explicit trust', () => {
    const decision = decideHostKey(A, {})
    expect(decision.accepted).toBe(false)
    expect(decision.error?.code).toBe('unknown_host_key')
    expect((decision.error?.details as { fingerprint?: string })?.fingerprint).toBe(A)
  })

  it('accepts an unknown key only when the trusted fingerprint matches', () => {
    expect(decideHostKey(A, { trust: true, expectedFingerprint: A }).accepted).toBe(true)
    expect(decideHostKey(A, { trust: true, expectedFingerprint: B }).accepted).toBe(false)
  })

  it('never accepts a changed key without explicit change acceptance', () => {
    const blocked = decideHostKey(B, { knownFingerprint: A, trust: true, expectedFingerprint: B })
    expect(blocked.accepted).toBe(false)
    expect(blocked.error?.code).toBe('host_key_changed')

    const accepted = decideHostKey(B, {
      knownFingerprint: A,
      trust: true,
      expectedFingerprint: B,
      acceptChanged: true,
    })
    expect(accepted.accepted).toBe(true)
  })

  it('rejects malformed fingerprints and normalizes the SHA256 prefix', () => {
    expect(normalizeFingerprint('SHA256:' + A)).toBe(A)
    expect(decideHostKey('garbage', {}).accepted).toBe(false)
    expect(decideHostKey('garbage', {}).error?.code).toBe('internal')
  })
})
