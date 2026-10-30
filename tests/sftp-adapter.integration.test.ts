import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import {
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeSync,
  type Dirent,
  type Stats,
} from 'node:fs'
import { createServer, type Server as NetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { Server, utils, type Attributes, type FileEntry } from 'ssh2'
import { SftpAdapter } from '../src/host/protocols/sftp.js'
import type { ServerRecord } from '../src/host/store.js'

const { STATUS_CODE, flagsToString } = utils.sftp

function attrsOf(stats: Stats): Attributes {
  return {
    size: stats.size,
    mode: stats.mode,
    uid: stats.uid,
    gid: stats.gid,
    atime: Math.floor(stats.atimeMs / 1000),
    mtime: Math.floor(stats.mtimeMs / 1000),
  }
}

function deniedFingerprint(error: unknown): string {
  return (error as { details?: { fingerprint?: string } } | undefined)?.details?.fingerprint ?? ''
}

async function expectUnknownHostKey(adapter: SftpAdapter): Promise<string> {
  try {
    await adapter.connect({})
  } catch (error) {
    const fingerprint = deniedFingerprint(error)
    if (!fingerprint) throw error
    return fingerprint
  }
  throw new Error('expected the first connection to require host-key trust')
}

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

/**
 * A deliberately small in-process SFTP server. It supports exactly the
 * operations the adapter needs, which lets the integration test exercise the
 * real ssh2 handshake, host-key prompt, streaming upload/download and list.
 */
function generateHostKey(): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const privateKey = utils.generateKeyPairSync('ed25519').private
    const parsed = utils.parseKey(privateKey)
    if (!(parsed instanceof Error)) return privateKey
  }
  throw new Error('could not generate a valid SSH host key')
}

