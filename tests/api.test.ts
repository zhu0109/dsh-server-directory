import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ServerDirectoryApi } from '../src/host/api.js'
import type { ConnectionPool } from '../src/host/pool.js'
import type { RemoteAdapter, RemoteEntry, RemoteListing } from '../src/host/protocols/types.js'
import { ServerStore } from '../src/host/store.js'
import { RemoteError } from '../src/host/errors.js'

const FINGERPRINT = 'b'.repeat(64)

function entry(name: string, kind: RemoteEntry['kind'] = 'file'): RemoteEntry {
  return { name, path: `/home/u/${name}`, kind, isSymlink: false, size: 5, mtime: Date.now() }
}

function fakeAdapter(overrides: Partial<RemoteAdapter> = {}): RemoteAdapter {
  const adapter: RemoteAdapter = {
    protocol: 'sftp',
    connect: async () => ({ home: '/home/u', fingerprint: FINGERPRINT }),
    isConnected: () => true,
    home: () => '/home/u',
    list: async (): Promise<RemoteListing> => ({
      entries: [entry('docs', 'directory'), entry('a.txt')],
      truncated: false,
    }),
    stat: async path => ({ path, name: path.split('/').pop() ?? '', kind: 'file', isSymlink: false, size: 7, mtime: 0 }),
    mkdir: async () => undefined,
    rename: async () => undefined,
    removeTree: async () => undefined,
    upload: async () => '/home/u/new.txt',
    download: async (_path, destination) => { destination.end('hello') },
    close: async () => undefined,
    ...overrides,
  }
  return adapter
}

function fakePool(
  adapter: RemoteAdapter,
  statuses: Array<{ serverId: string; state: 'connected' | 'disconnected' | 'error' }> = [],
): ConnectionPool {
  return {
    listStatuses: () => statuses,
    connect: async () => ({
      home: '/home/u',
      fingerprint: FINGERPRINT,
      status: { serverId: 's1', state: 'connected', home: '/home/u' },
    }),
    disconnect: async () => undefined,
    withSession: async <T>(_id: string, operation: (a: RemoteAdapter, home: string) => Promise<T>) => operation(adapter, '/home/u'),
  } as unknown as ConnectionPool
}

describe('server directory API', () => {
  let dir = ''
  let store: ServerStore
  let serverId = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-server-directory-api-'))
    store = new ServerStore({ dataDir: dir })
    await store.init()
    const server = await store.saveServer({
      protocol: 'sftp',
      host: 'example.com',
      port: 22,
      username: 'u',
      password: 'pw',
    })
    serverId = server.id
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('lists public servers with password presence only', async () => {
    const api = new ServerDirectoryApi({ store, pool: fakePool(fakeAdapter()) })
    const result = await api.call('listServers', {})
    const servers = result.servers as Array<Record<string, unknown>>
    expect(servers[0]?.hasPassword).toBe(true)
    expect(servers[0]?.password).toBeUndefined()
    expect(JSON.stringify(servers)).not.toContain('"pw"')
  })

  it('lists a directory and resolves relative paths against home', async () => {
    let seen = ''
    const adapter = fakeAdapter({
      list: async (path) => {
        seen = path
        return { path, entries: [entry('a.txt')], truncated: false }
      },
    })
    const api = new ServerDirectoryApi({ store, pool: fakePool(adapter) })
    const result = await api.call('list', { id: serverId, path: 'sub' })
    expect(seen).toBe('/home/u/sub')
    expect(result.path).toBe('/home/u/sub')
    expect((result.entries as RemoteEntry[])[0]?.name).toBe('a.txt')
  })

  it('creates and renames using a single validated segment', async () => {
    const created: string[] = []
    const renamed: string[] = []
    const adapter = fakeAdapter({
      mkdir: async path => { created.push(path) },
      rename: async (from, to) => { renamed.push(`${from}>${to}`) },
    })
    const api = new ServerDirectoryApi({ store, pool: fakePool(adapter) })
    expect((await api.call('mkdir', { id: serverId, parent: '/home/u', name: 'docs' })).path).toBe('/home/u/docs')
    expect((await api.call('rename', { id: serverId, path: '/home/u/a.txt', newName: 'b.txt' })).path).toBe('/home/u/b.txt')
    expect(created).toEqual(['/home/u/docs'])
    expect(renamed).toEqual(['/home/u/a.txt>/home/u/b.txt'])
    await expect(api.call('rename', { id: serverId, path: '/home/u/a.txt', newName: '../x' })).rejects.toThrow()
  })

  it('refuses to delete the remote root', async () => {
    let called = false
    const adapter = fakeAdapter({ removeTree: async () => { called = true } })
    const api = new ServerDirectoryApi({ store, pool: fakePool(adapter) })
    await expect(api.call('delete', { id: serverId, path: '/' })).rejects.toThrow(/根目录/)
    expect(called).toBe(false)
  })

  it('streams uploads into the requested directory with a sanitized name', async () => {
    let uploaded: { directory: string; name: string; overwrite: boolean; body: string } | undefined
    const adapter = fakeAdapter({
      upload: async (source, directory, name, overwrite) => {
        let body = ''
        for await (const chunk of source) body += String(chunk)
        uploaded = { directory, name, overwrite, body }
        return `${directory}/${name}`
      },
    })
    const api = new ServerDirectoryApi({ store, pool: fakePool(adapter) })
    const req = Readable.from([Buffer.from('hello world')]) as unknown as IncomingMessage
    const query = new URLSearchParams({ serverId, dir: '/home/u', name: 'new.txt', overwrite: '1' })
    const result = await api.upload(req, query)
    expect(result.path).toBe('/home/u/new.txt')
    expect(uploaded).toMatchObject({ directory: '/home/u', name: 'new.txt', overwrite: true, body: 'hello world' })
  })

  it('sets a safe download disposition', async () => {
    const headers: Record<string, string> = {}
    let ended = false
    const response = {
      headersSent: false,
      writableEnded: false,
      writeHead: (_status: number, values: Record<string, string>) => { Object.assign(headers, values) },
      end: () => { ended = true },
      destroy: () => undefined,
    } as unknown as ServerResponse
    const api = new ServerDirectoryApi({ store, pool: fakePool(fakeAdapter()) })
    await api.download(new URLSearchParams({ serverId, path: '/home/u/报告.txt' }), response)
    expect(headers['content-disposition']).toContain("filename*=UTF-8''")
    expect(ended).toBe(true)
  })

  it('surfaces unknown host key details from connect failures', async () => {
    const error = Object.assign(
      new RemoteError('unknown_host_key', '需要确认主机指纹', { fingerprint: FINGERPRINT }),
      { data: { fingerprint: FINGERPRINT } },
    )
    const pool = {
      ...fakePool(fakeAdapter()),
      connect: async () => { throw error },
    } as unknown as ConnectionPool
    const api = new ServerDirectoryApi({ store, pool })
    await expect(api.call('connect', { id: serverId })).rejects.toMatchObject({
      code: 'unknown_host_key',
      details: { fingerprint: FINGERPRINT },
    })
  })
})
