/**
 * FTP / FTPS adapter over basic-ftp.
 *
 * basic-ftp's built-in recursive removeDir is deliberately not used: the
 * plugin owns recursive deletion so it can avoid following symlinks and can
 * keep its own safety budget. All operations on one connection are serialized
 * by the connection pool.
 */
import { posix } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Readable, Writable } from 'node:stream'
import { Client, FileType, type FileInfo } from 'basic-ftp'
import { mapError, remoteError, sanitizeMessage } from '../errors.js'
import type {
  AdapterConfig,
  ConnectResult,
  HostKeyPolicy,
  RemoteAdapter,
  RemoteEntry,
  RemoteEntryKind,
  RemoteListing,
  RemoteStat,
} from './types.js'
import { capEntries, normalizedMtime, remoteChild } from './common.js'

const CONNECT_TIMEOUT_MS = 25_000

function mapFtpError(error: unknown): ReturnType<typeof mapError> {
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'number') {
    if (code === 530) return remoteError('auth_failed', '账号或密码错误。')
    if (code === 421) return remoteError('timeout', 'FTP 服务器关闭了连接。')
    if (code === 550) return remoteError('permission_denied', 'FTP 服务器拒绝访问该路径（不存在或无权限）。')
    if (code === 553) return remoteError('bad_request', 'FTP 服务器拒绝了文件名。')
    if (code === 425) return remoteError('connection_failed', 'FTP 无法建立数据传输连接。')
  }
  const message = sanitizeMessage((error as { message?: string } | null)?.message ?? String(error))
  if (/self[- ]signed|certificate|tls|ssl/i.test(message)) {
    return remoteError('tls_error', 'TLS 证书校验失败；仅在信任该服务器时允许自签名证书。')
  }
  if (/login|password|530/i.test(message)) return remoteError('auth_failed', '账号或密码错误。')
  return mapError(error, 'connection_failed')
}

function isTimeout(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 421 || code === 'ETIMEDOUT') return true
  const message = String((error as { message?: string } | null)?.message ?? '')
  return /timeout|timed out/i.test(message)
}

function kindOf(info: FileInfo): RemoteEntryKind {
  if (info.type === FileType.Directory) return 'directory'
  if (info.type === FileType.File) return 'file'
  if (info.type === FileType.SymbolicLink) return 'symlink'
  if (info.isDirectory) return 'directory'
  if (info.isFile) return 'file'
  if (info.isSymbolicLink) return 'symlink'
  return 'other'
}

export class FtpAdapter implements RemoteAdapter {
  readonly protocol: 'ftp' | 'ftps' | 'ftpsi'
  private readonly config: AdapterConfig
  private client?: Client
  private homePath = '/'
  private connected = false

  constructor(config: AdapterConfig) {
    this.config = config
    this.protocol = config.server.protocol === 'sftp' ? 'ftp' : config.server.protocol
  }

  isConnected(): boolean {
    return this.connected && this.client !== undefined && !this.client.closed
  }

  home(): string {
    return this.homePath
  }

  async connect(_policy: HostKeyPolicy): Promise<ConnectResult> {
    if (this.isConnected()) return { home: this.homePath }
    await this.openClient(true)
    return { home: this.homePath }
  }

  private async openClient(retryOnTimeout: boolean): Promise<void> {
    await this.close()
    const server = this.config.server
    const client = new Client(CONNECT_TIMEOUT_MS)
    this.client = client
    const secure = server.protocol === 'ftpsi' ? 'implicit' : server.protocol === 'ftps' ? true : false
    try {
      await client.access({
        host: server.host,
        port: server.port,
        user: server.username,
        password: this.config.password,
        secure,
        ...(secure && server.allowInvalidCert
          ? { secureOptions: { rejectUnauthorized: false } }
          : {}),
      })
      this.homePath = (await client.pwd()) || '/'
      this.connected = true
    } catch (error) {
      this.connected = false
      try { client.close() } catch { /* ignore */ }
      this.client = undefined
      if (retryOnTimeout && isTimeout(error)) {
        // basic-ftp can race a very fast TLS/FTP server with its initial
        // timeout; one clean retry avoids leaving the panel in a false error.
        return this.openClient(false)
      }
      throw mapFtpError(error)
    }
  }

  private requireClient(): Client {
    if (!this.isConnected() || !this.client) throw remoteError('not_connected', '未连接到 FTP 服务器。')
    return this.client
  }