async function startSftpServer(root: string): Promise<{ server: Server; net: NetServer; port: number }> {
  const hostKey = generateHostKey()
  let netServer: NetServer | undefined
  const sshServer = new Server({ hostKeys: [hostKey] }, client => {
    client.on('error', () => undefined)
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === 'u' && ctx.password === 'p') ctx.accept()
      else ctx.reject()
    })
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        session.on('sftp', (acceptSftp) => {
          const sftp = acceptSftp()
          let counter = 0
          const handles = new Map<number, {
            kind: 'file' | 'dir'
            path: string
            fd?: number
            entries?: Dirent[]
            sent?: boolean
          }>()

          const toLocal = (path: string): string => {
            const normalized = posix.normalize(path || '/')
            const relative = normalized.replace(/^\/+/u, '')
            return relative ? join(root, relative) : root
          }
          const makeHandle = (value: { kind: 'file' | 'dir'; path: string; fd?: number; entries?: Dirent[] }): Buffer => {
            const id = ++counter
            handles.set(id, value)
            const handle = Buffer.alloc(4)
            handle.writeUInt32BE(id, 0)
            return handle
          }
          const handleOf = (handle: Buffer) => {
            if (handle.length !== 4) return undefined
            return handles.get(handle.readUInt32BE(0))
          }
          const fail = (reqid: number, error: unknown): void => {
            const code = (error as NodeJS.ErrnoException)?.code
            if (code === 'ENOENT') sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE)
            else if (code === 'EACCES' || code === 'EPERM') sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED)
            else sftp.status(reqid, STATUS_CODE.FAILURE)
          }

          sftp.on('REALPATH', (reqid, path) => {
            const normalized = path === '.' || path === '' ? '/' : posix.normalize(path)
            sftp.name(reqid, { filename: normalized, longname: normalized } as unknown as FileEntry[])
          })
          sftp.on('STAT', (reqid, path) => {
            try { sftp.attrs(reqid, attrsOf(statSync(toLocal(path)))) } catch (error) { fail(reqid, error) }
          })
          sftp.on('LSTAT', (reqid, path) => {
            try { sftp.attrs(reqid, attrsOf(lstatSync(toLocal(path)))) } catch (error) { fail(reqid, error) }
          })
          sftp.on('OPENDIR', (reqid, path) => {
            try {
              const entries = readdirSync(toLocal(path), { withFileTypes: true })
              sftp.handle(reqid, makeHandle({ kind: 'dir', path, entries }))
            } catch (error) { fail(reqid, error) }
          })
          sftp.on('READDIR', (reqid, handle) => {
            const entry = handleOf(handle)
            if (!entry || entry.kind !== 'dir') { sftp.status(reqid, STATUS_CODE.FAILURE); return }
            if (entry.sent) { sftp.status(reqid, STATUS_CODE.EOF); return }
            entry.sent = true
            const names: FileEntry[] = (entry.entries ?? []).map((dirent) => {
              const full = posix.join(entry.path, dirent.name)
              let attrs: Attributes
              try {
                attrs = attrsOf(lstatSync(toLocal(full)))
              } catch {
                attrs = { mode: 0o100644, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 }
              }
              return { filename: dirent.name, longname: dirent.name, attrs }
            })
            sftp.name(reqid, names)
          })
          sftp.on('OPEN', (reqid, filename, flags, attrs) => {
            try {
              const mode = flagsToString(flags)
              if (!mode) { sftp.status(reqid, STATUS_CODE.FAILURE); return }
              const fd = openSync(toLocal(filename), mode, attrs?.mode ?? 0o666)
              sftp.handle(reqid, makeHandle({ kind: 'file', path: filename, fd }))
            } catch (error) { fail(reqid, error) }
          })
          sftp.on('READ', (reqid, handle, offset, length) => {
            const entry = handleOf(handle)
            if (!entry || entry.kind !== 'file' || entry.fd === undefined) { sftp.status(reqid, STATUS_CODE.FAILURE); return }
            const buffer = Buffer.alloc(length)
            try {
              const bytes = readSync(entry.fd, buffer, 0, length, offset)
              if (bytes === 0) sftp.status(reqid, STATUS_CODE.EOF)
              else sftp.data(reqid, buffer.subarray(0, bytes))
            } catch (error) { fail(reqid, error) }
          })
          sftp.on('WRITE', (reqid, handle, offset, data) => {
            const entry = handleOf(handle)
            if (!entry || entry.kind !== 'file' || entry.fd === undefined) { sftp.status(reqid, STATUS_CODE.FAILURE); return }
            try {
              writeSync(entry.fd, data, 0, data.length, offset)
              sftp.status(reqid, STATUS_CODE.OK)
            } catch (error) { fail(reqid, error) }
          })
          sftp.on('FSTAT', (reqid, handle) => {
            const entry = handleOf(handle)
            if (!entry || entry.fd === undefined) { sftp.status(reqid, STATUS_CODE.FAILURE); return }
            try { sftp.attrs(reqid, attrsOf(fstatSync(entry.fd))) } catch (error) { fail(reqid, error) }
          })
          sftp.on('CLOSE', (reqid, handle) => {
            const entry = handleOf(handle)
            if (!entry) { sftp.status(reqid, STATUS_CODE.FAILURE); return }
            if (entry.fd !== undefined) { try { closeSync(entry.fd) } catch { /* ignore */ } }
            handles.delete(handle.readUInt32BE(0))
            sftp.status(reqid, STATUS_CODE.OK)
          })
          sftp.on('MKDIR', (reqid, path) => {
            try { mkdirSync(toLocal(path)); sftp.status(reqid, STATUS_CODE.OK) } catch (error) { fail(reqid, error) }
          })
          sftp.on('RMDIR', (reqid, path) => {
            try { rmdirSync(toLocal(path)); sftp.status(reqid, STATUS_CODE.OK) } catch (error) { fail(reqid, error) }
          })
          sftp.on('REMOVE', (reqid, path) => {
            try { unlinkSync(toLocal(path)); sftp.status(reqid, STATUS_CODE.OK) } catch (error) { fail(reqid, error) }
          })
          sftp.on('RENAME', (reqid, oldPath, newPath) => {
            try { renameSync(toLocal(oldPath), toLocal(newPath)); sftp.status(reqid, STATUS_CODE.OK) } catch (error) { fail(reqid, error) }
          })
          sftp.on('SETSTAT', (reqid) => sftp.status(reqid, STATUS_CODE.OK))
          sftp.on('FSETSTAT', (reqid) => sftp.status(reqid, STATUS_CODE.OK))
          sftp.on('READLINK', (reqid) => sftp.status(reqid, STATUS_CODE.OP_UNSUPPORTED))
          sftp.on('SYMLINK', (reqid) => sftp.status(reqid, STATUS_CODE.OP_UNSUPPORTED))
        })
      })
    })
  })
  sshServer.on('error', () => undefined)
  const port = await freePort()
  await new Promise<void>((resolve, reject) => {
    netServer = sshServer.listen(port, '127.0.0.1', () => resolve())
    netServer.once('error', reject)
  })
  if (!netServer) throw new Error('failed to start SFTP server')
  return { server: sshServer, net: netServer, port }
}

