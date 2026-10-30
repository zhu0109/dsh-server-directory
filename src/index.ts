/**
 * Host half of dsh-server-directory.
 *
 * Owns the server inventory, protocol connections, and the fenced HTTP API
 * used by the sidebar tab. Browser requests never receive a password.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { HostContext, ConnectionService, LoggerLike } from './host/context.js'
import { mapError } from './host/errors.js'
import { readJsonBody, ServerDirectoryApi } from './host/api.js'
import { ConnectionPool } from './host/pool.js'
import { resolveDataDir, ServerStore } from './host/store.js'

export const name = 'dsh-server-directory'
export const inject = ['webServer']

const ROUTE_PREFIX = '/dsh-server-directory'
const API_ROOT = `${ROUTE_PREFIX}/api`
const API_PREFIX = `${API_ROOT}/`

function sendJson(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  if (res.headersSent) {
    res.destroy()
    return
  }
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  res.end(body)
}

function sendFailure(res: ServerResponse, error: unknown, logger?: LoggerLike): void {
  const mapped = mapError(error)
  if (mapped.code === 'internal') {
    logger?.error?.('[dsh-server-directory] request failed', error)
  } else {
    logger?.warn?.(`[dsh-server-directory] ${mapped.code}: ${mapped.message}`)
  }
  if (res.headersSent) {
    res.destroy()
    return
  }
  sendJson(res, mapped.status, {
    ok: false,
    code: mapped.code,
    error: mapped.message,
    ...(mapped.details ? mapped.details : {}),
  })
}

function isLoopback(address: string | undefined): boolean {
  if (!address) return false
  const value = address.toLowerCase()
  return value === '::1' || value === '127.0.0.1' || value.startsWith('127.') || value === '::ffff:127.0.0.1'
}

function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false
  const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase()
  return name === 'localhost' || name === '127.0.0.1' || name === '::1'
}

/**
 * DSH's connection service is the primary trust authority. When a composition
 * has no connection service, this fallback accepts only loopback requests and
 * rejects cross-origin browser requests.
 */
function createFence(ctx: HostContext): (req: IncomingMessage) => boolean {
  return (req) => {
    let connection: ConnectionService | undefined
    try {
      connection = ctx.get('connection', true) as ConnectionService | undefined
    } catch {
      connection = undefined
    }
    if (connection && typeof connection.requestRejection === 'function') {
      try {
        return connection.requestRejection(req) === undefined
      } catch {
        return false
      }
    }

    if (!isLoopback(req.socket.remoteAddress)) return false
    const hostHeader = typeof req.headers.host === 'string' ? req.headers.host : undefined
    if (hostHeader && !isLoopbackHost(hostHeader)) return false
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
    if (origin) {
      try {
        const parsed = new URL(origin)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'dsh-app:') {
          return false
        }
        if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !isLoopbackHost(parsed.host)) {
          return false
        }
      } catch {
        return false
      }
    }
    return true
  }
}

export function apply(ctx: HostContext): void {
  const logger = ctx.logger
  const store = new ServerStore({ dataDir: resolveDataDir(), logger })
  void store.init().catch(error => {
    logger?.error?.('[dsh-server-directory] cannot initialize data directory', error)
  })
  const pool = new ConnectionPool(store)
  const api = new ServerDirectoryApi({ store, pool })
  const fence = createFence(ctx)

  ctx.effect(() => {
    const disposers: Array<() => void> = []
    const register = (route: {
      kind: 'exact' | 'prefix'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
    }): void => {
      disposers.push(ctx.webServer.register(route))
    }

    register({
      kind: 'prefix',
      path: API_ROOT,
      handler: async (req, res) => {
        if (!fence(req)) {
          sendJson(res, 403, { ok: false, code: 'permission_denied', error: 'forbidden' })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, code: 'bad_request', error: 'method not allowed' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://dsh.internal')
        if (!url.pathname.startsWith(API_PREFIX)) {
          sendJson(res, 404, { ok: false, code: 'not_found', error: 'not found' })
          return
        }
        const method = url.pathname.slice(API_PREFIX.length)
        if (!method || method.includes('/')) {
          sendJson(res, 404, { ok: false, code: 'not_found', error: 'not found' })
          return
        }
        try {
          const body = await readJsonBody(req)
          const result = await api.call(method, body)
          sendJson(res, 200, { ok: true, ...result })
        } catch (error) {
          sendFailure(res, error, logger)
        }
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/upload`,
      handler: async (req, res) => {
        if (!fence(req)) {
          sendJson(res, 403, { ok: false, code: 'permission_denied', error: 'forbidden' })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, code: 'bad_request', error: 'method not allowed' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://dsh.internal')
        try {
          const result = await api.upload(req, url.searchParams)
          sendJson(res, 200, { ok: true, ...result })
        } catch (error) {
          sendFailure(res, error, logger)
        }
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/download`,
      handler: async (req, res) => {
        if (!fence(req)) {
          sendJson(res, 403, { ok: false, code: 'permission_denied', error: 'forbidden' })
          return
        }
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, code: 'bad_request', error: 'method not allowed' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://dsh.internal')
        try {
          await api.download(url.searchParams, res)
        } catch (error) {
          sendFailure(res, error, logger)
        }
      },
    })

    logger?.info?.(`[dsh-server-directory] mounted ${disposers.length} routes`)
    return () => {
      for (const dispose of disposers.splice(0)) {
        try { dispose() } catch { /* already disposed */ }
      }
    }
  }, 'dsh-server-directory: routes')

  ctx.effect(
    () => () => { void pool.closeAll() },
    'dsh-server-directory: connections',
  )
}
