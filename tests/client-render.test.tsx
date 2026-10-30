import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ServerDirectoryPanel } from '../src/client/Panel.js'

describe('server directory panel render', () => {
  it('renders the empty state without a DOM', () => {
    const html = renderToStaticMarkup(<ServerDirectoryPanel visible />)
    expect(html).toContain('dsd-root')
    expect(html).toContain('添加第一台服务器')
    expect(html).toContain('连接后即可在侧栏管理远端目录')
  })
})
