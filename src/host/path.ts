/**
 * Remote paths are always POSIX paths, independent of the Windows host that
 * runs DSH. Every path from the browser passes through these helpers before
 * it reaches an SFTP/FTP adapter.
 */
import { posix } from 'node:path'
import { remoteError } from './errors.js'

const CONTROL_CHARS = /[\u0000-\u0008\u000a-\u001f\u007f]/u

function normalizeAbsolute(path: string): string {
  if (path === '' || path === '.') return '/'
  let normalized = posix.normalize(path)
  if (!normalized.startsWith('/')) normalized = `/${normalized}`
  if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1)
  return normalized || '/'
}

/**
 * Resolve a user-entered path against the remote home directory.
 * Supports absolute paths, relative paths and `~`/`~/...`.
 */
export function resolveRemotePath(input: string | undefined | null, home: string): string {
  const rawHome = normalizeAbsolute(home || '/')
  let value = typeof input === 'string' ? input.trim() : ''
  if (value === '') value = rawHome
  if (CONTROL_CHARS.test(value)) throw remoteError('bad_request', '路径包含非法控制字符。')

  if (value === '~') return rawHome
  if (value.startsWith('~/')) value = posix.join(rawHome, value.slice(2))
  else if (!value.startsWith('/')) value = posix.join(rawHome, value)
  return normalizeAbsolute(value)
}

/** Make sure a path is absolute/safe before handing it to a remote command. */
export function assertSafeRemotePath(path: string): string {
  if (typeof path !== 'string' || path.trim() === '') throw remoteError('bad_request', '路径不能为空。')
  if (CONTROL_CHARS.test(path)) throw remoteError('bad_request', '路径包含非法控制字符。')
  return normalizeAbsolute(path)
}

/** Validate a single remote path segment (new folder name / new file name). */
export function sanitizeRemoteName(input: unknown): string {
  if (typeof input !== 'string') throw remoteError('bad_request', '名称不能为空。')
  const name = input.trim()
  if (name === '' || name === '.' || name === '..') throw remoteError('bad_request', '名称不能为空或为 . / ..。')
  if (name.includes('/') || name.includes('\\')) throw remoteError('bad_request', '名称不能包含路径分隔符。')
  if (CONTROL_CHARS.test(name)) throw remoteError('bad_request', '名称包含非法控制字符。')
  if (Buffer.byteLength(name, 'utf8') > 255) throw remoteError('bad_request', '名称过长（最多 255 字节）。')
  return name
}

/** Join a directory and a validated child name. */
export function joinRemotePath(parent: string, name: string): string {
  return normalizeAbsolute(posix.join(assertSafeRemotePath(parent), sanitizeRemoteName(name)))
}

/** Parent of an absolute remote path; root stays root. */
export function parentRemotePath(path: string): string {
  const normalized = normalizeAbsolute(path)
  return normalized === '/' ? '/' : normalizeAbsolute(posix.dirname(normalized))
}

/** Deleting the remote root is never offered, even for administrators. */
export function assertDeletableRemotePath(path: string): string {
  const normalized = assertSafeRemotePath(path)
  if (normalized === '/') throw remoteError('bad_request', '拒绝删除远端根目录 /。')
  return normalized
}

/** Base name used for download disposition. */
export function remoteBaseName(path: string): string {
  const normalized = normalizeAbsolute(path)
  return normalized === '/' ? 'root' : posix.basename(normalized)
}
