# DSH Server Directory

在 DeepSeek Harness 右侧栏中管理多台远端服务器的文件系统。支持 **SFTP、FTP、显式 FTPS、隐式 FTPS**，可以浏览目录、新建文件夹、重命名、递归删除、下载文件，以及把本地文件拖拽到当前目录或任意目录行上传。

## 功能

- 多服务器：添加、编辑、删除、切换，连接互相独立。
- 主机指纹：SFTP 首次连接必须确认 SHA256 主机指纹；指纹变化后必须明确更新信任。
- 目录浏览：远端 home 作为起点，支持相对路径、绝对路径、`~`、面包屑和路径输入。
- 目录操作：新建文件夹、重命名、递归删除；递归删除不跟随符号链接。
- 文件操作：上传、下载、重命名、删除。
- 拖拽上传：拖到列表空白处上传到当前目录；拖到目录行上传到该目录；多文件顺序上传并显示进度，可取消。
- 安全：密码只保存在宿主机本地，API 不返回密码，也不会写入浏览器 localStorage；所有路由执行 DSH 同源信任栅栏。
- 界面跟随 DSH 主题令牌，不写死颜色。

## 安装

在插件目录完成构建：

```powershell
pnpm install
pnpm build
```

然后安装到 desktop profile：

```powershell
dsh plugin --profile desktop add --ignore-scripts "link:C:\Users\18798\Desktop\dsh-server-directory"
```

`--ignore-scripts` 是因为 ssh2 的可选原生加速模块需要本地 C++ 编译工具链；不编译时 ssh2 会使用纯 JS 实现，功能不受影响。若你的 pnpm 仍提示 ignored builds，请对 `ssh2` / `cpu-features` 运行 `pnpm approve-builds` 或保留 `--ignore-scripts`。

重启 DSH 并硬刷新浏览器页面后，在右侧栏的 `+` 菜单选择 **服务器目录**。

> 当前工作区已以本地链接方式安装。DSH 重启后才会加载新的 host 半。

## 使用

1. 打开“服务器目录”页签，点击添加服务器。
2. 选择协议，填写地址、端口、用户名、密码。
3. 保存后点击“连接服务器”。
4. SFTP 首次连接会弹出主机指纹确认；请与服务器管理员核对。
5. 连接后即可浏览目录、使用工具栏或右键菜单管理文件。
6. 把本地文件拖入列表或目录行即可上传。

## 数据位置

默认位于 `$DSH_HOME/server-directory/`（通常是 `%USERPROFILE%\.dsh\server-directory`）：

| 文件 | 内容 |
|---|---|
| `servers.json` | 服务器地址、用户名、协议等非敏感配置 |
| `secrets.json` | 各服务器密码，明文保存，权限尽可能设为 `0600` |
| `known_hosts.json` | 已确认的 SFTP SHA256 主机指纹 |

密码没有接入系统钥匙串。请保护好本机 DSH 用户目录的访问权限。

## 协议说明

- **SFTP**：基于 SSH，使用密码认证，并兼容服务器要求 keyboard-interactive 的密码登录。
- **FTP**：明文传输，不安全，界面上会提示；建议优先使用 SFTP/FTPS。
- **FTPS（显式）**：默认端口 21，先建立普通 FTP 再升级 TLS。
- **FTPS（隐式）**：默认端口 990，直接 TLS。
- FTPS 默认校验证书；只有用户在服务器配置中显式勾选“允许自签名/无效 TLS 证书”时才关闭校验。

## 范围限制

- 仅支持账号密码，不读取私钥。
- 不支持终端、端口转发、跳板机/代理。
- 不递归上传整个文件夹；拖拽文件夹请先在服务器上创建目标结构。
- 不编辑远端文件内容；仅上传/下载和目录/文件管理。
- 不向 Agent 暴露服务器操作工具。

## 开发

```powershell
pnpm typecheck
pnpm test
pnpm build
```

测试包含路径/权限策略、凭据存储、错误映射、API 行为、客户端首屏渲染，以及使用进程内 SFTP / FTP 服务器的真实连接、上传、下载、重命名和递归删除集成测试。
