import { describe, expect, it } from 'vitest'
import {
  assertDeletableRemotePath,
  assertSafeRemotePath,
  joinRemotePath,
  parentRemotePath,
  remoteBaseName,
  resolveRemotePath,
  sanitizeRemoteName,
} from '../src/host/path.js'

describe('remote path normalization', () => {
  it('resolves relative paths against the remote home', () => {
    expect(resolveRemotePath('www', '/home/alice')).toBe('/home/alice/www')
    expect(resolveRemotePath('./a/../b', '/home/alice')).toBe('/home/alice/b')
    expect(resolveRemotePath('', '/home/alice')).toBe('/home/alice')
  })

  it('expands tilde and preserves absolute paths', () => {
    expect(resolveRemotePath('~', '/home/alice')).toBe('/home/alice')
    expect(resolveRemotePath('~/logs', '/home/alice')).toBe('/home/alice/logs')
    expect(resolveRemotePath('/var/www', '/home/alice')).toBe('/var/www')
  })

  it('collapses traversal that escapes the root', () => {
    expect(resolveRemotePath('../../..', '/home/alice')).toBe('/')
    expect(assertSafeRemotePath('//var///www/')).toBe('/var/www')
  })

  it('rejects NUL/control characters', () => {
    expect(() => resolveRemotePath('a\u0000b', '/')).toThrow(/控制字符/)
    expect(() => assertSafeRemotePath('a\nb')).toThrow(/控制字符/)
  })

  it('validates single-segment names', () => {
    expect(sanitizeRemoteName(' docs ')).toBe('docs')
    expect(() => sanitizeRemoteName('..')).toThrow()
    expect(() => sanitizeRemoteName('a/b')).toThrow()
    expect(() => sanitizeRemoteName('a\\b')).toThrow()
    expect(() => sanitizeRemoteName('a\nb')).toThrow()
    expect(() => sanitizeRemoteName('')).toThrow()
  })

  it('joins, walks up and refuses to delete the remote root', () => {
    expect(joinRemotePath('/srv', 'app')).toBe('/srv/app')
    expect(parentRemotePath('/srv/app')).toBe('/srv')
    expect(parentRemotePath('/')).toBe('/')
    expect(remoteBaseName('/srv/app.txt')).toBe('app.txt')
    expect(() => assertDeletableRemotePath('/')).toThrow(/根目录/)
    expect(assertDeletableRemotePath('/srv/app')).toBe('/srv/app')
  })
})
