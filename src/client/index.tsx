/**
 * Client half of dsh-server-directory. Registers one better-sidebar tab; all
 * remote work is done by the plugin's host half through fenced HTTP routes.
 */
import { createElement, type ReactNode } from 'react'
import type { ClientContext } from './types.js'
import { ServerDirectoryPanel } from './Panel.js'
import { ServerIcon } from './icons.js'
import { CSS, STYLE_ID } from './styles.js'

export const inject = ['betterSidebar']

function installStyles(): () => void {
  if (typeof document === 'undefined') return () => undefined
  const previous = document.getElementById(STYLE_ID)
  if (previous) previous.remove()
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = CSS
  document.head.appendChild(element)
  return () => {
    try { element.remove() } catch { /* already removed */ }
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => installStyles(), 'dsh-server-directory: styles')
  ctx.effect(
    () => ctx.betterSidebar.registerTab({
      id: 'dsh-server-directory:files',
      title: () => '服务器目录',
      description: () => '连接 SFTP / FTP 服务器并管理远端目录',
      icon: (size: number): ReactNode => createElement(ServerIcon, { size }),
      order: 55,
      single: true,
      component: (props): ReactNode => createElement(ServerDirectoryPanel, { visible: props.visible }),
    }),
    'dsh-server-directory: sidebar tab',
  )
}