describe('SFTP adapter over a real SSH server', () => {
  let dir = ''
  let ssh: { server: Server; net: NetServer; port: number }
  let adapter: SftpAdapter
  let serverRecord: ServerRecord
  let fingerprint = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-server-directory-sftp-'))
    ssh = await startSftpServer(dir)
    serverRecord = {
      id: 'sftp-test',
      name: 'local',
      protocol: 'sftp',
      host: '127.0.0.1',
      port: ssh.port,
      username: 'u',
      allowInvalidCert: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    adapter = new SftpAdapter({ server: serverRecord, password: 'p' })
  })

  afterEach(async () => {
    await adapter?.close()
    await new Promise<void>(resolve => ssh?.net.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  })

  it('requires explicit host-key trust before authenticating', async () => {
    fingerprint = await expectUnknownHostKey(adapter)
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/)

    const connected = await adapter.connect({ trust: true, expectedFingerprint: fingerprint })
    expect(connected.home).toBe('/')
  })

  it('lists, creates, uploads, downloads, renames and recursively deletes', async () => {
    fingerprint = await expectUnknownHostKey(adapter)
    await adapter.connect({ trust: true, expectedFingerprint: fingerprint })

    expect((await adapter.list('/')).entries).toHaveLength(0)
    await adapter.mkdir('/docs')
    await adapter.mkdir('/docs/sub')

    const uploaded = await adapter.upload(Readable.from('hello sftp'), '/docs', 'a.txt', false)
    expect(uploaded).toBe('/docs/a.txt')
    expect(readFileSync(join(dir, 'docs', 'a.txt'), 'utf8')).toBe('hello sftp')
    await expect(adapter.upload(Readable.from('nope'), '/docs', 'a.txt', false)).rejects.toMatchObject({ code: 'conflict' })
    await adapter.upload(Readable.from('replaced'), '/docs', 'a.txt', true)
    expect(readFileSync(join(dir, 'docs', 'a.txt'), 'utf8')).toBe('replaced')

    const listing = await adapter.list('/docs')
    const file = listing.entries.find(entry => entry.name === 'a.txt')
    expect(file?.kind).toBe('file')
    expect(file?.size).toBe(8)

    const chunks: Buffer[] = []
    await adapter.download('/docs/a.txt', new Writable({
      write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback() },
    }))
    expect(Buffer.concat(chunks).toString('utf8')).toBe('replaced')

    await adapter.rename('/docs/a.txt', '/docs/b.txt')
    expect((await adapter.list('/docs')).entries.map(entry => entry.name)).toContain('b.txt')

    await adapter.removeTree('/docs')
    expect((await adapter.list('/')).entries).toHaveLength(0)
    await expect(readFile(join(dir, 'docs', 'b.txt'))).rejects.toThrow()
  })

  it('reports a wrong password without hanging', async () => {
    fingerprint = await expectUnknownHostKey(adapter)
    const bad = new SftpAdapter({ server: serverRecord, password: 'wrong' })
    await expect(bad.connect({ trust: true, expectedFingerprint: fingerprint })).rejects.toMatchObject({ code: 'auth_failed' })
    await bad.close()
  })
})
