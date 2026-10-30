import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PublicServer, ServerFormValues, ServerProtocol } from './types.js'
import { PROTOCOL_LABELS, PROTOCOL_PORTS } from './types.js'
import { CloseIcon, EditIcon, ServerIcon, TrashIcon } from './icons.js'

export function Modal(props: {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  wide?: boolean
}): ReactNode {
  const { title, children, footer, onClose } = props
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="dsd-modal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dsd-modal" style={props.wide ? { maxWidth: 460 } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dsd-modal-head">
          <div className="dsd-modal-title">{title}</div>
          <button className="dsd-icon-btn" onClick={onClose} title="关闭" type="button">
            <CloseIcon size={15} />
          </button>
        </div>
        <div className="dsd-modal-body">{children}</div>
        {footer ? <div className="dsd-modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

function ErrorBox({ error }: { error?: string }): ReactNode {
  return error ? <div className="dsd-error" style={{ marginBottom: 9, border: '1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d9534f) 25%, transparent)', borderRadius: 7 }}>{error}</div> : null
}

function initialValues(server?: PublicServer): ServerFormValues {
  if (server) {
    return {
      id: server.id,
      name: server.name,
      protocol: server.protocol,
      host: server.host,
      port: server.port,
      username: server.username,
      password: '',
      allowInvalidCert: server.allowInvalidCert,
    }
  }
  return {
    name: '',
    protocol: 'sftp',
    host: '',
    port: 22,
    username: '',
    password: '',
    allowInvalidCert: false,
  }
}

export function ServerFormModal(props: {
  server?: PublicServer
  busy: boolean
  error?: string
  onCancel: () => void
  onSubmit: (values: ServerFormValues) => void
}): ReactNode {
  const [values, setValues] = useState<ServerFormValues>(() => initialValues(props.server))
  const isEdit = props.server !== undefined
  const patch = (update: Partial<ServerFormValues>): void => setValues(previous => ({ ...previous, ...update }))

  const changeProtocol = (protocol: ServerProtocol): void => {
    const previousDefault = PROTOCOL_PORTS[values.protocol]
    const nextPort = values.port === previousDefault || !values.port ? PROTOCOL_PORTS[protocol] : values.port
    setValues(previous => ({ ...previous, protocol, port: nextPort, allowInvalidCert: protocol === 'ftps' || protocol === 'ftpsi' ? previous.allowInvalidCert : false }))
  }

  return (
    <Modal
      title={isEdit ? '编辑服务器' : '添加服务器'}
      onClose={props.onCancel}
      footer={(
        <>
          <button className="dsd-btn" type="button" onClick={props.onCancel} disabled={props.busy}>取消</button>
          <button className="dsd-btn primary" type="submit" form="dsd-server-form" disabled={props.busy}>
            {props.busy ? '保存中…' : '保存'}
          </button>
        </>
      )}
    >
      <form
        id="dsd-server-form"
        onSubmit={(event) => {
          event.preventDefault()
          props.onSubmit({
            ...values,
            name: values.name.trim(),
            host: values.host.trim(),
            username: values.username.trim(),
            port: Number(values.port),
          })
        }}
      >
        <ErrorBox error={props.error} />
        <label className="dsd-field">
          <span className="dsd-label">名称（可选）</span>
          <input className="dsd-input" value={values.name} placeholder="例如：生产服务器" maxLength={100}
            onChange={event => patch({ name: event.target.value })} autoFocus />
        </label>
        <label className="dsd-field">
          <span className="dsd-label">协议</span>
          <select className="dsd-input" value={values.protocol}
            onChange={event => changeProtocol(event.target.value as ServerProtocol)}>
            {(Object.keys(PROTOCOL_LABELS) as ServerProtocol[]).map(protocol => (
              <option key={protocol} value={protocol}>{PROTOCOL_LABELS[protocol]}</option>
            ))}
          </select>
          {values.protocol === 'ftp' ? (
            <div className="dsd-warn">明文 FTP：账号和文件内容不会被加密，建议改用 SFTP 或 FTPS。</div>
          ) : null}
        </label>
        <label className="dsd-field">
          <span className="dsd-label">服务器地址</span>
          <input className="dsd-input" value={values.host} placeholder="example.com 或 192.168.1.10"
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            onChange={event => patch({ host: event.target.value })} required />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <label className="dsd-field" style={{ flex: 1 }}>
            <span className="dsd-label">端口</span>
            <input className="dsd-input" type="number" min={1} max={65535} value={values.port}
              onChange={event => patch({ port: Number(event.target.value) })} required />
          </label>
          <label className="dsd-field" style={{ flex: 1.5 }}>
            <span className="dsd-label">用户名</span>
            <input className="dsd-input" value={values.username} autoComplete="username"
              onChange={event => patch({ username: event.target.value })} required />
          </label>
        </div>
        <label className="dsd-field">
          <span className="dsd-label">密码</span>
          <input className="dsd-input" type="password" value={values.password}
            autoComplete="new-password"
            placeholder={isEdit ? '留空则保持原密码' : '服务器登录密码'}
            onChange={event => patch({ password: event.target.value })} required={!isEdit} />
          <div className="dsd-hint">密码只保存在 DSH 宿主机的本地文件中，不会回传给浏览器页面。</div>
        </label>
        {(values.protocol === 'ftps' || values.protocol === 'ftpsi') ? (
          <label className="dsd-check">
            <input type="checkbox" checked={values.allowInvalidCert}
              onChange={event => patch({ allowInvalidCert: event.target.checked })} />
            <span>允许自签名/无效 TLS 证书<br /><span className="dsd-hint">仅在明确信任该服务器时开启。</span></span>
          </label>
        ) : null}
      </form>
    </Modal>
  )
}

export function ConfirmModal(props: {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}): ReactNode {
  return (
    <Modal
      title={props.title}
      onClose={props.onCancel}
      footer={(
        <>
          <button className="dsd-btn" type="button" onClick={props.onCancel} disabled={props.busy}>取消</button>
          <button className={`dsd-btn ${props.danger ? 'danger' : 'primary'}`} type="button"
            onClick={props.onConfirm} disabled={props.busy}>
            {props.busy ? '处理中…' : (props.confirmLabel ?? '确定')}
          </button>
        </>
      )}
    >
      <div style={{ fontSize: 12.5, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{props.message}</div>
    </Modal>
  )
}

export function NameModal(props: {
  title: string
  label: string
  initial?: string
  confirmLabel?: string
  busy?: boolean
  error?: string
  hint?: string
  onCancel: () => void
  onSubmit: (name: string) => void
}): ReactNode {
  const [name, setName] = useState(props.initial ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  return (
    <Modal
      title={props.title}
      onClose={props.onCancel}
      footer={(
        <>
          <button className="dsd-btn" type="button" onClick={props.onCancel} disabled={props.busy}>取消</button>
          <button className="dsd-btn primary" type="submit" form="dsd-name-form" disabled={props.busy}>
            {props.busy ? '处理中…' : (props.confirmLabel ?? '确定')}
          </button>
        </>
      )}
    >
      <form id="dsd-name-form" onSubmit={(event) => {
        event.preventDefault()
        const trimmed = name.trim()
        if (trimmed) props.onSubmit(trimmed)
      }}>
        <ErrorBox error={props.error} />
        <label className="dsd-field">
          <span className="dsd-label">{props.label}</span>
          <input ref={inputRef} className="dsd-input" value={name} maxLength={255}
            onChange={event => setName(event.target.value)} required />
          {props.hint ? <div className="dsd-hint">{props.hint}</div> : null}
        </label>
      </form>
    </Modal>
  )
}

function displayFingerprint(fingerprint: string): string {
  const value = fingerprint.replace(/^SHA256:/i, '')
  const groups = value.match(/.{1,8}/g) ?? [value]
  return `SHA256:${groups.join(' ')}`
}

export function HostKeyModal(props: {
  endpoint: string
  fingerprint: string
  previous?: string
  changed: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}): ReactNode {
  return (
    <Modal
      title={props.changed ? '主机密钥已变化' : '确认服务器主机密钥'}
      onClose={props.onCancel}
      footer={(
        <>
          <button className="dsd-btn" type="button" onClick={props.onCancel} disabled={props.busy}>取消</button>
          <button className="dsd-btn primary" type="button" onClick={props.onConfirm} disabled={props.busy}>
            {props.busy ? '连接中…' : (props.changed ? '更新信任并连接' : '信任并连接')}
          </button>
        </>
      )}
    >
      <div style={{ fontSize: 12.5, lineHeight: 1.65 }}>
        {props.changed
          ? '这台服务器的主机密钥与已保存的指纹不一致。可能服务器重装过，也可能存在中间人攻击。请通过其他可信渠道核对指纹后再继续。'
          : '这是第一次连接该服务器。请核对下面的 SHA256 指纹是否与服务器管理员提供的一致。'}
      </div>
      <div className="dsd-hint">{props.endpoint}</div>
      <div className="dsd-fingerprint">{displayFingerprint(props.fingerprint)}</div>
      {props.changed && props.previous ? (
        <>
          <div className="dsd-label">原指纹</div>
          <div className="dsd-fingerprint">{displayFingerprint(props.previous)}</div>
        </>
      ) : null}
    </Modal>
  )
}

export function ServerManagerModal(props: {
  servers: PublicServer[]
  activeId?: string
  busy: boolean
  onClose: () => void
  onAdd: () => void
  onEdit: (server: PublicServer) => void
  onDelete: (server: PublicServer) => void
  onSelect: (server: PublicServer) => void
  onConnect: (server: PublicServer) => void
  onDisconnect: (server: PublicServer) => void
}): ReactNode {
  return (
    <Modal
      title="服务器管理"
      wide
      onClose={props.onClose}
      footer={(
        <>
          <button className="dsd-btn" type="button" onClick={props.onClose}>关闭</button>
          <button className="dsd-btn primary" type="button" onClick={props.onAdd}>添加服务器</button>
        </>
      )}
    >
      {props.servers.length === 0 ? (
        <div className="dsd-empty" style={{ minHeight: 120 }}>
          <div className="dsd-empty-icon"><ServerIcon size={30} /></div>
          <div className="dsd-empty-title">还没有服务器</div>
          <div className="dsd-empty-desc">支持 SFTP、FTP、显式 FTPS 和隐式 FTPS。</div>
        </div>
      ) : (
        <div className="dsd-server-list">
          {props.servers.map(server => {
            const state = server.connection?.state ?? 'disconnected'
            return (
              <div key={server.id} className={`dsd-server-item${server.id === props.activeId ? ' active' : ''}`}>
                <span className={`dsd-dot${state === 'connected' ? ' on' : state === 'error' ? ' err' : ''}`} />
                <button
                  type="button"
                  className="main"
                  style={{ border: 0, background: 'transparent', textAlign: 'left', padding: 0, cursor: 'pointer', color: 'inherit' }}
                  onClick={() => props.onSelect(server)}
                  title="切换到此服务器"
                >
                  <div className="name">{server.name || server.host}</div>
                  <div className="endpoint">
                    {server.username}@{server.host}:{server.port}
                    <span className="dsd-protocol-tag" style={{ marginLeft: 5 }}>{PROTOCOL_LABELS[server.protocol]}</span>
                  </div>
                  {state === 'error' && server.connection?.lastError ? (
                    <div className="endpoint" style={{ color: 'var(--dsw-alias-state-error-primary, #d9534f)' }}>
                      {server.connection.lastError}
                    </div>
                  ) : null}
                </button>
                <div className="actions">
                  {state === 'connected' ? (
                    <button className="dsd-btn subtle" type="button" disabled={props.busy}
                      onClick={() => props.onDisconnect(server)}>断开</button>
                  ) : (
                    <button className="dsd-btn subtle" type="button" disabled={props.busy}
                      onClick={() => props.onConnect(server)}>连接</button>
                  )}
                  <button className="dsd-icon-btn" type="button" title="编辑" onClick={() => props.onEdit(server)}>
                    <EditIcon size={14} />
                  </button>
                  <button className="dsd-icon-btn danger" type="button" title="删除" onClick={() => props.onDelete(server)}>
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
