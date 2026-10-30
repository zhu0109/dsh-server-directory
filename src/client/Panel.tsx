import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { ApiError, api, uploadFile, type ServerPayload } from './api.js'
import type {
  ConnectionStatus,
  PublicServer,
  RemoteEntry,
  RemoteListing,
  ServerFormValues,
} from './types.js'
import {
  ChevronIcon,
  DownloadIcon,
  EditIcon,
  FileIcon,
  FolderIcon,
  LinkIcon,
  PlusIcon,
  RefreshIcon,
  ServerIcon,
  SettingsIcon,
  TrashIcon,
  UnknownIcon,
  UpIcon,
  UploadIcon,
  CloseIcon,
} from './icons.js'
import {
  ConfirmModal,
  HostKeyModal,
  NameModal,
  ServerFormModal,
  ServerManagerModal,
} from './modals.js'

const ACTIVE_KEY = 'dsh-server-directory:active'
const PATHS_KEY = 'dsh-server-directory:paths'

type PanelModal =
  | { type: 'servers' }
  | { type: 'server-form'; server?: PublicServer }
  | { type: 'hostkey'; server: PublicServer; fingerprint: string; previous?: string; changed: boolean }
  | { type: 'name'; mode: 'mkdir' | 'rename'; directory: string; entry?: RemoteEntry }
  | null

interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  resolve: (value: boolean) => void
}

interface ContextMenuState {
  x: number
  y: number
  entry?: RemoteEntry
  directory: string
}

type UploadStatus = 'pending' | 'uploading' | 'done' | 'error' | 'canceled'

interface UploadItem {
  key: string
  name: string
  loaded: number
  total: number
  status: UploadStatus
  error?: string
}

function readStoredActive(): string | undefined {
  try {
    return localStorage.getItem(ACTIVE_KEY) || undefined
  } catch {
    return undefined
  }
}

function persistActive(id: string | undefined): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch { /* ignore quota/privacy mode */ }
}

function readStoredPaths(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(PATHS_KEY) ?? '{}') as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.startsWith('/')) result[key] = value
    }
    return result
  } catch {
    return {}
  }
}

