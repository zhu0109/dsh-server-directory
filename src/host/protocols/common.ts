import { posix } from 'node:path'
import { remoteError } from '../errors.js'
import type { RemoteEntry, RemoteEntryKind } from './types.js'

export const LIST_LIMIT = 5000
export const DELETE_NODE_LIMIT = 10000
export const DELETE_DEPTH_LIMIT = 100

/** Sort directory entries: directories first, then case-insensitive name. */
export function sortEntries(entries: RemoteEntry[]): RemoteEntry[] {
  return entries.sort((left, right) => {
    const leftDir = left.kind === 'directory' ? 0 : 1
    const rightDir = right.kind === 'directory' ? 0 : 1
    if (leftDir !== rightDir) return leftDir - rightDir
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

/** Cap a listing while still telling the client it was cut. */
export function capEntries(entries: RemoteEntry[]): { entries: RemoteEntry[]; truncated: boolean } {
  const sorted = sortEntries(entries)
  if (sorted.length <= LIST_LIMIT) return { entries: sorted, truncated: false }
  return { entries: sorted.slice(0, LIST_LIMIT), truncated: true }
}

export function remoteChild(parent: string, name: string): string {
  return posix.join(parent, name)
}

export function kindFromMode(mode: number): RemoteEntryKind {
  const type = mode & 0o170000
  if (type === 0o040000) return 'directory'
  if (type === 0o100000) return 'file'
  if (type === 0o120000) return 'symlink'
  return 'other'
}

export function normalizedMtime(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000
  }
  return 0
}

/** Shared recursive-delete budget. */
export class DeleteBudget {
  private nodes = 0

  consume(depth: number): void {
    if (depth > DELETE_DEPTH_LIMIT) throw remoteError('bad_request', '目录层级过深，已停止删除。')
    this.nodes += 1
    if (this.nodes > DELETE_NODE_LIMIT) {
      throw remoteError('bad_request', `目录条目超过 ${DELETE_NODE_LIMIT} 个，已停止删除；请先在服务器上分批处理。`)
    }
  }
}
