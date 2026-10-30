import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ServerStore } from '../src/host/store.js'

const FINGERPRINT = 'a'.repeat(64)

describe('server store', () => {
  let dir = ''
  let store: ServerStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-server-directory-store-'))
    store = new ServerStore({ dataDir: dir })
    await store.init()
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('stores a password separately and never returns it publicly', async () => {
    const server = await store.saveServer({
      name: 'Prod',
      protocol: 'sftp',
      host: 'example.com',
      port: 22,
      username: 'alice',
      password: 'secret-value',
      allowInvalidCert: false,
    })
    expect(JSON.stringify(server)).not.toContain('secret-value')
    expect(await store.getPassword(server.id)).toBe('secret-value')
    expect(await store.hasPassword(server.id)).toBe(true)
    expect((await store.listServers())[0]?.name).toBe('Prod')
  })

  it('preserves the password when an edit leaves it blank and replaces it when supplied', async () => {
    const server = await store.saveServer({
      protocol: 'ftp',
      host: 'ftp.example.com',
      port: 21,
      username: 'bob',
      password: 'first',
    })
    await store.saveServer({
      id: server.id,
      name: 'Renamed',
      protocol: 'ftp',
      host: 'ftp.example.com',
      port: 21,
      username: 'bob',
      password: '',
    })
    expect(await store.getPassword(server.id)).toBe('first')
    expect((await store.getServer(server.id))?.name).toBe('Renamed')

    await store.saveServer({
      id: server.id,
      protocol: 'ftps',
      host: 'ftp.example.com',
      port: 21,
      username: 'bob',
      password: 'second',
      allowInvalidCert: true,
    })
    expect(await store.getPassword(server.id)).toBe('second')
    expect((await store.getServer(server.id))?.protocol).toBe('ftps')
  })

  it('requires a password for a new server', async () => {
    await expect(store.saveServer({
      protocol: 'sftp',
      host: 'example.com',
      port: 22,
      username: 'alice',
      password: '',
    })).rejects.toThrow(/密码/)
  })

  it('trusts known hosts and cleans the pin when the endpoint is deleted', async () => {
    const server = await store.saveServer({
      protocol: 'sftp',
      host: 'example.com',
      port: 22,
      username: 'alice',
      password: 'pw',
    })
    await store.trustHost('example.com', 22, FINGERPRINT)
    expect((await store.getKnownHost('EXAMPLE.COM', 22))?.fingerprint).toBe(FINGERPRINT)
    await expect(store.trustHost('example.com', 22, 'not-a-fingerprint')).rejects.toThrow(/指纹/)

    await store.deleteServer(server.id)
    expect(await store.getKnownHost('example.com', 22)).toBeUndefined()
    expect(await store.getPassword(server.id)).toBeUndefined()
  })

  it('keeps the known host when another server uses the same endpoint', async () => {
    const first = await store.saveServer({
      protocol: 'sftp', host: 'example.com', port: 22, username: 'alice', password: 'pw',
    })
    await store.saveServer({
      protocol: 'sftp', host: 'example.com', port: 22, username: 'bob', password: 'pw2',
    })
    const id = first.id
    await store.trustHost('example.com', 22, FINGERPRINT)
    await store.deleteServer(id)
    expect((await store.getKnownHost('example.com', 22))?.fingerprint).toBe(FINGERPRINT)
  })
})
