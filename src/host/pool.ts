/**
 * Per-server connection pool. Each server has at most one live protocol
 * adapter, and all operations on that adapter are serialized so FTP command
 * interleaving cannot corrupt listings or transfers.
 */
import { mapError, remoteError, type RemoteError } from './errors.js'
import type { ServerRecord, ServerStore } from './store.js'
import type { RemoteAdapter } from './protocols/types.js'
import { SftpAdapter } from './protocols/sftp.js'
import { FtpAdapter } from './protocols/ftp.js'

export interface ConnectOptions {
  trustHostKey?: boolean
  hostKeyFingerprint?: string
  acceptChangedHostKey?: boolean
}

export interface ConnectionStatus {
  serverId: string
  state: 'connected' | 'disconnected' | 'error'
  home?: string
  lastError?: string
  code?: string
}

interface Session {
  server: ServerRecord
  adapter: RemoteAdapter
  home: string
  fingerprint?: string
  lastUsedAt: number
}

export class ConnectionPool {
  private readonly store: ServerStore
  private readonly sessions = new Map<string, Session>()
  private readonly queues = new Map<string, Promise<unknown>>()
  private readonly errors = new Map<string, { code: string; message: string }>()
  private connectChain: Promise<unknown> = Promise.resolve()

  constructor(store: ServerStore) {
    this.store = store
  }

  private createAdapter(server: ServerRecord, password: string): RemoteAdapter {
    if (server.protocol === 'sftp') return new SftpAdapter({ server, password })
    return new FtpAdapter({ server, password })
  }

  /** Connect (or reuse) a server; connection attempts are serialized globally. */
  async connect(serverId: string, options: ConnectOptions = {}): Promise<{
    home: string
    fingerprint?: string
    status: ConnectionStatus
  }> {
    const run = this.connectChain.then(
      () => this.connectNow(serverId, options),
      () => this.connectNow(serverId, options),
    )
    this.connectChain = run.catch(() => undefined)
    return run
  }

  private async connectNow(serverId: string, options: ConnectOptions): Promise<{
    home: string
    fingerprint?: string
    status: ConnectionStatus
  }> {
    const existing = this.sessions.get(serverId)
    if (existing?.adapter.isConnected()) {
      return { home: existing.home, fingerprint: existing.fingerprint, status: this.statusOf(existing) }
    }
    if (existing) await this.disconnect(serverId)

    const server = await this.store.getServer(serverId)
    if (!server) throw remoteError('not_found', '服务器不存在。')
    const password = await this.store.getPassword(serverId)
    if (!password) throw remoteError('auth_failed', '该服务器尚未保存密码，请编辑服务器并填写密码。')
    const known = server.protocol === 'sftp'
      ? await this.store.getKnownHost(server.host, server.port)
      : undefined

    const adapter = this.createAdapter(server, password)
    try {
      const result = await adapter.connect({
        knownFingerprint: known?.fingerprint,
        trust: options.trustHostKey === true,
        expectedFingerprint: options.hostKeyFingerprint,
        acceptChanged: options.acceptChangedHostKey === true,
      })
      if (server.protocol === 'sftp' && result.fingerprint && options.trustHostKey === true) {
        await this.store.trustHost(server.host, server.port, result.fingerprint)
      }
      const session: Session = {
        server,
        adapter,
        home: result.home || '/',
        fingerprint: result.fingerprint,
        lastUsedAt: Date.now(),
      }
      this.sessions.set(serverId, session)
      this.errors.delete(serverId)
      return { home: session.home, fingerprint: session.fingerprint, status: this.statusOf(session) }
    } catch (error) {
      try { await adapter.close() } catch { /* ignore */ }
      const mapped = mapError(error, 'connection_failed')
      this.errors.set(serverId, { code: mapped.code, message: mapped.message })
      throw mapped
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const session = this.sessions.get(serverId)
    this.sessions.delete(serverId)
    this.errors.delete(serverId)
    if (session) {
      try { await session.adapter.close() } catch { /* ignore */ }
    }
  }

  getHome(serverId: string): string | undefined {
    return this.sessions.get(serverId)?.home
  }

  isConnected(serverId: string): boolean {
    return this.sessions.get(serverId)?.adapter.isConnected() === true
  }

  statusOfSession(serverId: string): ConnectionStatus {
    const session = this.sessions.get(serverId)
    if (session) return this.statusOf(session)
    const error = this.errors.get(serverId)
    if (error) return { serverId, state: 'error', code: error.code, lastError: error.message }
    return { serverId, state: 'disconnected' }
  }

  listStatuses(): ConnectionStatus[] {
    const ids = new Set<string>([...this.sessions.keys(), ...this.errors.keys()])
    return [...ids].map(id => this.statusOfSession(id))
  }

  private statusOf(session: Session): ConnectionStatus {
    if (!session.adapter.isConnected()) {
      return { serverId: session.server.id, state: 'disconnected' }
    }
    return { serverId: session.server.id, state: 'connected', home: session.home }
  }

  private enqueue<T>(serverId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(serverId) ?? Promise.resolve()
    const run = previous.then(operation, operation)
    this.queues.set(serverId, run.then(() => undefined, () => undefined))
    return run
  }

  /** Run one operation against a live server. */
  async withSession<T>(serverId: string, operation: (adapter: RemoteAdapter, home: string) => Promise<T>): Promise<T> {
    return this.enqueue(serverId, async () => {
      let session = this.sessions.get(serverId)
      if (!session || !session.adapter.isConnected()) {
        if (session) {
          this.sessions.delete(serverId)
          this.errors.set(serverId, { code: 'disconnected', message: '连接已断开，请重新连接。' })
          try { await session.adapter.close() } catch { /* ignore */ }
        }
        throw remoteError('not_connected', '连接已断开，请重新连接。')
      }
      session.lastUsedAt = Date.now()
      try {
        return await operation(session.adapter, session.home)
      } catch (error) {
        const mapped = mapError(error)
        if (mapped.code === 'not_connected' || mapped.code === 'disconnected') {
          this.sessions.delete(serverId)
          this.errors.set(serverId, { code: mapped.code, message: mapped.message })
          try { await session.adapter.close() } catch { /* ignore */ }
          session = undefined
        }
        throw mapped
      }
    })
  }

  async closeAll(): Promise<void> {
    const ids = [...this.sessions.keys()]
    await Promise.all(ids.map(id => this.disconnect(id)))
  }
}

export type { RemoteError }
