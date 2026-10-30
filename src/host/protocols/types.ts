import type { Readable, Writable } from 'node:stream'
import type { ServerProtocol, ServerRecord } from '../store.js'

export type RemoteEntryKind = 'directory' | 'file' | 'symlink' | 'other'

export interface RemoteEntry {
  name: string
  path: string
  kind: RemoteEntryKind
  /** True when a directory/file entry is reached through a symlink. */
  isSymlink: boolean
  size: number
  /** Epoch milliseconds; 0 when unavailable. */
  mtime: number
}

export interface RemoteListing {
  entries: RemoteEntry[]
  truncated: boolean
}

export interface RemoteStat {
  path: string
  name: string
  kind: RemoteEntryKind
  isSymlink: boolean
  size: number
  mtime: number
}

export interface HostKeyPolicy {
  knownFingerprint?: string
  trust?: boolean
  expectedFingerprint?: string
  acceptChanged?: boolean
}

export interface ConnectResult {
  home: string
  fingerprint?: string
}

export interface AdapterConfig {
  server: ServerRecord
  password: string
}

export interface RemoteAdapter {
  readonly protocol: ServerProtocol
  connect(policy: HostKeyPolicy): Promise<ConnectResult>
  isConnected(): boolean
  home(): string
  list(path: string): Promise<RemoteListing>
  stat(path: string): Promise<RemoteStat>
  mkdir(path: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  removeTree(path: string): Promise<void>
  upload(source: Readable, directory: string, name: string, overwrite: boolean): Promise<string>
  download(path: string, destination: Writable): Promise<void>
  close(): Promise<void>
}

export interface AdapterFactory {
  (config: AdapterConfig): RemoteAdapter
}
