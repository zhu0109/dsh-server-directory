# DSH Server Directory 使用手册

<p align="center">
  <img src="https://gcore.jsdelivr.net/gh/zhu0109/dsh-server-directory@main/docs/images/01-main-panel.png" width="420" alt="DSH 服务器目录面板" />
</p>

<p align="center"><sub>右侧栏中的服务器目录面板：多服务器切换、路径导航、文件列表和操作工具栏</sub></p>

> 本文截图来自插件的真实界面，使用演示服务器和示例文件生成；示例地址、文件名和主机指纹仅用于展示。

DSH Server Directory 是 [DeepSeek Harness](https://www.deepseek.com/) 的右侧栏插件。它把远端服务器的目录浏览、文件上传/下载和目录管理放进 DSH 的工作界面里，不必离开对话窗口去开额外的 SFTP/FTP 客户端。

- GitHub：<https://github.com/zhu0109/dsh-server-directory>
- npm：<https://www.npmjs.com/package/dsh-server-directory>
- 详细变更记录：[CHANGELOG.md](../CHANGELOG.md)
- 版本发布流程：[RELEASING.md](../RELEASING.md)

---

## 1. 插件解决什么问题

日常在 DSH 里处理远程项目时，经常需要在“对话”和“服务器文件管理器”之间来回切换。这个插件把常用操作集中在 DSH 右侧栏：

- 连接到本机 WSL、局域网服务器或公网服务器；
- 查看服务器上的目录和文件；
- 在不离开 DSH 的情况下新建、重命名、删除远端目录；
- 把本地文件直接拖进远端目录；
- 下载远端文件；
- 同时保存多台服务器，并随时切换。

插件不会把远端服务器“挂载”成 DSH 的本地文件系统，也不会把密码或文件内容发送给模型。所有远端操作都由宿主侧协议适配器完成，且需要用户在面板中主动触发。

## 2. 功能总览

| 功能 | 说明 |
|---|---|
| 多服务器 | 添加、编辑、删除、切换多台服务器，连接互相独立 |
| 四种协议 | SFTP、FTP、显式 FTPS、隐式 FTPS |
| 密码认证 | 使用服务器账号 + 密码登录，并兼容 SFTP 的 keyboard-interactive 密码登录 |
| SFTP 主机密钥 | 首次连接显示 SHA256 指纹并要求确认；指纹变化时阻止静默连接 |
| 目录浏览 | 远端 home 为起点；支持面包屑、绝对路径、相对路径和 `~` |
| 新建目录 | 在当前目录或指定目录下创建文件夹 |
| 重命名 | 重命名文件或目录 |
| 删除 | 文件删除、空目录删除、非空目录递归删除，删除前确认 |
| 下载 | 通过浏览器下载远端文件，支持中文文件名 |
| 上传 | 点击上传或拖拽上传；多文件顺序上传、进度、取消、覆盖确认 |
| 主题自适应 | 使用 DSH 的 `--dsw-alias-*` 主题变量，跟随明暗主题 |
| 安全 | 密码仅存在宿主机；API 需要 DSH 连接信任；面板不保存密码 |

## 3. 安装与启用

### 3.1 环境要求

- DeepSeek Harness `0.2.1-rc.1` 或更新的 `0.2.x`；
- `dsh-better-sidebar` `0.28.x`：插件注册的“服务器目录”页签由 better-sidebar 承载；
- 插件构建产物使用 Node.js 22.12+（DSH 自带运行时已满足）；
- 可访问的远端 SFTP/FTP/FTPS 服务。

### 3.2 从 npm 安装

```powershell
dsh plugin --profile desktop add --ignore-scripts dsh-server-directory@latest
```

### 3.3 从 GitHub 版本 tag 安装

```powershell
dsh plugin --profile desktop add --ignore-scripts "github:zhu0109/dsh-server-directory#v0.1.1"
```

### 3.4 本地开发安装

```powershell
pnpm install
pnpm build
dsh plugin --profile desktop add --ignore-scripts "link:C:\Users\18798\Desktop\dsh-server-directory"
```

### 3.5 为什么需要 `--ignore-scripts`

插件的 SFTP 依赖 `ssh2` 带一个**可选**的原生加速绑定。没有 C++ 构建工具链时，安装脚本可能被 pnpm 标记为 ignored build。`ssh2` 会自动回退到纯 JavaScript 实现，SFTP 功能不受影响，因此使用 `--ignore-scripts` 可以避免安装被原生编译问题阻塞。

### 3.6 启用

安装后：

1. 完全退出并重新打开 DSH（让宿主侧插件加载）；
2. 硬刷新页面（`Ctrl+Shift+R`）；
3. 打开右侧栏；
4. 点击 `+`，选择 **服务器目录**。

如果 `+` 菜单里没有该页签，请先确认 `dsh-better-sidebar` 已安装并启用。

---

## 4. 界面概览

<p align="center">
  <img src="https://gcore.jsdelivr.net/gh/zhu0109/dsh-server-directory@main/docs/images/01-main-panel.png" width="420" alt="服务器目录主界面" />
</p>

<p align="center"><sub>图 1：连接服务器后的主界面</sub></p>

界面从上到下分为：

1. **服务器栏**
   - 左侧绿点表示当前连接状态；
   - 下拉框切换服务器；
   - 齿轮按钮打开服务器管理；
   - 加号添加服务器。

2. **路径栏**
   - 向上箭头返回上一级；
   - 面包屑显示当前路径，最后一级加粗；
   - 点击路径右侧的铅笔图标可手动输入路径；
   - 刷新按钮重新读取当前目录。

3. **操作栏**
   - 新建文件夹；
   - 上传文件；
   - 断开当前服务器。

4. **文件列表**
   - 文件夹优先排序；
   - 每行显示类型、大小、修改时间；
   - 右侧悬停操作：打开/下载、重命名、删除；
   - 目录名可直接点击进入；
   - 支持右键菜单。

5. **底部状态栏**
   - 连接状态；
   - 当前目录条目数；
   - 协议类型；
   - 上传后可清理已完成的记录。

> 目录列表最多显示 5000 项。超过后会在底部提示目录过大，避免超大目录拖垮浏览器。

---

## 5. 添加服务器

<p align="center">
  <img src="https://gcore.jsdelivr.net/gh/zhu0109/dsh-server-directory@main/docs/images/03-add-server.png" width="420" alt="添加服务器表单" />
</p>

<p align="center"><sub>图 2：添加服务器表单</sub></p>

点击顶部 `+`（或服务器管理里的“添加服务器”）打开表单：

| 字段 | 说明 |
|---|---|
| 名称 | 可选，便于识别的显示名称 |
| 协议 | SFTP / FTP / FTPS（显式）/ FTPS（隐式） |
| 服务器地址 | 主机名或 IP，不要带 `sftp://`、`ftp://` 前缀 |
| 端口 | SFTP 默认 22；FTP/显式 FTPS 默认 21；隐式 FTPS 默认 990 |
| 用户名 | 服务器登录账号 |
| 密码 | 服务器登录密码 |
| 允许自签名证书 | 仅 FTPS 显示；仅在明确信任服务器时开启 |

保存后，密码会被送到 DSH 宿主侧并写入宿主机本地文件，**不会回传到浏览器页面**。编辑服务器时密码框留空表示保持原密码。

### 5.1 协议选择建议

| 协议 | 加密 | 默认端口 | 适用场景 |
|---|---|---|---|
| SFTP | SSH 加密 | 22 | 推荐；Linux/Unix 服务器、WSL |
| FTP | 无加密 | 21 | 仅兼容旧服务器，不建议 |
| FTPS（显式） | 先 FTP 再升级 TLS | 21 | 普通支持显式 TLS 的 FTP 服务器 |
| FTPS（隐式） | 从一开始就使用 TLS | 990 | 老式隐式 FTPS 服务器 |

FTP 为明文协议，面板会显示警告。能使用 SFTP 时应优先使用 SFTP。

---

## 6. 服务器管理与多服务器切换

<p align="center">
  <img src="https://gcore.jsdelivr.net/gh/zhu0109/dsh-server-directory@main/docs/images/02-server-manager.png" width="420" alt="服务器管理弹窗" />
</p>

<p align="center"><sub>图 3：服务器管理：连接状态、连接/断开、编辑和删除</sub></p>

点击顶部齿轮图标打开服务器管理：

- 绿色圆点：连接成功；
- 灰色圆点：未连接；
- 红色圆点：连接失败，行内显示错误信息；
- 每台服务器都可以独立连接/断开；
- 点击名称切换当前服务器；
- 编辑会打开服务器表单；
- 删除服务器会同时删除保存的密码和该 endpoint 的主机指纹（若没有其他服务器使用同一 endpoint）。

多台服务器可以同时保持连接。切换服务器时，插件会记住每台服务器上一次停留的路径。

连接失败时，错误会显示在面板中，例如：

- 账号或密码错误；
- 无法解析服务器地址；
- 连接超时；
- TLS 证书校验失败；
- SFTP 主机密钥未确认。

---

## 7. 首次连接与 SFTP 主机指纹

<p align="center">
  <img src="https://gcore.jsdelivr.net/gh/zhu0109/dsh-server-directory@main/docs/images/05-host-key.png" width="420" alt="SFTP 主机指纹确认" />
</p>

<p align="center"><sub>图 4：首次连接 SFTP 服务器时确认 SHA256 主机指纹</sub></p>

SFTP 使用 SSH，连接时会校验服务器主机密钥：

1. 第一次连接某台 SFTP 服务器时，插件展示 `host:port` 和 SHA256 指纹；
2. 核对指纹与服务器管理员提供的是否一致；
3. 点击“信任并连接”，指纹保存到宿主机；
4. 以后同一台服务器再次连接时，如果指纹一致则直接连接；
5. 如果指纹发生变化，插件拒绝自动连接并显示旧/新指纹，必须人工确认“更新信任并连接”。

这一步用于发现服务器重装、IP 被复用或中间人攻击。**不要在不了解原因的情况下直接确认变化的指纹。**

FTP/FTPS 不使用 SSH 主机密钥。FTPS 的证书校验由 TLS 层完成；自签名证书需要用户在服务器表单中显式允许。

---

## 8. 浏览目录与路径输入

连接成功后默认进入服务器 home 目录（SFTP 通过 `realpath('.')` 获取，FTP 通过 `PWD` 获取）。

支持：

- 点击目录打开；
- 点击面包屑跳转；
- 点击向上箭头返回；
- 点击铅笔图标输入绝对路径、相对路径或 `~`；
- 刷新当前目录。

路径只使用远端 POSIX 语义，不受本机 Windows 路径规则影响。

---

## 9. 目录和文件操作

<p align="center">
  <img src="https://gcore.jsdelivr.net/gh/zhu0109/dsh-server-directory@main/docs/images/04-file-actions.png" width="420" alt="目录右键菜单" />
</p>

<p align="center"><sub>图 5：目录右键菜单：打开、上传、新建文件夹、重命名、删除</sub></p>

### 9.1 新建文件夹

- 工具栏“新建文件夹”；
- 或右键某个目录 → “在此新建文件夹”。

名称为单个路径段，不能包含 `/`、`\`、`.`、`..` 或控制字符。

### 9.2 重命名

右键文件/目录 → “重命名”，输入新名称。只改变最后一级名称，保持父目录不变。

### 9.3 删除

右键 → “删除”：

- 文件：删除该文件；
- 目录：递归删除目录及其中的内容；
- 删除前会弹出确认框；
- 递归删除不会跟随符号链接，遇到链接只删除链接本身；
- 禁止删除远端根目录 `/`；
- 目录层级或条目数超过安全限制时会中止并提示。

### 9.4 下载

点击文件行的下载按钮（或右键 → 下载），浏览器会下载该文件。中文文件名使用 RFC 5987 编码。

### 9.5 符号链接

SFTP/FTP 适配器会尽量把符号链接标注为“链接”或链接指向的目录/文件。递归删除目录时只删除链接本身，不会进入链接目标。

---

## 10. 上传文件

<p align="center">
  <img src="https://gcore.jsdelivr.net/gh/zhu0109/dsh-server-directory@main/docs/images/06-upload.png" width="420" alt="上传队列与进度" />
</p>

<p align="center"><sub>图 6：上传队列、实时进度和取消按钮</sub></p>

### 10.1 两种上传方式

**方式一：工具栏上传**

1. 进入目标目录；
2. 点击“上传”；
3. 选择一个或多个本地文件。

**方式二：拖拽上传**

- 拖到文件列表空白区域：上传到当前目录；
- 拖到某一个目录行：上传到该目录，并高亮目标行；
- 松开鼠标后开始上传。

### 10.2 上传行为

- 多文件按顺序上传，避免同时占满连接；
- 显示每个文件的进度；
- 可取消尚未完成的上传；
- 上传过程中列表仍可浏览；
- 同名文件存在时会弹出覆盖确认；
- 上传先写入临时文件，完成后再重命名到目标名称，减少半截文件；
- 上传失败会清理临时文件并显示错误；
- **当前不支持上传整个文件夹**；请在服务器上先创建目录结构，或逐个文件上传。

### 10.3 什么时候会覆盖

如果目标目录已有同名文件，插件会：

1. 先查询目标是否存在；
2. 若存在，显示“覆盖文件”确认；
3. 用户确认后使用覆盖上传；
4. 如果目标同名项是目录，则拒绝上传并提示。

---

## 11. 安全设计与数据位置

### 11.1 密码保存在哪里

默认目录：

```text
%USERPROFILE%\.dsh\server-directory\
```

| 文件 | 内容 |
|---|---|
| `servers.json` | 服务器名称、协议、地址、端口、用户名等非敏感配置 |
| `secrets.json` | 各服务器密码（明文，仅在宿主机本地） |
| `known_hosts.json` | 已确认的 SFTP SHA256 主机指纹 |

- API 响应不包含密码；
- 浏览器 localStorage 只保存当前服务器 id 和路径；
- 密码不会写入面板状态、URL 或前端日志；
- 文件权限在 POSIX 上尽量设置为 `0600`，目录为 `0700`；Windows 下由用户目录 ACL 控制；
- 目前没有接入系统钥匙串。请保护本机 DSH 用户目录。

### 11.2 路由安全

所有插件 HTTP 路由都执行与 DSH 一致的连接信任检查：

- 优先调用 `connection.requestRejection(req)`；
- 无连接服务时退化为仅允许 loopback；
- 拒绝跨源浏览器请求；
- 上传接口单独流式处理，不经过 JSON body 缓冲。

### 11.3 远端路径保护

- 新建/重命名名称会拒绝路径分隔符和控制字符；
- 禁止删除 `/`；
- 递归删除设置条目数和层级上限；
- 不跟随符号链接递归删除；
- 下载接口只允许文件，不允许目录。

> 这些保护用于防止误操作，不是本地文件沙箱。远端权限仍然由登录账号自身的服务器权限决定。

---

## 12. 在本机 WSL 上使用

如果目标是本机 WSL（例如 Ubuntu 22.04）：

### 12.1 在 WSL 中启用 SSH/SFTP

```bash
sudo apt update
sudo apt install -y openssh-server
sudo systemctl enable --now ssh
```

如需自定义端口（例如 2222），创建 `/etc/ssh/sshd_config.d/99-dsh-sftp.conf`：

```text
Port 2222
PasswordAuthentication yes
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers zhujunhao
```

然后：

```bash
sudo sshd -t
sudo systemctl restart ssh
```

### 12.2 在插件中添加

| 字段 | 示例 |
|---|---|
| 协议 | SFTP |
| 地址 | `127.0.0.1` |
| 端口 | `2222` |
| 用户名 | 你的 WSL 用户名 |
| 密码 | 你的 WSL 用户密码 |

如果 Windows 侧访问 `127.0.0.1:2222` 暂时失败，确认 WSL 已启动，并重新执行一次 `sudo systemctl start ssh`。WSL 停止后 SSH 服务也会停止；Windows 重启后打开一次 WSL 终端即可让 systemd 启动 SSH。

---

## 13. 常见问题

### 插件页签没有出现

1. 确认已安装并启用 `dsh-better-sidebar`；
2. 安装后必须重启 DSH 宿主，并硬刷新页面；
3. 检查 DSH 插件管理器中 `dsh-server-directory` 是否启用；
4. 查看 profile 的 `package.json` 中是否包含该 bundle。

### 连接提示“账号或密码错误”

- 检查用户名、密码、端口；
- SFTP 服务器是否允许密码认证；
- 账号是否被锁定；
- 如果服务器只允许 keyboard-interactive，插件会尝试用密码响应；仍失败时需要修改服务器 SSH 配置。

### 连接超时 / 拒绝连接

- 服务器地址和端口是否可达；
- 防火墙是否允许该端口；
- WSL 是否已启动；
- 服务器 sshd 是否在运行。

### FTPS 提示证书错误

- 确认服务器证书是否过期或域名不匹配；
- 仅在明确信任该服务器时勾选“允许自签名证书”；
- 生产环境不建议关闭证书校验。

### 上传没有反应

- 当前是否仍连接服务器；
- 是否有同名目录阻止上传；
- 是否触发了覆盖确认；
- 浏览器控制台和面板错误条是否显示错误；
- 如果是本地开发版本，刷新页面后再试。

### 目录显示不完整

目录超过 5000 项时只返回前 5000 项，底部会提示。请使用路径输入进入更具体的子目录。

### 支持断点续传或文件夹上传吗？

目前不支持。上传的是文件集合，文件夹需要手动创建结构后逐个上传。

### 密码可以改成每次询问吗？

当前版本会在添加服务器时保存密码。如需彻底移除密码，请删除该服务器，或删除 `secrets.json` 中对应条目（删除后需要重新编辑密码）。

---

## 14. 开发与架构

### 14.1 目录结构

```text
src/
  index.ts                 宿主侧入口、HTTP 路由、信任栅栏
  host/
    api.ts                 JSON 操作层
    store.ts               服务器/密码/主机指纹存储
    pool.ts                连接池与串行操作队列
    path.ts                远端路径与名称校验
    errors.ts              统一错误映射
    protocols/
      sftp.ts              ssh2 SFTP 适配器
      ftp.ts               basic-ftp FTP/FTPS 适配器
      host-key.ts          SFTP 主机指纹策略
  client/
    index.tsx              better-sidebar 页签注册
    Panel.tsx              主面板
    modals.tsx             服务器/主机指纹/名称/确认弹窗
    api.ts                 浏览器 API/XHR 客户端
    styles.ts              主题变量样式
```

### 14.2 数据流

```text
浏览器面板
  → /dsh-server-directory/api/*
  → ServerDirectoryApi
  → ConnectionPool（每服务器串行）
  → SftpAdapter / FtpAdapter
  → 远端服务器
```

- 密码从宿主存储读取后只交给协议适配器；
- API 响应只包含非敏感字段；
- 所有操作都在连接池中串行执行，避免 FTP 控制连接被并发命令污染。

### 14.3 开发命令

```powershell
pnpm typecheck   # TypeScript 检查
pnpm test        # 38 个测试
pnpm build       # 生成 lib/index.js 和 lib/client.js
pnpm run check   # 检查 + 测试 + 构建
```

测试包括：

- 路径、名称与删除保护；
- 服务器/密码存储；
- 错误映射；
- API 行为；
- 客户端首屏渲染；
- 基于进程内 SSH/SFTP 服务器的真实连接、上传、下载、重命名、递归删除；
- 基于进程内 FTP 服务器的连接和文件操作。
- SemVer 与 CHANGELOG 发布辅助逻辑。

### 14.4 发布

```powershell
pnpm release patch
git push origin main --follow-tags
```

推送 `v*` tag 会触发 GitHub Actions 的 Release workflow，重新测试、打包并创建 GitHub Release。npm 发布需要 npm 账号的 2FA 验证。

---

## 15. 卸载

从 profile 移除插件：

```powershell
dsh plugin --profile desktop remove dsh-server-directory
```

然后重启 DSH。若要同时删除本地配置，可删除：

```text
%USERPROFILE%\.dsh\server-directory\
```

删除前请确认不再需要其中的服务器密码和主机指纹。

---

## 16. 版本与许可

- 插件遵循 Semantic Versioning；
- npm 包：<https://www.npmjs.com/package/dsh-server-directory>
- GitHub Releases：<https://github.com/zhu0109/dsh-server-directory/releases>
- 变更记录：[CHANGELOG.md](../CHANGELOG.md)
- 许可证：[MIT](../LICENSE)

---

<p align="center"><sub>DSH Server Directory · 为 DeepSeek Harness 提供一个安静、直接、可控的远端文件工作区</sub></p>
