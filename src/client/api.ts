import type {
  ApiFailure,
  ConnectionStatus,
  PublicServer,
  RemoteEntry,
  RemoteListing,
  ServerProtocol,
} from './types.js'

const ROUTE_ROOT = 'dsh-server-directory'

/**
 * Resolve against the page base, not the origin root. This keeps the plugin
 * working behind reverse-proxy path prefixes and inside the desktop shell.
 */
export function routeUrl(path: string): string {
  const raw = typeof document !== 'undefined' ? document.baseURI : 'http://dsh.internal/'
  const base = new URL(raw, 'http://dsh.internal/')
  base.search = ''
  base.hash = ''
  if (!base.pathname.endsWith('/')) base.pathname += '/'
  return new URL(path.replace(/^\/+/u, ''), base).href
}

export class ApiError extends Error {
  code: string
  data: ApiFailure & Record<string, unknown>

  constructor(code: string, message: string, data: ApiFailure & Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.data = data
  }
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  let data: Record<string, unknown> = {}
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new ApiError('internal', `服务器返回了无法解析的响应（HTTP ${response.status}）。`, {})
    }
  }
  const failed = !response.ok || data.ok === false
  if (failed) {
    const code = typeof data.code === 'string' ? data.code : 'internal'
    const message = typeof data.error === 'string' ? data.error : `请求失败（HTTP ${response.status}）`
    throw new ApiError(code, message, data as ApiFailure & Record<string, unknown>)
  }
  return data
}

async function post(method: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(routeUrl(`${ROUTE_ROOT}/api/${method}`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch (error) {
    throw new ApiError('connection_failed', error instanceof Error ? error.message : '无法连接 DSH 主机服务。', {})
  }
  return parseResponse(response)
}

export interface ServerPayload {
  id?: string
  name: string
  protocol: ServerProtocol
  host: string
  port: number
  username: string
  password?: string
  allowInvalidCert: boolean
}

export const api = {
  async listServers(): Promise<PublicServer[]> {
    const result = await post('listServers')
    return Array.isArray(result.servers) ? result.servers as PublicServer[] : []
  },

  async saveServer(server: ServerPayload): Promise<PublicServer> {
    const result = await post('saveServer', { server })
    return result.server as PublicServer
  },

  async deleteServer(id: string): Promise<void> {
    await post('deleteServer', { id })
  },

  async connect(id: string, options: {
    trustHostKey?: boolean
    hostKeyFingerprint?: string
    acceptChangedHostKey?: boolean
  } = {}): Promise<{ home: string; fingerprint?: string; status: ConnectionStatus }> {
    return await post('connect', { id, ...options }) as { home: string; fingerprint?: string; status: ConnectionStatus }
  },

  async disconnect(id: string): Promise<void> {
    await post('disconnect', { id })
  },

  async statuses(): Promise<ConnectionStatus[]> {
    const result = await post('status')
    return Array.isArray(result.statuses) ? result.statuses as ConnectionStatus[] : []
  },

  async list(id: string, path?: string): Promise<RemoteListing> {
    return await post('list', { id, path }) as unknown as RemoteListing
  },

  async stat(id: string, path: string): Promise<{ stat: RemoteEntry }> {
    return await post('stat', { id, path }) as unknown as { stat: RemoteEntry }
  },

  async mkdir(id: string, parent: string, name: string): Promise<string> {
    const result = await post('mkdir', { id, parent, name })
    return String(result.path ?? '')
  },

  async rename(id: string, path: string, newName: string): Promise<string> {
    const result = await post('rename', { id, path, newName })
    return String(result.path ?? '')
  },

  async remove(id: string, path: string): Promise<void> {
    await post('delete', { id, path })
  },

  downloadUrl(id: string, path: string): string {
    const params = new URLSearchParams({ serverId: id, path })
    return routeUrl(`${ROUTE_ROOT}/download?${params.toString()}`)
  },
}

export interface UploadTask {
  file: File
  directory: { serverId: string; path: string }
  overwrite: boolean
  onProgress?: (loaded: number, total: number) => void
  signal?: AbortSignal
}

/** Upload one file with progress. Rejects ApiError for a JSON failure. */
export function uploadFile(task: UploadTask): Promise<{ path: string }> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      serverId: task.directory.serverId,
      dir: task.directory.path,
      name: task.file.name,
      overwrite: task.overwrite ? '1' : '0',
    })
    const xhr = new XMLHttpRequest()
    xhr.open('POST', routeUrl(`${ROUTE_ROOT}/upload?${params.toString()}`))
    xhr.responseType = 'text'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) task.onProgress?.(event.loaded, event.total)
    }
    xhr.onerror = () => reject(new ApiError('connection_failed', '上传连接中断。', {}))
    xhr.onabort = () => reject(new DOMException('上传已取消', 'AbortError'))
    xhr.onload = () => {
      let data: Record<string, unknown> = {}
      if (xhr.responseText) {
        try { data = JSON.parse(xhr.responseText) as Record<string, unknown> }
        catch {
          reject(new ApiError('internal', `上传响应无法解析（HTTP ${xhr.status}）。`, {}))
          return
        }
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.ok !== false) {
        resolve({ path: String(data.path ?? '') })
        return
      }
      reject(new ApiError(
        typeof data.code === 'string' ? data.code : 'internal',
        typeof data.error === 'string' ? data.error : `上传失败（HTTP ${xhr.status}）`,
        data as ApiFailure & Record<string, unknown>,
      ))
    }
    const abort = (): void => xhr.abort()
    task.signal?.addEventListener('abort', abort, { once: true })
    xhr.onloadend = () => task.signal?.removeEventListener('abort', abort)
    xhr.send(task.file)
  })
}