  private async readWithRetry<T>(operation: (client: Client) => Promise<T>): Promise<T> {
    try {
      return await operation(this.requireClient())
    } catch (error) {
      if (this.client?.closed) {
        try {
          await this.openClient(false)
          return await operation(this.requireClient())
        } catch (retryError) {
          throw mapFtpError(retryError)
        }
      }
      throw mapFtpError(error)
    }
  }

  private async write<T>(operation: (client: Client) => Promise<T>): Promise<T> {
    try {
      return await operation(this.requireClient())
    } catch (error) {
      throw mapFtpError(error)
    }
  }

  async list(path: string): Promise<RemoteListing> {
    const infos = await this.readWithRetry(client => client.list(path))
    const entries: RemoteEntry[] = infos
      .filter(info => info.name !== '.' && info.name !== '..')
      .map(info => {
        const kind = kindOf(info)
        return {
          name: info.name,
          path: remoteChild(path, info.name),
          kind,
          isSymlink: info.isSymbolicLink || kind === 'symlink',
          size: Number(info.size) || 0,
          mtime: normalizedMtime(info.modifiedAt),
        }
      })
    return capEntries(entries)
  }

  async stat(path: string): Promise<RemoteStat> {
    if (path === '/') {
      return { path, name: '/', kind: 'directory', isSymlink: false, size: 0, mtime: 0 }
    }
    const parent = posix.dirname(path)
    const name = posix.basename(path)
    const entries = await this.list(parent)
    const entry = entries.entries.find(item => item.name === name)
    if (!entry) throw remoteError('not_found', '远端路径不存在。')
    if (entry.kind === 'symlink') {
      try {
        const size = await this.readWithRetry(client => client.size(path))
        return { ...entry, kind: 'file', isSymlink: true, size }
      } catch {
        return entry
      }
    }
    return {
      path: entry.path,
      name: entry.name,
      kind: entry.kind,
      isSymlink: entry.isSymlink,
      size: entry.size,
      mtime: entry.mtime,
    }
  }

  async mkdir(path: string): Promise<void> {
    await this.write(async (client) => {
      await client.send(`MKD ${path}`)
    })
  }

  async rename(from: string, to: string): Promise<void> {
    await this.write(client => client.rename(from, to).then(() => undefined))
  }

  async removeTree(path: string): Promise<void> {
    let nodes = 0
    const remove = async (target: string, depth: number): Promise<void> => {
      if (depth > 100) throw remoteError('bad_request', '目录层级过深，已停止删除。')
      nodes += 1
      if (nodes > 10_000) throw remoteError('bad_request', '目录条目过多，已停止删除。')
      const info = await this.stat(target)
      if (info.kind === 'directory' && !info.isSymlink) {
        const listing = await this.list(target)
        for (const child of listing.entries) await remove(child.path, depth + 1)
        await this.write(async (client) => {
          await client.send(`RMD ${target}`)
        })
        return
      }
      await this.write(client => client.remove(target).then(() => undefined))
    }
    await remove(path, 0)
  }

  async upload(source: Readable, directory: string, name: string, overwrite: boolean): Promise<string> {
    const target = remoteChild(directory, name)
    let existing: RemoteStat | undefined
    try {
      existing = await this.stat(target)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && (error as { code?: string }).code === 'not_found')) throw error
    }
    if (existing?.kind === 'directory') throw remoteError('conflict', '同名目录已存在。')
    if (existing && !overwrite) throw remoteError('conflict', '目标文件已存在。')

    const short = name.length > 160 ? name.slice(0, 160) : name
    const temp = remoteChild(directory, `.${short}.dsh-upload-${randomUUID().slice(0, 8)}`)
    try {
      await this.write(client => client.uploadFrom(source, temp).then(() => undefined))
      if (existing) {
        await this.write(client => client.remove(target).then(() => undefined))
      }
      await this.write(client => client.rename(temp, target).then(() => undefined))
      return target
    } catch (error) {
      try {
        await this.write(client => client.remove(temp).then(() => undefined))
      } catch { /* best effort */ }
      throw mapError(error, 'internal')
    }
  }

  async download(path: string, destination: Writable): Promise<void> {
    await this.write(client => client.downloadTo(destination, path).then(() => undefined))
  }

  async close(): Promise<void> {
    this.connected = false
    const client = this.client
    this.client = undefined
    if (!client) return
    try { client.close() } catch { /* ignore */ }
  }
}
