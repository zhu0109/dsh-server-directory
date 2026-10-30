/**
 * SFTP adapter over ssh2.
 *
 * Password authentication is primary; keyboard-interactive is offered as a
 * fallback because several SSH servers use it for password login. Host keys
 * are always verified: an unknown key must be explicitly trusted by the user,
 * and a changed key is never accepted silently.
 */
import { posix } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import type { Readable, Writable } from 'node:stream'
import { Client, type ConnectConfig, type SFTPWrapper, type Stats } from 'ssh2'
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
import { capEntries, kindFromMode, normalizedMtime, remoteChild } from './common.js'
import { decideHostKey } from './host-key.js'

const CONNECT_TIMEOUT_MS = 25_000
const OPERATION_TIMEOUT_MS = 30_000

function callSftp<T>(
  action: (callback: (error: Error | null | undefined, value: T) => void) => void,
  timeoutMs = OPERATION_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(remoteError('timeout', '远端操作超时。'))
    }, timeoutMs)
    const finish = (error: Error | null | undefined, value: T): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(mapError(error, 'internal'))
      else resolve(value)
    }
    try {
      action(finish)
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)), undefined as T)
    }
  })
}

function statKind(stats: Stats): RemoteEntryKind {
  if (stats.isDirectory()) return 'directory'
  if (stats.isFile()) return 'file'
  if (stats.isSymbolicLink()) return 'symlink'
  if (typeof stats.mode === 'number') return kindFromMode(stats.mode)
  return 'other'
}

export class SftpAdapter implements RemoteAdapter {
  readonly protocol = 'sftp' as const
  private readonly config: AdapterConfig
  private client?: Client
  private sftp?: SFTPWrapper
  private homePath = '/'
  private fingerprint = ''
  private connected = false
  /** Incremented per connect attempt so late events from an abandoned client
   * cannot clobber a newer live connection. */
  private generation = 0

  constructor(config: AdapterConfig) {
    this.config = config
  }

  isConnected(): boolean {
    return this.connected && this.sftp !== undefined
  }

  home(): string {
    return this.homePath
  }

