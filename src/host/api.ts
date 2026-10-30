/**
 * JSON operation layer. HTTP framing lives in index.ts; this module is kept
 * free of route details so the operation contract can be tested with a fake
 * store/pool.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { remoteError } from './errors.js'
import type { ConnectionPool } from './pool.js'
import {
  assertDeletableRemotePath,
  assertSafeRemotePath,
  joinRemotePath,
  parentRemotePath,
  remoteBaseName,
  resolveRemotePath,
  sanitizeRemoteName,
} from './path.js'
import {
  isServerProtocol,
  toPublicServer,
  type ServerInput,
  type ServerProtocol,
  type ServerRecord,
  type ServerStore,
} from './store.js'

const MAX_JSON_BODY_BYTES = 256 * 1024

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw remoteError('bad_request', '请求体必须是 JSON 对象。')
  }
  return value as Record<string, unknown>
}

function requireId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw remoteError('bad_request', '缺少服务器 id。')
  return value.trim()
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asBoolean(value: unknown): boolean {
  return value === true
}

/** Read a bounded JSON request body. */
export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    total += buffer.length
    if (total > MAX_JSON_BODY_BYTES) throw remoteError('bad_request', '请求体过大。')
    chunks.push(buffer)
  }
  if (total === 0) return {}
  try {
    return asRecord(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'bad_request') throw error
    throw remoteError('bad_request', '请求体不是有效的 JSON。')
  }
}

export interface ApiDependencies {
  store: ServerStore
  pool: ConnectionPool
}

export class ServerDirectoryApi {
  private readonly store: ServerStore
  private readonly pool: ConnectionPool

  constructor(deps: ApiDependencies) {
    this.store = deps.store
    this.pool = deps.pool
  }

  async call(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (method) {
      case 'listServers': return this.listServers()
      case 'saveServer': return this.saveServer(body)
      case 'deleteServer': return this.deleteServer(body)
      case 'connect': return this.connect(body)
      case 'disconnect': return this.disconnect(body)
      case 'status': return { statuses: this.pool.listStatuses() }
      case 'list': return this.list(body)
      case 'stat': return this.stat(body)
      case 'mkdir': return this.mkdir(body)
      case 'rename': return this.rename(body)
      case 'delete': return this.delete(body)
      default:
        throw remoteError('not_found', `未知操作：${method}`)
    }
  }

  private async requireServer(id: string): Promise<ServerRecord> {
    const server = await this.store.getServer(id)
    if (!server) throw remoteError('not_found', '服务器不存在。')
    return server
  }

  private async listServers(): Promise<Record<string, unknown>> {
    const servers = await this.store.listServers()
    const statuses = new Map(this.pool.listStatuses().map(status => [status.serverId, status]))
    const publicServers = await Promise.all(servers.map(async server => ({
      ...toPublicServer(server, await this.store.hasPassword(server.id)),
      connection: statuses.get(server.id) ?? { serverId: server.id, state: 'disconnected' },
    })))
    return { servers: publicServers }
  }

