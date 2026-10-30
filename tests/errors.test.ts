import { describe, expect, it } from 'vitest'
import { mapError, RemoteError, sanitizeMessage } from '../src/host/errors.js'

describe('error mapping', () => {
  it('keeps intentional RemoteErrors', () => {
    const error = new RemoteError('conflict', 'already there')
    expect(mapError(error)).toBe(error)
  })

  it('maps sftp status codes', () => {
    expect(mapError({ code: 2, message: 'no such file' }).code).toBe('not_found')
    expect(mapError({ code: 3, message: 'permission denied' }).code).toBe('permission_denied')
    expect(mapError({ code: 4, message: 'failure' }).code).toBe('internal')
  })

  it('maps network and TLS errors', () => {
    expect(mapError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND x' }).code).toBe('connection_failed')
    expect(mapError({ code: 'ECONNREFUSED', message: 'refused' }).code).toBe('connection_failed')
    expect(mapError({ code: 'ETIMEDOUT', message: 'timed out' }).code).toBe('timeout')
    expect(mapError({ code: 'ERR_TLS_CERT_ALTNAME_INVALID', message: 'cert' }).code).toBe('tls_error')
  })

  it('maps authentication and FTP replies', () => {
    expect(mapError({ level: 'client-authentication', message: 'All configured authentication methods failed' }).code)
      .toBe('auth_failed')
    expect(mapError({ code: 530, message: 'Login incorrect' }).code).toBe('auth_failed')
    expect(mapError({ code: 550, message: 'not found' }).code).toBe('permission_denied')
  })

  it('redacts password-like fragments', () => {
    expect(sanitizeMessage('login failed password=hunter2')).not.toContain('hunter2')
    expect(sanitizeMessage('line one\nline two')).toBe('line one line two')
  })
})