function persistPaths(paths: Record<string, string>): void {
  try { localStorage.setItem(PATHS_KEY, JSON.stringify(paths)) } catch { /* ignore */ }
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return bytes === 0 ? '0 B' : ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

function formatTime(mtime: number): string {
  if (!mtime) return ''
  try {
    const date = new Date(mtime)
    if (date.getFullYear() === new Date().getFullYear()) {
      return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return ''
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function protocolLabel(server: PublicServer): string {
  if (server.protocol === 'sftp') return 'SFTP'
  if (server.protocol === 'ftp') return 'FTP'
  if (server.protocol === 'ftps') return 'FTPS'
  return 'FTPS (implicit)'
}

function endpointOf(server: PublicServer): string {
  return `${server.username}@${server.host}:${server.port}`
}

function joinRemote(directory: string, name: string): string {
  return directory === '/' ? `/${name}` : `${directory.replace(/\/+$/u, '')}/${name}`
}

function parentOf(path: string): string {
  if (path === '/' || path === '') return '/'
  const index = path.replace(/\/+$/u, '').lastIndexOf('/')
  return index <= 0 ? '/' : path.slice(0, index)
}

function entryIcon(entry: RemoteEntry): ReactNode {
  if (entry.kind === 'directory') return <FolderIcon size={16} />
  if (entry.kind === 'file') return <FileIcon size={16} />
  if (entry.kind === 'symlink') return <LinkIcon size={16} />
  return <UnknownIcon size={16} />
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function crumbsOf(path: string): Array<{ label: string; path: string }> {
  if (!path || path === '/') return [{ label: '/', path: '/' }]
  const parts = path.split('/').filter(Boolean)
  const result: Array<{ label: string; path: string }> = [{ label: '/', path: '/' }]
  let current = ''
  for (const part of parts) {
    current += `/${part}`
    result.push({ label: part, path: current })
  }
  if (result.length > 6) {
    return [result[0], { label: '…', path: result[result.length - 3].path }, ...result.slice(-3)]
  }
  return result
}

function mergeStatus(server: PublicServer, status: ConnectionStatus | undefined): PublicServer {
  return {
    ...server,
    connection: status ?? { serverId: server.id, state: 'disconnected' },
  }
}

export function ServerDirectoryPanel({ visible }: { visible: boolean }): ReactNode {
  const [servers, setServers] = useState<PublicServer[]>([])
  const [activeId, setActiveId] = useState<string | undefined>(readStoredActive)
  const [paths, setPaths] = useState<Record<string, string>>(readStoredPaths)
  const [listing, setListing] = useState<RemoteListing | null>(null)
  const [currentPath, setCurrentPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | undefined>()
  const [modal, setModal] = useState<PanelModal>(null)
  const [modalError, setModalError] = useState('')
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [editingPath, setEditingPath] = useState(false)
  const [pathDraft, setPathDraft] = useState('')
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const serversRef = useRef(servers)
  serversRef.current = servers
  const currentPathRef = useRef(currentPath)
  currentPathRef.current = currentPath
  const pathsRef = useRef(paths)
  pathsRef.current = paths
  const loadSeq = useRef(0)
  const uploadSeq = useRef(0)
  const uploadControllers = useRef(new Map<string, AbortController>())
  const dragDepth = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingUploadDir = useRef<string>('')
  const contextRef = useRef<HTMLDivElement>(null)

  const activeServer = servers.find(server => server.id === activeId)
  const activeState = activeServer?.connection?.state ?? 'disconnected'
  const connected = activeState === 'connected'
  const busyNow = busy !== ''
  const entries = listing?.entries ?? []

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(''), 3200)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!contextMenu) return undefined
    const close = (event: MouseEvent): void => {
      if (contextRef.current?.contains(event.target as Node)) return
      setContextMenu(null)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    const onScroll = (): void => setContextMenu(null)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [contextMenu])

  useEffect(() => {
    return () => {
      for (const controller of uploadControllers.current.values()) controller.abort()
      uploadControllers.current.clear()
    }
  }, [])

  const loadDirectoryFor = async (serverId: string, path: string): Promise<void> => {
    const seq = ++loadSeq.current
    setLoading(true)
    setError('')
    try {
      const result = await api.list(serverId, path)
      if (seq !== loadSeq.current) return
      setListing(result)
      setCurrentPath(result.path)
      setSelectedPath(undefined)
      const nextPaths = { ...pathsRef.current, [serverId]: result.path }
      setPaths(nextPaths)
      persistPaths(nextPaths)
    } catch (loadError) {
      if (seq !== loadSeq.current) return
      setError(errorText(loadError))
      if (loadError instanceof ApiError && (loadError.code === 'not_connected' || loadError.code === 'disconnected')) {
        setListing(null)
        try {
          const refreshed = await api.listServers()
          setServers(refreshed)
        } catch { /* status refresh is best effort */ }
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }

  const refreshServers = async (): Promise<PublicServer[]> => {
    const refreshed = await api.listServers()
    setServers(refreshed)
    return refreshed
  }

  useEffect(() => {
    if (!visible) return undefined
    let cancelled = false
    const boot = async (): Promise<void> => {
      setError('')
      try {
        const refreshed = await api.listServers()
        if (cancelled) return
        setServers(refreshed)
        let id = activeIdRef.current
        if (!id || !refreshed.some(server => server.id === id)) {
          id = refreshed[0]?.id
          setActiveId(id)
          persistActive(id)
        }
        if (!id) {
          setListing(null)
          setCurrentPath('')
          return
        }
        const server = refreshed.find(item => item.id === id)
        if (server?.connection?.state === 'connected') {
          const path = pathsRef.current[id] || server.connection.home || '/'
          await loadDirectoryFor(id, path)
        } else {
          setListing(null)
          setCurrentPath(pathsRef.current[id] ?? '')
        }
      } catch (bootError) {
        if (!cancelled) setError(errorText(bootError))
      }
    }
    void boot()
    const timer = setInterval(() => {
      if (cancelled) return
      void api.statuses().then(statuses => {
        if (cancelled) return
        const map = new Map(statuses.map(status => [status.serverId, status]))
        setServers(previous => previous.map(server => mergeStatus(server, map.get(server.id))))
      }).catch(() => { /* silent poll */ })
    }, 5000)
    return () => {
      cancelled = true
      clearInterval(timer)
      loadSeq.current += 1
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const selectServer = (server: PublicServer): void => {
    setActiveId(server.id)
    persistActive(server.id)
    setSelectedPath(undefined)
    setError('')
    setContextMenu(null)
    if (server.connection?.state === 'connected') {
      const path = pathsRef.current[server.id] || server.connection.home || '/'
      setCurrentPath(path)
      void loadDirectoryFor(server.id, path)
    } else {
      loadSeq.current += 1
      setLoading(false)
      setListing(null)
      setCurrentPath(pathsRef.current[server.id] ?? '')
    }
  }

  const askConfirm = (options: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmRequest({ ...options, resolve })
    })
  }

  const settleConfirm = (value: boolean): void => {
    confirmRequest?.resolve(value)
    setConfirmRequest(null)
  }

  const connectServer = async (
    server: PublicServer,
    options: { trustHostKey?: boolean; hostKeyFingerprint?: string; acceptChangedHostKey?: boolean } = {},
  ): Promise<void> => {
    setBusy(`connect:${server.id}`)
    setError('')
    try {
      const result = await api.connect(server.id, options)
      const refreshed = await refreshServers()
      setActiveId(server.id)
      persistActive(server.id)
      const nextPaths = { ...pathsRef.current, [server.id]: result.home }
      setPaths(nextPaths)
      persistPaths(nextPaths)
      setCurrentPath(result.home)
      setModal(null)
      setModalError('')
      setNotice(`已连接 ${server.name || server.host}`)
      if (refreshed.some(item => item.id === server.id)) {
        await loadDirectoryFor(server.id, result.home)
      }
    } catch (connectError) {
      if (connectError instanceof ApiError
        && (connectError.code === 'unknown_host_key' || connectError.code === 'host_key_changed')) {
        const fingerprint = typeof connectError.data.fingerprint === 'string' ? connectError.data.fingerprint : ''
        if (fingerprint) {
          setModal({
            type: 'hostkey',
            server,
            fingerprint,
            previous: typeof connectError.data.previous === 'string' ? connectError.data.previous : undefined,
            changed: connectError.code === 'host_key_changed',
          })
          setModalError('')
        } else {
          setError(connectError.message)
        }
      } else {
        setError(errorText(connectError))
      }
      try { await refreshServers() } catch { /* best effort */ }
    } finally {
      setBusy('')
    }
  }

  const disconnectServer = async (server: PublicServer): Promise<void> => {
    setBusy(`disconnect:${server.id}`)
    setError('')
    try {
      await api.disconnect(server.id)
      await refreshServers()
      if (server.id === activeIdRef.current) {
        setListing(null)
      }
      setNotice('已断开连接')
    } catch (disconnectError) {
      setError(errorText(disconnectError))
    } finally {
      setBusy('')
    }
  }

  const saveServer = async (values: ServerFormValues): Promise<void> => {
    setBusy('save-server')
    setModalError('')
    try {
      const payload: ServerPayload = {
        id: values.id,
        name: values.name,
        protocol: values.protocol,
        host: values.host,
        port: Number(values.port),
        username: values.username,
        allowInvalidCert: values.allowInvalidCert,
        ...(values.password ? { password: values.password } : {}),
      }
      const saved = await api.saveServer(payload)
      const refreshed = await refreshServers()
      setActiveId(saved.id)
      persistActive(saved.id)
      setModal(null)
      setNotice(values.id ? '服务器已更新' : '服务器已保存')
      const savedServer = refreshed.find(item => item.id === saved.id)
      if (savedServer?.connection?.state === 'connected') {
        const path = pathsRef.current[saved.id] || savedServer.connection.home || '/'
        await loadDirectoryFor(saved.id, path)
      } else {
        loadSeq.current += 1
        setLoading(false)
        setListing(null)
        setCurrentPath(pathsRef.current[saved.id] ?? '')
      }
    } catch (saveError) {
      setModalError(errorText(saveError))
    } finally {
      setBusy('')
    }
  }

  const deleteServer = async (server: PublicServer): Promise<void> => {
    const ok = await askConfirm({
      title: '删除服务器',
      message: `确定删除“${server.name || server.host}”吗？\n保存的密码和主机指纹会一并删除，此操作不可撤销。`,
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    setBusy(`delete:${server.id}`)
    setError('')
    try {
      await api.deleteServer(server.id)
      const refreshed = await refreshServers()
      if (server.id === activeIdRef.current) {
        const next = refreshed[0]
        setActiveId(next?.id)
        persistActive(next?.id)
        setListing(null)
        setCurrentPath(next ? (pathsRef.current[next.id] ?? '') : '')
        if (next?.connection?.state === 'connected') {
          const path = pathsRef.current[next.id] || next.connection.home || '/'
          await loadDirectoryFor(next.id, path)
        }
      }
      setNotice('服务器已删除')
    } catch (deleteError) {
      setError(errorText(deleteError))
    } finally {
      setBusy('')
    }
  }

  const openDirectory = (entry: RemoteEntry): void => {
    if (activeIdRef.current) void loadDirectoryFor(activeIdRef.current, entry.path)
  }

  const enterEntry = (entry: RemoteEntry): void => {
    if (entry.kind === 'directory' || entry.kind === 'symlink') openDirectory(entry)
  }

  const reloadCurrent = (): void => {
    if (activeIdRef.current) void loadDirectoryFor(activeIdRef.current, currentPathRef.current)
  }

  const goUp = (): void => {
    if (currentPath === '/') return
    if (activeIdRef.current) void loadDirectoryFor(activeIdRef.current, parentOf(currentPath))
  }

  const download = (entry: RemoteEntry): void => {
    if (!activeId) return
    const anchor = document.createElement('a')
    anchor.href = api.downloadUrl(activeId, entry.path)
    anchor.rel = 'noopener'
    anchor.download = entry.name
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  const submitName = async (name: string): Promise<void> => {
    if (!activeId || modal?.type !== 'name') return
    setBusy('name')
    setModalError('')
    try {
      if (modal.mode === 'mkdir') {
        await api.mkdir(activeId, modal.directory, name)
        setNotice('文件夹已创建')
      } else if (modal.entry) {
        await api.rename(activeId, modal.entry.path, name)
        setNotice('已重命名')
      }
      setModal(null)
      await loadDirectoryFor(activeId, currentPathRef.current)
    } catch (nameError) {
      setModalError(errorText(nameError))
    } finally {
      setBusy('')
    }
  }

  const deleteEntry = async (entry: RemoteEntry): Promise<void> => {
    if (!activeId) return
    const isDirectory = entry.kind === 'directory'
    const ok = await askConfirm({
      title: isDirectory ? '递归删除目录' : '删除文件',
      message: isDirectory
        ? `将递归删除目录“${entry.name}”及其中的全部内容，无法恢复。\n继续吗？`
        : `确定删除“${entry.name}”吗？此操作无法恢复。`,
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    setBusy('delete-entry')
    setError('')
    try {
      await api.remove(activeId, entry.path)
      setSelectedPath(undefined)
      setNotice('已删除')
      await loadDirectoryFor(activeId, currentPathRef.current)
    } catch (deleteError) {
      setError(errorText(deleteError))
    } finally {
      setBusy('')
    }
  }

  const updateUpload = (key: string, patch: Partial<UploadItem>): void => {
    setUploads(previous => previous.map(item => item.key === key ? { ...item, ...patch } : item))
  }

  const uploadFiles = async (files: File[], directory: string): Promise<void> => {
    const serverId = activeIdRef.current
    if (!serverId || files.length === 0) return
    setError('')
    for (const file of files) {
      const key = `upload-${++uploadSeq.current}`
      const item: UploadItem = { key, name: file.name, loaded: 0, total: file.size, status: 'pending' }
      setUploads(previous => [...previous, item])
      try {
        const target = joinRemote(directory, file.name)
        let existing = false
        try {
          const stat = await api.stat(serverId, target)
          if (stat.stat.kind === 'directory') {
            updateUpload(key, { status: 'error', error: '同名目录已存在' })
            continue
          }
          existing = true
        } catch (statError) {
          if (!(statError instanceof ApiError && statError.code === 'not_found')) throw statError
        }
        if (existing) {
          const ok = await askConfirm({
            title: '覆盖文件',
            message: `目标目录中已存在“${file.name}”。\n确定覆盖吗？`,
            confirmLabel: '覆盖上传',
            danger: true,
          })
          if (!ok) {
            updateUpload(key, { status: 'canceled' })
            continue
          }
        }
        const controller = new AbortController()
        uploadControllers.current.set(key, controller)
        updateUpload(key, { status: 'uploading' })
        await uploadFile({
          file,
          directory: { serverId, path: directory },
          overwrite: existing,
          signal: controller.signal,
          onProgress: (loaded, total) => updateUpload(key, { loaded, total }),
        })
        updateUpload(key, { status: 'done', loaded: file.size, total: file.size })
      } catch (uploadError) {
        if (uploadError instanceof DOMException && uploadError.name === 'AbortError') {
          updateUpload(key, { status: 'canceled' })
        } else {
          updateUpload(key, { status: 'error', error: errorText(uploadError) })
        }
      } finally {
        uploadControllers.current.delete(key)
      }
    }
    if (currentPathRef.current === directory) reloadCurrent()
  }

  const chooseUpload = (directory: string): void => {
    pendingUploadDir.current = directory
    fileInputRef.current?.click()
  }

  const onFileInput = (files: FileList | null): void => {
    if (!files || files.length === 0) return
    const directory = pendingUploadDir.current || currentPathRef.current
    const list = Array.from(files)
    void uploadFiles(list, directory)
  }

  const openContext = (event: ReactMouseEvent, entry?: RemoteEntry): void => {
    event.preventDefault()
    event.stopPropagation()
    const directory = entry?.kind === 'directory' ? entry.path : currentPathRef.current
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 300)),
      entry,
      directory,
    })
    if (entry) setSelectedPath(entry.path)
  }

  const openNameModal = (mode: 'mkdir' | 'rename', directory: string, entry?: RemoteEntry): void => {
    setContextMenu(null)
    setModalError('')
    setModal({ type: 'name', mode, directory, entry })
  }

  const openServerForm = (server?: PublicServer): void => {
    setContextMenu(null)
    setModalError('')
    setModal({ type: 'server-form', server })
  }

  const onDropRoot = (event: DragEvent<HTMLDivElement>): void => {
    if (!hasFiles(event) || !connected) return
    event.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    setDropTarget(null)
    void uploadFiles(Array.from(event.dataTransfer.files), currentPathRef.current)
  }

  const onDropOnEntry = (event: DragEvent<HTMLElement>, entry: RemoteEntry): void => {
    if (!hasFiles(event) || entry.kind !== 'directory') return
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = 0
    setDragActive(false)
    setDropTarget(null)
    void uploadFiles(Array.from(event.dataTransfer.files), entry.path)
  }

  const renderContextMenu = (): ReactNode => {
    if (!contextMenu) return null
    const { entry } = contextMenu
    const close = (): void => setContextMenu(null)
    return (
      <div ref={contextRef} className="dsd-ctx" style={{ left: contextMenu.x, top: contextMenu.y }}>
        {entry ? (
          <>
            {(entry.kind === 'directory' || entry.kind === 'symlink') ? (
              <button type="button" onClick={() => { close(); openDirectory(entry) }}><FolderIcon size={14} /> 打开</button>
            ) : null}
            {entry.kind !== 'directory' ? (
              <button type="button" onClick={() => { close(); download(entry) }}><DownloadIcon size={14} /> 下载</button>
            ) : (
              <button type="button" onClick={() => { close(); chooseUpload(entry.path) }}><UploadIcon size={14} /> 上传到此目录</button>
            )}
            {entry.kind === 'directory' ? (
              <button type="button" onClick={() => openNameModal('mkdir', entry.path)}><PlusIcon size={14} /> 在此新建文件夹</button>
            ) : null}
            <hr />
            <button type="button" onClick={() => openNameModal('rename', contextMenu.directory, entry)}><EditIcon size={14} /> 重命名</button>
            <button type="button" className="danger" onClick={() => { close(); void deleteEntry(entry) }}><TrashIcon size={14} /> 删除</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => { close(); reloadCurrent() }}><RefreshIcon size={14} /> 刷新</button>
            <button type="button" onClick={() => openNameModal('mkdir', contextMenu.directory)}><PlusIcon size={14} /> 新建文件夹</button>
            <button type="button" onClick={() => { close(); chooseUpload(contextMenu.directory) }}><UploadIcon size={14} /> 上传文件</button>
          </>
        )}
      </div>
    )
  }

  const renderServerManager = (): ReactNode => {
    if (modal?.type !== 'servers') return null
    return (
      <ServerManagerModal
        servers={servers}
        activeId={activeId}
        busy={busyNow}
        onClose={() => setModal(null)}
        onAdd={() => openServerForm()}
        onEdit={server => openServerForm(server)}
        onDelete={server => { void deleteServer(server) }}
        onSelect={server => { setModal(null); selectServer(server) }}
        onConnect={server => { setModal(null); void connectServer(server) }}
        onDisconnect={server => { void disconnectServer(server) }}
      />
    )
  }

  const renderServerForm = (): ReactNode => {
    if (modal?.type !== 'server-form') return null
    return (
      <ServerFormModal
        server={modal.server}
        key={modal.server?.id ?? 'new-server'}
        busy={busyNow}
        error={modalError}
        onCancel={() => { setModal(null); setModalError('') }}
        onSubmit={values => { void saveServer(values) }}
      />
    )
  }

  const renderHostKey = (): ReactNode => {
    if (modal?.type !== 'hostkey') return null
    return (
      <HostKeyModal
        endpoint={endpointOf(modal.server)}
        fingerprint={modal.fingerprint}
        previous={modal.previous}
        changed={modal.changed}
        busy={busyNow}
        onCancel={() => setModal(null)}
        onConfirm={() => {
          const server = modal.server
          const fingerprint = modal.fingerprint
          const changed = modal.changed
          setModal(null)
          void connectServer(server, {
            trustHostKey: true,
            hostKeyFingerprint: fingerprint,
            acceptChangedHostKey: changed,
          })
        }}
      />
    )
  }

  const renderNameModal = (): ReactNode => {
    if (modal?.type !== 'name') return null
    const rename = modal.mode === 'rename'
    return (
      <NameModal
        key={`${modal.mode}:${modal.entry?.path ?? modal.directory}`}
        title={rename ? '重命名' : '新建文件夹'}
        label={rename ? '新名称' : '文件夹名称'}
        initial={rename ? modal.entry?.name : ''}
        confirmLabel={rename ? '重命名' : '创建'}
        busy={busyNow}
        error={modalError}
        onCancel={() => { setModal(null); setModalError('') }}
        onSubmit={name => { void submitName(name) }}
        hint={modal.mode === 'mkdir' ? `位置：${modal.directory}` : undefined}
      />
    )
  }

  const renderError = (): ReactNode => {
    if (!error) return null
    return (
      <div className="dsd-error">
        <span className="grow">{error}</span>
        <button className="dsd-icon-btn" type="button" title="关闭" onClick={() => setError('')}>
          <CloseIcon size={13} />
        </button>
      </div>
    )
  }

  const renderToolbar = (): ReactNode => (
    <div className="dsd-toolbar">
      <div className="dsd-server-picker">
        <span className={`dsd-dot${activeState === 'connected' ? ' on' : activeState === 'error' ? ' err' : ''}`} />
        {servers.length > 0 ? (
          <select
            className="dsd-select"
            value={activeId ?? ''}
            onChange={(event) => {
              const server = servers.find(item => item.id === event.target.value)
              if (server) selectServer(server)
            }}
            title="切换服务器"
          >
            {servers.map(server => (
              <option key={server.id} value={server.id}>
                {server.name || server.host} · {protocolLabel(server)}
              </option>
            ))}
          </select>
        ) : (
          <span className="dsd-select" style={{ display: 'flex', alignItems: 'center', opacity: .65 }}>未添加服务器</span>
        )}
      </div>
      <button className="dsd-icon-btn" type="button" title="服务器管理" onClick={() => setModal({ type: 'servers' })}>
        <SettingsIcon size={15} />
      </button>
      <button className="dsd-icon-btn" type="button" title="添加服务器" onClick={() => openServerForm()}>
        <PlusIcon size={15} />
      </button>
    </div>
  )

  const renderFootbar = (): ReactNode => {
    if (!activeServer) return null
    return (
      <div className="dsd-footbar">
        <span className={`dsd-dot${activeState === 'connected' ? ' on' : activeState === 'error' ? ' err' : ''}`} />
        <span className="grow" title={endpointOf(activeServer)}>
          {activeState === 'connected' ? (listing?.truncated ? '目录过大，仅显示前 5000 项' : `${entries.length} 项`) : '未连接'}
          {activeState === 'connected' ? ` · ${protocolLabel(activeServer)}` : ''}
        </span>
        {uploads.some(item => item.status === 'done' || item.status === 'error' || item.status === 'canceled') ? (
          <button className="dsd-btn subtle" type="button" style={{ minHeight: 20, padding: '0 5px' }}
            onClick={() => setUploads(items => items.filter(item => item.status === 'uploading' || item.status === 'pending'))}>
            清除记录
          </button>
        ) : null}
      </div>
    )
  }

  const renderUploads = (): ReactNode => {
    if (uploads.length === 0) return null
    return (
      <div className="dsd-uploads">
        {uploads.map(item => (
          <div className="dsd-upload-row" key={item.key}>
            <span className="name" title={item.name}>{item.name}</span>
            {item.status === 'uploading' ? (
              <>
                <div className="dsd-progress"><span style={{ width: `${item.total > 0 ? Math.min(100, Math.round(item.loaded / item.total * 100)) : 0}%` }} /></div>
                <span className="state">{item.total > 0 ? `${Math.round(item.loaded / item.total * 100)}%` : ''}</span>
                <button className="dsd-icon-btn" type="button" title="取消上传"
                  onClick={() => uploadControllers.current.get(item.key)?.abort()}><CloseIcon size={12} /></button>
              </>
            ) : (
              <span className={`state${item.status === 'error' ? ' err' : ''}`} title={item.error}>
                {item.status === 'pending' ? '等待' : item.status === 'done' ? '完成' : item.status === 'canceled' ? '已取消' : item.error || '失败'}
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  const renderConnectCard = (): ReactNode => {
    if (!activeServer) return null
    return (
      <>
        <div className="dsd-banner">
          <ServerIcon size={14} />
          <span className="grow">
            {protocolLabel(activeServer)} · {endpointOf(activeServer)}
          </span>
          <button className="dsd-icon-btn" type="button" title="编辑服务器" onClick={() => openServerForm(activeServer)}>
            <EditIcon size={14} />
          </button>
        </div>
        <div className="dsd-card">
          <div className="dsd-card-title">{activeServer.name || activeServer.host}</div>
          <div className="dsd-card-desc">
            {activeServer.connection?.lastError || '连接后即可浏览服务器目录、创建文件夹、上传和下载文件。'}
          </div>
          <div className="dsd-card-actions">
            <button className="dsd-btn primary" type="button" disabled={busyNow}
              onClick={() => { void connectServer(activeServer) }}>
              {busy === `connect:${activeServer.id}` ? <><span className="dsd-spinner" /> 连接中…</> : '连接服务器'}
            </button>
            <button className="dsd-btn" type="button" onClick={() => setModal({ type: 'servers' })}>管理服务器</button>
          </div>
        </div>
      </>
    )
  }

  const renderBrowser = (): ReactNode => (
    <>
      <div className="dsd-pathbar">
        <button className="dsd-icon-btn" type="button" title="上一级" disabled={busyNow || currentPath === '/'} onClick={goUp}>
          <UpIcon size={15} />
        </button>
        {editingPath ? (
          <form style={{ flex: 1, minWidth: 0, display: 'flex', gap: 4 }} onSubmit={(event) => {
            event.preventDefault()
            setEditingPath(false)
            if (activeIdRef.current && pathDraft.trim() !== '') {
              void loadDirectoryFor(activeIdRef.current, pathDraft)
            }
          }}>
            <input
              className="dsd-path-input"
              style={{ flex: 1 }}
              value={pathDraft}
              autoFocus
              spellCheck={false}
              onChange={event => setPathDraft(event.target.value)}
              onBlur={(event) => {
                const next = event.relatedTarget
                if (next instanceof Node && event.currentTarget.form?.contains(next)) return
                setEditingPath(false)
              }}
              placeholder="输入远端路径（Enter 前往），支持 ~ 和相对路径"
            />
            <button className="dsd-btn" type="submit" style={{ minHeight: 26, padding: '0 7px' }}>前往</button>
          </form>
        ) : (
          <div className="dsd-crumbs">
            {crumbsOf(currentPath).map((crumb, index, all) => (
              <span key={`${crumb.path}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
                {index > 0 ? <span className="dsd-sep">›</span> : null}
                <button
                  className={`dsd-crumb${index === all.length - 1 ? ' current' : ''}`}
                  type="button"
                  title={crumb.path}
                  onClick={() => {
                    if (activeIdRef.current) void loadDirectoryFor(activeIdRef.current, crumb.path)
                  }}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            <button className="dsd-icon-btn" type="button" title="输入路径"
              style={{ width: 22, height: 22 }}
              onClick={() => { setPathDraft(currentPath); setEditingPath(true) }}>
              <EditIcon size={12} />
            </button>
          </div>
        )}
        <button className="dsd-icon-btn" type="button" title="刷新" disabled={loading || busyNow} onClick={reloadCurrent}>
          {loading ? <span className="dsd-spinner" /> : <RefreshIcon size={15} />}
        </button>
      </div>
      <div className="dsd-manage-bar">
        <button className="dsd-btn subtle" type="button" disabled={busyNow}
          onClick={() => openNameModal('mkdir', currentPath)}>
          <PlusIcon size={14} /> 新建文件夹
        </button>
        <button className="dsd-btn subtle" type="button" disabled={busyNow} onClick={() => chooseUpload(currentPath)}>
          <UploadIcon size={14} /> 上传
        </button>
        <span style={{ flex: 1 }} />
        <button className="dsd-btn subtle" type="button" disabled={busyNow} onClick={() => void disconnectServer(activeServer!)}
          title="断开连接">
          断开
        </button>
      </div>
      <div
        className={`dsd-list-wrap dsd-drop-root${dragActive ? ' dragover' : ''}`}
        style={{ flex: 1, minHeight: 0 }}
        onContextMenu={event => openContext(event)}
        onDragEnter={(event) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          dragDepth.current += 1
          setDragActive(true)
        }}
        onDragOver={(event) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={(event) => {
          if (!hasFiles(event)) return
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) {
            setDragActive(false)
            setDropTarget(null)
          }
        }}
        onDrop={onDropRoot}
      >
        {dragActive ? (
          <div className="dsd-banner" style={{ position: 'sticky', top: 0, zIndex: 2, pointerEvents: 'none', background: 'var(--dsw-alias-bg-layer-2, transparent)' }}>
            <UploadIcon size={13} />
            <span className="grow">松开以上传到 {dropTarget ?? currentPath}</span>
          </div>
        ) : null}
        {loading && !listing ? (
          <div className="dsd-empty"><span className="dsd-spinner" /><div className="dsd-empty-desc">正在读取目录…</div></div>
        ) : entries.length === 0 ? (
          <div className="dsd-empty">
            <div className="dsd-empty-icon"><FolderIcon size={30} /></div>
            <div className="dsd-empty-title">空目录</div>
            <div className="dsd-empty-desc">新建文件夹，或把本地文件拖到这里上传。</div>
            <div className="dsd-card-actions" style={{ justifyContent: 'center' }}>
              <button className="dsd-btn" type="button" onClick={() => openNameModal('mkdir', currentPath)}>
                <PlusIcon size={14} /> 新建文件夹
              </button>
              <button className="dsd-btn" type="button" onClick={() => chooseUpload(currentPath)}>
                <UploadIcon size={14} /> 上传
              </button>
            </div>
          </div>
        ) : (
          <div className="dsd-list" role="list">
            {entries.map(entry => {
              const dropHere = dropTarget === entry.path && entry.kind === 'directory'
              return (
                <div
                  key={entry.path}
                  role="listitem"
                  className={`dsd-entry ${entry.kind}${selectedPath === entry.path ? ' selected' : ''}${dropHere ? ' dragover' : ''}`}
                  onContextMenu={event => openContext(event, entry)}
                  onClick={() => setSelectedPath(entry.path)}
                  onDoubleClick={() => enterEntry(entry)}
                  onDragOver={(event) => {
                    if (!hasFiles(event) || entry.kind !== 'directory') return
                    event.preventDefault()
                    event.stopPropagation()
                    setDropTarget(entry.path)
                  }}
                  onDragLeave={(event) => {
                    if (!hasFiles(event) || entry.kind !== 'directory') return
                    event.stopPropagation()
                    setDropTarget(previous => previous === entry.path ? null : previous)
                  }}
                  onDrop={event => onDropOnEntry(event, entry)}
                >
                  <span className="dsd-entry-icon">{entryIcon(entry)}</span>
                  <div className="dsd-entry-main">
                    <span
                      className="dsd-entry-name"
                      title={entry.name}
                      style={entry.kind === 'directory' || entry.kind === 'symlink' ? { cursor: 'pointer' } : undefined}
                      onClick={(event) => {
                        if (entry.kind === 'directory' || entry.kind === 'symlink') {
                          event.stopPropagation()
                          openDirectory(entry)
                        }
                      }}
                    >
                      {entry.name}
                    </span>
                    <span className="dsd-entry-sub">
                      {entry.kind === 'directory' ? '文件夹' : entry.isSymlink ? '链接' : entry.kind === 'file' ? formatSize(entry.size) : '未知'}
                      {entry.mtime ? <span>· {formatTime(entry.mtime)}</span> : null}
                    </span>
                  </div>
                  <div className="dsd-entry-actions">
                    {entry.kind === 'directory' ? (
                      <button className="dsd-icon-btn" type="button" title="打开" onClick={(event) => { event.stopPropagation(); openDirectory(entry) }}>
                        <ChevronIcon size={14} />
                      </button>
                    ) : (
                      <button className="dsd-icon-btn" type="button" title="下载" onClick={(event) => { event.stopPropagation(); download(entry) }}>
                        <DownloadIcon size={14} />
                      </button>
                    )}
                    <button className="dsd-icon-btn" type="button" title="重命名" disabled={busyNow}
                      onClick={(event) => { event.stopPropagation(); openNameModal('rename', currentPath, entry) }}>
                      <EditIcon size={14} />
                    </button>
                    <button className="dsd-icon-btn danger" type="button" title="删除" disabled={busyNow}
                      onClick={(event) => { event.stopPropagation(); void deleteEntry(entry) }}>
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {dragActive ? <div className="dsd-banner" style={{ pointerEvents: 'none', color: 'var(--dsw-alias-brand-primary, #4d6bfe)' }}>拖拽文件到目录行可上传到对应目录</div> : null}
    </>
  )

  return (
    <div className="dsd-root">
      {renderToolbar()}
      {error ? renderError() : null}
      {notice ? <div className="dsd-notice">{notice}</div> : null}
      {servers.length === 0 ? (
        <div className="dsd-empty" style={{ flex: 1 }}>
          <div className="dsd-empty-icon"><ServerIcon size={34} /></div>
          <div className="dsd-empty-title">添加第一台服务器</div>
          <div className="dsd-empty-desc">填写服务器地址、账号和密码，连接后即可在侧栏管理远端目录。</div>
          <button className="dsd-btn primary" type="button" onClick={() => openServerForm()}>
            <PlusIcon size={14} /> 添加服务器
          </button>
        </div>
      ) : !activeServer ? (
        <div className="dsd-empty" style={{ flex: 1 }}>
          <div className="dsd-empty-title">选择服务器</div>
          <div className="dsd-empty-desc">从上方下拉框选择一台服务器，或打开服务器管理。</div>
          <button className="dsd-btn" type="button" onClick={() => setModal({ type: 'servers' })}>服务器管理</button>
        </div>
      ) : !connected ? (
        renderConnectCard()
      ) : (
        renderBrowser()
      )}
      {renderUploads()}
      {renderFootbar()}
      {renderContextMenu()}
      {renderServerManager()}
      {renderServerForm()}
      {renderHostKey()}
      {renderNameModal()}
      {confirmRequest ? (
        <ConfirmModal
          title={confirmRequest.title}
          message={confirmRequest.message}
          confirmLabel={confirmRequest.confirmLabel}
          danger={confirmRequest.danger}
          onCancel={() => settleConfirm(false)}
          onConfirm={() => settleConfirm(true)}
        />
      ) : null}
      <input
        ref={fileInputRef}
        className="dsd-hidden-file-input"
        type="file"
        multiple
        onChange={(event) => {
          const files = event.target.files
          event.target.value = ''
          onFileInput(files)
        }}
      />
    </div>
  )
}
