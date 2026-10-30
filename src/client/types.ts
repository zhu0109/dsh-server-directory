import type { ReactNode } from 'react'

export type ServerProtocol = 'sftp' | 'ftp' | 'ftps' | 'ftpsi'

export type RemoteEntryKind = 'directory' | 'file' | 'symlink' | 'other'

export interface PublicServer {
  id: string
  name: string
  protocol: ServerProtocol
  host: string
  port: number
  username: string
  allowInvalidCert: boolean
  hasPassword: boolean
  createdAt: number
  updatedAt: number
  connection?: ConnectionStatus
}

export interface ConnectionStatus {
  serverId: string
  state: 'connected' | 'disconnected' | 'error'
  home?: string
  lastError?: string
  code?: string
}

export interface RemoteEntry {
  name: string
  path: string
  kind: RemoteEntryKind
  isSymlink: boolean
  size: number
  mtime: number
}

export interface RemoteListing {
  path: string
  home: string
  entries: RemoteEntry[]
  truncated: boolean
}

export interface ApiFailure {
  ok?: false
  code?: string
  error?: string
  fingerprint?: string
  previous?: string
  algorithm?: string
}

export interface BetterSidebarService {
  registerTab(descriptor: {
    id: string
    title: string | (() => string)
    description?: string | (() => string)
    icon?: ReactNode | ((size: number) => ReactNode)
    order?: number
    single?: boolean
    component: (props: {
      visible: boolean
      ctx: unknown
      scope?: { sessionId?: string; cwd?: string }
      tab?: unknown
      [key: string]: unknown
    }) => ReactNode
  }): () => void
}

export interface ClientContext {
  betterSidebar: BetterSidebarService
  effect(effect: () => void | (() => void), label?: string): unknown
  logger?: {
    info?(message: string): void
    warn?(message: string): void
    error?(message: string, error?: unknown): void
  }
}

export interface ServerFormValues {
  id?: string
  name: string
  protocol: ServerProtocol
  host: string
  port: number
  username: string
  password: string
  allowInvalidCert: boolean
}

export const PROTOCOL_LABELS: Record<ServerProtocol, string> = {
  sftp: 'SFTP',
  ftp: 'FTP',
  ftps: 'FTPS（显式）',
  ftpsi: 'FTPS（隐式）',
}

export const PROTOCOL_PORTS: Record<ServerProtocol, number> = {
  sftp: 22,
  ftp: 21,
  ftps: 21,
  ftpsi: 990,
}
