/**
 * Unified error vocabulary shared by the SFTP/FTP adapters, the API and the
 * client. Protocol-specific errors are translated here so the panel never has
 * to parse ssh2/basic-ftp messages.
 */

export type ErrorCode =
  | 'bad_request'
  | 'auth_failed'
  | 'permission_denied'
  | 'not_found'
  | 'not_connected'
  | 'conflict'
  | 'timeout'
  | 'connection_failed'
  | 'disconnected'
  | 'unknown_host_key'
  | 'host_key_changed'
  | 'tls_error'
  | 'unsupported'
  | 'internal'

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  auth_failed: 401,
  permission_denied: 403,
  not_found: 404,
  not_connected: 409,
  conflict: 409,
  timeout: 504,
  connection_failed: 502,
  disconnected: 503,
  unknown_host_key: 409,
  host_key_changed: 409,
  tls_error: 502,
  unsupported: 501,
  internal: 500,
}

export interface ErrorDetails {
  fingerprint?: string
  algorithm?: string
  previous?: string
  [key: string]: unknown
}

/** A deliberate, safe-to-show operation failure. */
export class RemoteError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: ErrorDetails

  constructor(code: ErrorCode, message: string, details?: ErrorDetails) {
    super(message)
    this.name = 'RemoteError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = details
  }
}

export function remoteError(code: ErrorCode, message: string, details?: ErrorDetails): RemoteError {
  return new RemoteError(code, message, details)
}

export function statusForCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code]
}

/** Never echo a password if a third-party library happened to include it. */
export function sanitizeMessage(message: string): string {
  return message
    .replace(/(password|passwd|pwd)\s*[=:]\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '$1=***')
    .replace(/\r?\n/g, ' ')
    .slice(0, 500)
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(STATUS_BY_CODE, value)
}

/**
 * Translate node/ssh2/basic-ftp errors into a stable API error.
 * @param error - Raw failure from an adapter or route.
 * @param fallback - Code used when no more specific match is possible.
 */
export function mapError(error: unknown, fallback: ErrorCode = 'internal'): RemoteError {
  if (error instanceof RemoteError) return error

  const raw = error as {
    code?: unknown
    message?: unknown
    level?: unknown
    status?: unknown
  } | null
  const message = sanitizeMessage(typeof raw?.message === 'string' ? raw.message : String(error ?? 'unknown error'))
  const lower = message.toLowerCase()
  const code = raw?.code

  if (typeof code === 'string') {
    if (isErrorCode(code)) return new RemoteError(code, message)
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return new RemoteError('connection_failed', `无法解析服务器地址：${message}`)
    }
    if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
      return new RemoteError('connection_failed', `无法连接到服务器：${message}`)
    }
    if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
      return new RemoteError('timeout', `连接超时：${message}`)
    }
    if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ECONNABORTED') {
      return new RemoteError('disconnected', `连接已断开：${message}`)
    }
    if (code.startsWith('ERR_TLS') || code.startsWith('CERT_') || code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
      || code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      return new RemoteError('tls_error', `TLS 证书校验失败：${message}`)
    }
  }

  // ssh2 SFTP status codes and FTP reply codes.
  if (typeof code === 'number') {
    if (code === 2) return new RemoteError('not_found', `远端路径不存在：${message}`)
    if (code === 3) return new RemoteError('permission_denied', `没有权限访问远端路径：${message}`)
    if (code === 4) return new RemoteError('internal', `远端服务器拒绝操作：${message}`)
    if (code === 530) return new RemoteError('auth_failed', '账号或密码错误。')
    if (code === 421) return new RemoteError('timeout', 'FTP 服务器关闭了连接。')
    if (code === 550) return new RemoteError('permission_denied', 'FTP 服务器拒绝访问该路径（不存在或无权限）。')
    if (code === 553) return new RemoteError('bad_request', 'FTP 服务器拒绝了文件名。')
    if (code === 425) return new RemoteError('connection_failed', 'FTP 无法建立数据传输连接。')
  }

  if (raw?.level === 'client-authentication' || lower.includes('authentication methods failed')
    || lower.includes('all configured authentication methods failed') || lower.includes('login incorrect')) {
    return new RemoteError('auth_failed', '账号或密码错误，或服务器不允许密码登录。')
  }
  if (lower.includes('host key') || lower.includes('host denied') || lower.includes('verification failed')) {
    return new RemoteError('unknown_host_key', '服务器主机密钥未确认。')
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return new RemoteError('timeout', `操作超时：${message}`)
  }
  if (lower.includes('certificate') || lower.includes('tls') || lower.includes('ssl')) {
    return new RemoteError('tls_error', `TLS 连接失败：${message}`)
  }
  if (lower.includes('no such file') || lower.includes('not found') || lower.includes('does not exist')) {
    return new RemoteError('not_found', `远端路径不存在：${message}`)
  }
  if (lower.includes('permission denied') || lower.includes('access denied') || lower.includes('not allowed')) {
    return new RemoteError('permission_denied', `没有权限执行该操作：${message}`)
  }
  if (lower.includes('already exists')) {
    return new RemoteError('conflict', `目标已存在：${message}`)
  }
  if (lower.includes('connection') && (lower.includes('closed') || lower.includes('lost') || lower.includes('reset'))) {
    return new RemoteError('disconnected', `连接已断开：${message}`)
  }

  // FTP numerical reply codes sometimes survive as `status`.
  if (typeof raw?.status === 'number') {
    if (raw.status === 530) return new RemoteError('auth_failed', '账号或密码错误。')
    if (raw.status === 421) return new RemoteError('timeout', 'FTP 服务器关闭了连接。')
    if (raw.status === 550) {
      return new RemoteError('permission_denied', 'FTP 服务器拒绝访问该路径（不存在或无权限）。')
    }
  }

  return new RemoteError(fallback, message || '操作失败。')
}
