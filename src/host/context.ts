/**
 * The tiny structural slice of the Cordis/DSH host API this plugin needs.
 * Keeping it local avoids coupling the build to whatever type packages a
 * particular DSH installation happens to expose.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

export interface WebServerService {
  register(route: WebRoute): () => void
}

export interface ConnectionService {
  requestRejection?(req: IncomingMessage): 401 | 403 | undefined
}

export interface LoggerLike {
  info?(message: string): void
  warn?(message: string): void
  error?(message: string, error?: unknown): void
}

export interface HostContext {
  webServer: WebServerService
  effect(effect: () => void | (() => void), label?: string): unknown
  get(name: string, strict?: boolean): unknown
  logger?: LoggerLike
}
