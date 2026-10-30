import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { FtpSrv } from 'ftp-srv'
import { FtpAdapter } from '../src/host/protocols/ftp.js'
import type { ServerRecord } from '../src/host/store.js'

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address === 'object' && address) {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error('no port')))
      }
    })
  })
}

describe('FTP adapter over a real FTP server', () => {
  let dir = ''
  let ftpServer: FtpSrv
  let port = 0
  let adapter: FtpAdapter

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-server-directory-ftp-'))
    port = await freePort()
    const quietLog = {
      fatal: () => undefined,
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
      debug: () => undefined,
      trace: () => undefined,
      child: () => quietLog,
    }
    ftpServer = new FtpSrv({
      url: `ftp://127.0.0.1:${port}`,
      pasv_url: '127.0.0.1',
      anonymous: false,
      greeting: 'test ftp',
      log: quietLog,
    })
    ftpServer.on('login', ({ username, password }, resolve, reject) => {
      if (username === 'u' && password === 'p') {
        resolve({ root: dir })
        return
      }
      reject(new Error('bad credentials'))
    })
    await ftpServer.listen()
    const server: ServerRecord = {
      id: 'ftp-test',
      name: 'local',
      protocol: 'ftp',
      host: '127.0.0.1',
      port,
      username: 'u',
      allowInvalidCert: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    adapter = new FtpAdapter({ server, password: 'p' })
    const result = await adapter.connect({})
    expect(result.home).toBeTruthy()
  })

  afterEach(async () => {
    await adapter?.close()
    await ftpServer?.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('creates, lists, uploads, downloads, renames and deletes', async () => {
    await adapter.mkdir('/docs')
    const listing = await adapter.list('/')
    expect(listing.entries.some(entry => entry.name === 'docs' && entry.kind === 'directory')).toBe(true)

    await adapter.mkdir('/docs/sub')
    const nested = await adapter.upload(Readable.from('nested file'), '/docs', 'a.txt', false)
    expect(nested).toBe('/docs/a.txt')

    const uploadedPath = await adapter.upload(Readable.from('hello ftp'), '/', 'a.txt', false)
    expect(uploadedPath).toBe('/a.txt')
    expect(await readFile(join(dir, 'a.txt'), 'utf8')).toBe('hello ftp')
    await expect(adapter.upload(Readable.from('again'), '/', 'a.txt', false)).rejects.toMatchObject({ code: 'conflict' })
    await adapter.upload(Readable.from('overwritten'), '/', 'a.txt', true)
    expect(await readFile(join(dir, 'a.txt'), 'utf8')).toBe('overwritten')

    const chunks: Buffer[] = []
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      },
    })
    await adapter.download('/a.txt', destination)
    expect(Buffer.concat(chunks).toString('utf8')).toBe('overwritten')

    await adapter.rename('/a.txt', '/b.txt')
    const afterRename = await adapter.list('/')
    expect(afterRename.entries.map(entry => entry.name)).toContain('b.txt')

    await adapter.removeTree('/docs')
    expect((await adapter.list('/')).entries.some(entry => entry.name === 'docs')).toBe(false)
    await adapter.removeTree('/b.txt')
    const finalListing = await adapter.list('/')
    expect(finalListing.entries).toHaveLength(0)
  })

  it('reports an authentication failure cleanly', async () => {
    const server: ServerRecord = {
      id: 'bad',
      name: 'bad',
      protocol: 'ftp',
      host: '127.0.0.1',
      port,
      username: 'u',
      allowInvalidCert: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const bad = new FtpAdapter({ server, password: 'wrong' })
    await expect(bad.connect({})).rejects.toMatchObject({ code: 'auth_failed' })
    await bad.close()
  })
})
