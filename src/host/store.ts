/**
 * File-backed server inventory.
 *
 * Layout under the DSH home directory:
 *   server-directory/servers.json     no secrets
 *   server-directory/secrets.json     passwords only
 *   server-directory/known_hosts.json SFTP host fingerprints
 *
 * Writes are serialized and atomic; reads observe complete files thanks to the
 * temp-file + rename commit. Passwords are never included in a public record.
 */
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { remoteError } from './errors.js'

export const SERVER_PROTOCOLS = ['sftp', 'ftp', 'ftps', 'ftpsi'] as const
export type ServerProtocol = (typeof SERVER_PROTOCOLS)[number]

export function isServerProtocol(value: unknown): value is ServerProtocol {
  return typeof value === 'string' && (SERVER_PROTOCOLS as readonly string[]).includes(value)
}

export function defaultPort(protocol: ServerProtocol): number {
  if (protocol === 'sftp') return 22
  if (protocol === 'ftpsi') return 990
  return 21
}

export interface ServerRecord {
  id: string
  name: string
  protocol: ServerProtocol
  host: string
  port: number
  username: string
  allowInvalidCert: boolean
  createdAt: number
  updatedAt: number
}

export interface PublicServer extends ServerRecord {
  hasPassword: boolean
}

export interface ServerInput {
  id?: string
  name?: string
  protocol?: ServerProtocol
  host?: string
  port?: number
  username?: string
  password?: string
  allowInvalidCert?: boolean
}

interface ServersDoc {
  version: 1
  servers: ServerRecord[]
}

interface SecretsDoc {
  version: 1
  byServerId: Record<string, { password?: string }>
}

interface KnownHostRecord {
  fingerprint: string
  algorithm: 'SHA256'
  trustedAt: number
}

interface KnownHostsDoc {
  version: 1
  keys: Record<string, KnownHostRecord>
}

export interface LoggerLike {
  info?(message: string): void
  warn?(message: string): void
  error?(message: string, error?: unknown): void
}

export interface ServerStoreOptions {
  dataDir: string
  logger?: LoggerLike
}

export function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(home, 'server-directory')
}

export function knownHostKey(host: string, port: number): string {
  return `${host.trim().toLowerCase()}:${port}`
}

export function toPublicServer(server: ServerRecord, hasPassword: boolean): PublicServer {
  return { ...server, hasPassword }
}

function emptyServers(): ServersDoc {
  return { version: 1, servers: [] }
}

function emptySecrets(): SecretsDoc {
  return { version: 1, byServerId: {} }
}

function emptyKnownHosts(): KnownHostsDoc {
  return { version: 1, keys: {} }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function finitePort(value: unknown, fallback: number): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fallback
  return port
}

