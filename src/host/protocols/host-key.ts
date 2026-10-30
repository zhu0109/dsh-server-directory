import { remoteError, type RemoteError } from '../errors.js'
import type { HostKeyPolicy } from './types.js'

export function normalizeFingerprint(value: unknown): string {
  return String(value ?? '').trim().replace(/^SHA256:/i, '').toLowerCase()
}

export interface HostKeyDecision {
  fingerprint: string
  accepted: boolean
  error?: RemoteError
}

/**
 * Pure SFTP host-key policy:
 * - known + matching => accept without prompting;
 * - unknown => accept only with explicit trust AND the fingerprint the user saw;
 * - changed => additionally require explicit acceptance of the change.
 *
 * The expected fingerprint comparison closes the TOCTOU window between the
 * prompt and the second connection attempt.
 */
export function decideHostKey(hashedKey: unknown, policy: HostKeyPolicy): HostKeyDecision {
  const actual = normalizeFingerprint(hashedKey)
  if (!/^[a-f0-9]{64}$/.test(actual)) {
    return {
      fingerprint: actual,
      accepted: false,
      error: remoteError('internal', '服务器返回了无法识别的主机密钥指纹。'),
    }
  }
  const known = policy.knownFingerprint ? normalizeFingerprint(policy.knownFingerprint) : ''
  const expected = policy.expectedFingerprint ? normalizeFingerprint(policy.expectedFingerprint) : ''

  if (known === '') {
    if (policy.trust && expected === actual) return { fingerprint: actual, accepted: true }
    return {
      fingerprint: actual,
      accepted: false,
      error: remoteError('unknown_host_key', '首次连接该服务器，需要确认主机指纹。', {
        fingerprint: actual,
        algorithm: 'SHA256',
      }),
    }
  }
  if (known === actual) return { fingerprint: actual, accepted: true }
  if (policy.trust && policy.acceptChanged && expected === actual) {
    return { fingerprint: actual, accepted: true }
  }
  return {
    fingerprint: actual,
    accepted: false,
    error: remoteError('host_key_changed', '服务器主机密钥已变化，必须明确确认新指纹后才能连接。', {
      fingerprint: actual,
      previous: known,
      algorithm: 'SHA256',
    }),
  }
}