  private async saveServer(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const raw = asRecord(body.server)
    const id = optionalString(raw.id)?.trim()
    const existing = id ? await this.store.getServer(id) : undefined
    const protocolValue = raw.protocol
    if (!isServerProtocol(protocolValue)) throw remoteError('bad_request', '不支持的连接协议。')
    const port = Number(raw.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw remoteError('bad_request', '端口必须是 1–65535 的整数。')
    const password = optionalString(raw.password)
    if (!existing && (!password || password === '')) throw remoteError('bad_request', '密码不能为空。')

    const input: ServerInput = {
      id: existing?.id,
      name: optionalString(raw.name),
      protocol: protocolValue as ServerProtocol,
      host: optionalString(raw.host) ?? '',
      port,
      username: optionalString(raw.username) ?? '',
      password,
      allowInvalidCert: asBoolean(raw.allowInvalidCert),
    }
    const record = await this.store.saveServer(input)
    const connectionChanged = !existing
      || existing.protocol !== record.protocol
      || existing.host !== record.host
      || existing.port !== record.port
      || existing.username !== record.username
      || existing.allowInvalidCert !== record.allowInvalidCert
      || (typeof password === 'string' && password !== '')
    if (connectionChanged) {
      try { await this.pool.disconnect(record.id) } catch { /* ignore */ }
    }
    return {
      server: toPublicServer(record, await this.store.hasPassword(record.id)),
    }
  }

  private async deleteServer(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = requireId(body.id)
    await this.pool.disconnect(id)
    const result = await this.store.deleteServer(id)
    return { deleted: result.deleted }
  }

  private async connect(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = requireId(body.id)
    await this.requireServer(id)
    const result = await this.pool.connect(id, {
      trustHostKey: asBoolean(body.trustHostKey),
      hostKeyFingerprint: optionalString(body.hostKeyFingerprint),
      acceptChangedHostKey: asBoolean(body.acceptChangedHostKey),
    })
    return {
      home: result.home,
      fingerprint: result.fingerprint,
      status: result.status,
    }
  }

  private async disconnect(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = requireId(body.id)
    await this.pool.disconnect(id)
    return { ok: true }
  }

  private async list(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = requireId(body.id)
    await this.requireServer(id)
    return this.pool.withSession(id, async (adapter, home) => {
      const path = assertSafeRemotePath(resolveRemotePath(optionalString(body.path), home))
      const listing = await adapter.list(path)
      return { path, home, entries: listing.entries, truncated: listing.truncated }
    })
  }

  private async stat(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = requireId(body.id)
    await this.requireServer(id)
    return this.pool.withSession(id, async (adapter, home) => {
      const path = assertSafeRemotePath(resolveRemotePath(optionalString(body.path), home))
      return { stat: await adapter.stat(path) }
    })
  }

  private async mkdir(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = requireId(body.id)
    const name = sanitizeRemoteName(body.name)
    await this.requireServer(id)
    return this.pool.withSession(id, async (adapter, home) => {
      const parent = assertSafeRemotePath(resolveRemotePath(optionalString(body.parent), home))
      const target = joinRemotePath(parent, name)
      await adapter.mkdir(target)
      return { path: target }
    })
  }

  private async rename(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = requireId(body.id)
    const newName = sanitizeRemoteName(body.newName)
    await this.requireServer(id)
    return this.pool.withSession(id, async (adapter, home) => {
      const from = assertSafeRemotePath(resolveRemotePath(optionalString(body.path), home))
      if (from === '/') throw remoteError('bad_request', '不能重命名远端根目录。')
      const to = joinRemotePath(parentRemotePath(from), newName)
      await adapter.rename(from, to)
      return { path: to }
    })
  }

  private async delete(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = requireId(body.id)
    await this.requireServer(id)
    return this.pool.withSession(id, async (adapter, home) => {
      const path = assertDeletableRemotePath(resolveRemotePath(optionalString(body.path), home))
      await adapter.removeTree(path)
      return { path }
    })
  }

  /** Consume the raw upload request body and stream it to the remote file. */
  async upload(req: IncomingMessage, query: URLSearchParams): Promise<Record<string, unknown>> {
    const id = requireId(query.get('serverId') ?? undefined)
    const name = sanitizeRemoteName(query.get('name') ?? '')
    const overwrite = query.get('overwrite') === '1' || query.get('overwrite') === 'true'
    const directoryInput = query.get('dir') ?? undefined
    await this.requireServer(id)
    return this.pool.withSession(id, async (adapter, home) => {
      const directory = assertSafeRemotePath(resolveRemotePath(directoryInput, home))
      const path = await adapter.upload(req, directory, name, overwrite)
      return { path }
    })
  }

  /** Stream a remote file into an HTTP response. */
  async download(query: URLSearchParams, res: ServerResponse): Promise<void> {
    const id = requireId(query.get('serverId') ?? undefined)
    const pathInput = query.get('path') ?? undefined
    await this.requireServer(id)
    await this.pool.withSession(id, async (adapter, home) => {
      const path = assertSafeRemotePath(resolveRemotePath(pathInput, home))
      const stat = await adapter.stat(path)
      if (stat.kind === 'directory') throw remoteError('bad_request', '不能下载目录。')
      const name = remoteBaseName(path) || 'download'
      const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'download'
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': String(stat.size),
        'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      })
      await adapter.download(path, res)
      if (!res.writableEnded) res.end()
    })
  }
}