export class ServerStore {
  readonly dataDir: string
  private readonly logger?: LoggerLike
  private readonly serversPath: string
  private readonly secretsPath: string
  private readonly knownHostsPath: string
  private initPromise?: Promise<void>
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(options: ServerStoreOptions) {
    this.dataDir = options.dataDir
    this.logger = options.logger
    this.serversPath = join(this.dataDir, 'servers.json')
    this.secretsPath = join(this.dataDir, 'secrets.json')
    this.knownHostsPath = join(this.dataDir, 'known_hosts.json')
  }

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await mkdir(this.dataDir, { recursive: true, mode: 0o700 })
        try { await chmod(this.dataDir, 0o700) } catch { /* Windows ACLs own permissions */ }
      })()
    }
    return this.initPromise
  }

  private async ensureInit(): Promise<void> {
    await this.init()
  }

  private withWrite<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(operation, operation)
    this.writeChain = next.catch(() => undefined)
    return next
  }

  private async readJson<T>(path: string, repairValue: () => T): Promise<T> {
    await this.ensureInit()
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return repairValue()
      throw error
    }
    try {
      const parsed = JSON.parse(text)
      if (asObject(parsed) !== undefined) return parsed as T
      throw new Error('document is not an object')
    } catch (error) {
      this.logger?.warn?.(`[dsh-server-directory] ${path} is corrupt; preserving it and using an empty document`)
      try { await rename(path, `${path}.corrupt-${Date.now()}`) } catch { /* best effort */ }
      return repairValue()
    }
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await this.ensureInit()
    const temp = `${path}.${randomUUID()}.tmp`
    const payload = `${JSON.stringify(value, null, 2)}\n`
    try {
      await writeFile(temp, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      try { await chmod(temp, 0o600) } catch { /* Windows ACLs own permissions */ }
      let lastError: unknown
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          await rename(temp, path)
          return
        } catch (error) {
          lastError = error
          await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)))
        }
      }
      throw lastError
    } catch (error) {
      try { await rm(temp, { force: true }) } catch { /* best effort */ }
      throw error
    }
  }

  private async readServersDoc(): Promise<ServersDoc> {
    const doc = await this.readJson<ServersDoc>(this.serversPath, emptyServers)
    if (!Array.isArray(doc.servers)) doc.servers = []
    return doc
  }

  private async readSecretsDoc(): Promise<SecretsDoc> {
    const doc = await this.readJson<SecretsDoc>(this.secretsPath, emptySecrets)
    if (asObject(doc.byServerId) === undefined) doc.byServerId = {}
    return doc
  }

  private async readKnownHostsDoc(): Promise<KnownHostsDoc> {
    const doc = await this.readJson<KnownHostsDoc>(this.knownHostsPath, emptyKnownHosts)
    if (asObject(doc.keys) === undefined) doc.keys = {}
    return doc
  }

  /** Normalize a stored record so an old/partial file cannot crash the API. */
  private normalizeRecord(raw: unknown): ServerRecord | undefined {
    const value = asObject(raw)
    if (!value) return undefined
    const id = typeof value.id === 'string' ? value.id.trim() : ''
    const host = typeof value.host === 'string' ? value.host.trim() : ''
    const username = typeof value.username === 'string' ? value.username.trim() : ''
    if (!id || !host || !username) return undefined
    const protocol = isServerProtocol(value.protocol) ? value.protocol : 'sftp'
    return {
      id,
      name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : host,
      protocol,
      host,
      port: finitePort(value.port, defaultPort(protocol)),
      username,
      allowInvalidCert: value.allowInvalidCert === true,
      createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    }
  }

  async listServers(): Promise<ServerRecord[]> {
    const doc = await this.readServersDoc()
    return doc.servers.map(record => this.normalizeRecord(record)).filter((record): record is ServerRecord => !!record)
  }

  async getServer(id: string): Promise<ServerRecord | undefined> {
    return (await this.listServers()).find(server => server.id === id)
  }

  async hasPassword(id: string): Promise<boolean> {
    const secrets = await this.readSecretsDoc()
    return typeof secrets.byServerId[id]?.password === 'string' && secrets.byServerId[id]?.password !== ''
  }

  async getPassword(id: string): Promise<string | undefined> {
    const secrets = await this.readSecretsDoc()
    const password = secrets.byServerId[id]?.password
    return typeof password === 'string' && password !== '' ? password : undefined
  }

  async saveServer(input: ServerInput): Promise<ServerRecord> {
    return this.withWrite(async () => {
      const serversDoc = await this.readServersDoc()
      const secrets = await this.readSecretsDoc()
      const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : randomUUID()
      const existing = serversDoc.servers
        .map(record => this.normalizeRecord(record))
        .find(record => record?.id === id)
      const protocol = input.protocol ?? existing?.protocol ?? 'sftp'
      if (!isServerProtocol(protocol)) throw remoteError('bad_request', '不支持的连接协议。')
      const host = String(input.host ?? existing?.host ?? '').trim()
      if (!host) throw remoteError('bad_request', '服务器地址不能为空。')
      if (/\s/.test(host)) throw remoteError('bad_request', '服务器地址不能包含空白字符。')
      if (host.includes('://')) throw remoteError('bad_request', '请只填写主机名或 IP，不要包含协议前缀。')
      const username = String(input.username ?? existing?.username ?? '').trim()
      if (!username) throw remoteError('bad_request', '用户名不能为空。')
      const port = finitePort(input.port ?? existing?.port, defaultPort(protocol))
      const now = Date.now()
      const record: ServerRecord = {
        id,
        name: String(input.name ?? existing?.name ?? host).trim() || host,
        protocol,
        host,
        port,
        username,
        allowInvalidCert: input.allowInvalidCert ?? existing?.allowInvalidCert ?? false,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }

      const nextServers = serversDoc.servers
        .map(item => this.normalizeRecord(item))
        .filter((item): item is ServerRecord => !!item)
      const index = nextServers.findIndex(item => item.id === id)
      if (index >= 0) nextServers[index] = record
      else nextServers.push(record)

      const passwordInput = typeof input.password === 'string' ? input.password : undefined
      if (passwordInput !== undefined && passwordInput !== '') {
        secrets.byServerId[id] = { password: passwordInput }
      } else if (!existing && !secrets.byServerId[id]?.password) {
        throw remoteError('bad_request', '密码不能为空。')
      }

      await this.writeJson(this.serversPath, { version: 1, servers: nextServers } satisfies ServersDoc)
      await this.writeJson(this.secretsPath, secrets)
      return record
    })
  }

  async deleteServer(id: string): Promise<{ deleted: boolean; record?: ServerRecord }> {
    return this.withWrite(async () => {
      const serversDoc = await this.readServersDoc()
      const all = serversDoc.servers
        .map(record => this.normalizeRecord(record))
        .filter((record): record is ServerRecord => !!record)
      const record = all.find(item => item.id === id)
      if (!record) return { deleted: false }
      const remaining = all.filter(item => item.id !== id)
      const secrets = await this.readSecretsDoc()
      delete secrets.byServerId[id]

      await this.writeJson(this.serversPath, { version: 1, servers: remaining } satisfies ServersDoc)
      await this.writeJson(this.secretsPath, secrets)

      // Keep the pin if another configured server shares this endpoint.
      const endpointStillUsed = remaining.some(
        server => server.host.toLowerCase() === record.host.toLowerCase() && server.port === record.port,
      )
      if (!endpointStillUsed) {
        const known = await this.readKnownHostsDoc()
        const key = knownHostKey(record.host, record.port)
        if (known.keys[key]) {
          delete known.keys[key]
          await this.writeJson(this.knownHostsPath, known)
        }
      }
      return { deleted: true, record }
    })
  }

  async getKnownHost(host: string, port: number): Promise<KnownHostRecord | undefined> {
    const doc = await this.readKnownHostsDoc()
    return doc.keys[knownHostKey(host, port)]
  }

  async trustHost(host: string, port: number, fingerprint: string): Promise<void> {
    const normalized = fingerprint.replace(/^SHA256:/i, '').toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(normalized)) throw remoteError('internal', '主机指纹格式无效。')
    await this.withWrite(async () => {
      const doc = await this.readKnownHostsDoc()
      doc.keys[knownHostKey(host, port)] = {
        fingerprint: normalized,
        algorithm: 'SHA256',
        trustedAt: Date.now(),
      }
      await this.writeJson(this.knownHostsPath, doc)
    })
  }
}