  async connect(policy: HostKeyPolicy): Promise<ConnectResult> {
    if (this.connected) return { home: this.homePath, fingerprint: this.fingerprint || undefined }
    const server = this.config.server
    let hostKeyFailure: ReturnType<typeof remoteError> | undefined
    let resolved = false
    const generation = ++this.generation

    const client = new Client()
    this.client = client

    const connectPromise = new Promise<ConnectResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (resolved) return
        resolved = true
        try { client.end() } catch { /* ignore */ }
        reject(remoteError('timeout', '连接 SSH 服务器超时。'))
      }, CONNECT_TIMEOUT_MS)

      const fail = (error: unknown): void => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        if (this.generation === generation) {
          this.connected = false
          this.sftp = undefined
        }
        try { client.end() } catch { /* ignore */ }
        reject(hostKeyFailure ?? mapError(error, 'connection_failed'))
      }

      client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
        finish(prompts.map(() => this.config.password))
      })

      client.on('ready', () => {
        const current = client
        if (this.generation !== generation) {
          try { current.end() } catch { /* ignore */ }
          return
        }
        current.sftp((error, sftp) => {
          if (resolved || this.generation !== generation) {
            try { current.end() } catch { /* ignore */ }
            return
          }
          if (error || !sftp) {
            fail(error ?? new Error('SFTP subsystem unavailable'))
            return
          }
          this.sftp = sftp
          this.connected = true
          const done = (home: string): void => {
            if (resolved) return
            resolved = true
            clearTimeout(timer)
            this.homePath = home || '/'
            resolve({ home: this.homePath, fingerprint: this.fingerprint || undefined })
          }
          sftp.realpath('.', (realpathError, absolute) => {
            if (realpathError) {
              done('/')
              return
            }
            done(absolute || '/')
          })
        })
      })

      client.on('error', (error) => {
        const message = sanitizeMessage(error.message)
        if (this.generation === generation) {
          this.connected = false
          this.sftp = undefined
        }
        fail(new Error(message))
      })

      client.on('close', () => {
        if (this.generation === generation) {
          this.connected = false
          this.sftp = undefined
        }
        if (!resolved) fail(new Error('SSH connection closed before authentication completed'))
      })

      const verifyHost = (value: unknown): boolean => {
        const decision = decideHostKey(value, policy)
        this.fingerprint = decision.fingerprint
        if (!decision.accepted) hostKeyFailure = decision.error
        return decision.accepted
      }

      const options: ConnectConfig = {
        host: server.host,
        port: server.port,
        username: server.username,
        password: this.config.password,
        readyTimeout: 20_000,
        keepaliveInterval: 30_000,
        keepaliveCountMax: 3,
        tryKeyboard: true,
        hostHash: 'sha256',
        hostVerifier: verifyHost as ConnectConfig['hostVerifier'],
      }

      try {
        client.connect(options)
      } catch (error) {
        fail(error)
      }
    })

    return connectPromise
  }

  private requireSftp(): SFTPWrapper {
    if (!this.connected || !this.sftp) throw remoteError('not_connected', '未连接到服务器。')
    return this.sftp
  }

  async list(path: string): Promise<RemoteListing> {
    const sftp = this.requireSftp()
    const entries: RemoteEntry[] = []
    const list = await callSftp<Array<{ filename: string; attrs: Stats; longname?: string }>>(
      callback => sftp.readdir(path, callback),
    )
    for (const item of list) {
      if (item.filename === '.' || item.filename === '..') continue
      const full = remoteChild(path, item.filename)
      let kind = statKind(item.attrs)
      let isSymlink = item.attrs.isSymbolicLink()
      if (isSymlink) {
        try {
          const target = await callSftp<Stats>(callback => sftp.stat(full, callback), 10_000)
          kind = statKind(target)
          isSymlink = true
        } catch {
          kind = 'symlink'
        }
      }
      entries.push({
        name: item.filename,
        path: full,
        kind,
        isSymlink,
        size: Number(item.attrs.size) || 0,
        mtime: normalizedMtime(item.attrs.mtime),
      })
    }
    return capEntries(entries)
  }

  async stat(path: string): Promise<RemoteStat> {
    const sftp = this.requireSftp()
    const stats = await callSftp<Stats>(callback => sftp.stat(path, callback))
    return {
      path,
      name: posix.basename(path) || '/',
      kind: statKind(stats),
      isSymlink: stats.isSymbolicLink(),
      size: Number(stats.size) || 0,
      mtime: normalizedMtime(stats.mtime),
    }
  }

  async mkdir(path: string): Promise<void> {
    const sftp = this.requireSftp()
    await callSftp<void>(callback => sftp.mkdir(path, callback))
  }

  async rename(from: string, to: string): Promise<void> {
    const sftp = this.requireSftp()
    await callSftp<void>(callback => sftp.rename(from, to, callback))
  }

  async removeTree(path: string): Promise<void> {
    const sftp = this.requireSftp()
    let nodes = 0
    const remove = async (target: string, depth: number): Promise<void> => {
      if (depth > 100) throw remoteError('bad_request', '目录层级过深，已停止删除。')
      nodes += 1
      if (nodes > 10_000) throw remoteError('bad_request', '目录条目过多，已停止删除。')
      const stats = await callSftp<Stats>(callback => sftp.lstat(target, callback))
      if (stats.isDirectory() && !stats.isSymbolicLink()) {
        const items = await callSftp<Array<{ filename: string }>>(callback => sftp.readdir(target, callback))
        for (const item of items) {
          if (item.filename === '.' || item.filename === '..') continue
          await remove(remoteChild(target, item.filename), depth + 1)
        }
        await callSftp<void>(callback => sftp.rmdir(target, callback))
        return
      }
      await callSftp<void>(callback => sftp.unlink(target, callback))
    }
    await remove(path, 0)
  }

  async upload(source: Readable, directory: string, name: string, overwrite: boolean): Promise<string> {
    const sftp = this.requireSftp()
    const target = remoteChild(directory, name)
    let existing: RemoteStat | undefined
    try {
      existing = await this.stat(target)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'not_found')) throw error
    }
    if (existing?.kind === 'directory') throw remoteError('conflict', '同名目录已存在。')
    if (existing && !overwrite) throw remoteError('conflict', '目标文件已存在。')

    const short = name.length > 160 ? name.slice(0, 160) : name
    const temp = remoteChild(directory, `.${short}.dsh-upload-${randomUUID().slice(0, 8)}`)
    let writeStream: ReturnType<SFTPWrapper['createWriteStream']> | undefined
    try {
      writeStream = sftp.createWriteStream(temp)
      await pipeline(source, writeStream)
      writeStream = undefined
      if (existing) {
        try { await callSftp<void>(callback => sftp.unlink(target, callback)) } catch { /* checked below */ }
      }
      await callSftp<void>(callback => sftp.rename(temp, target, callback))
      return target
    } catch (error) {
      try { writeStream?.destroy() } catch { /* ignore */ }
      try { await callSftp<void>(callback => sftp.unlink(temp, callback), 5_000) } catch { /* best effort */ }
      throw mapError(error, 'internal')
    }
  }

  async download(path: string, destination: Writable): Promise<void> {
    const sftp = this.requireSftp()
    const source = sftp.createReadStream(path)
    await pipeline(source, destination)
  }

  async close(): Promise<void> {
    this.generation += 1
    this.connected = false
    this.sftp = undefined
    const client = this.client
    this.client = undefined
    if (!client) return
    try { client.end() } catch { /* ignore */ }
  }
}
