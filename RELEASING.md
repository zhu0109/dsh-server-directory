# 版本与发布

本项目使用 [Semantic Versioning](https://semver.org/) 和 Git tag 管理版本。

## 版本号规则

- `MAJOR.MINOR.PATCH`，当前处于 `0.y.z` 阶段。
- 新增兼容功能：`minor`，例如 `0.1.0 -> 0.2.0`。
- 向后兼容的修复、文档和内部调整：`patch`，例如 `0.1.0 -> 0.1.1`。
- `0.y` 阶段的不兼容变更提升 `minor`，并在 CHANGELOG 中写明迁移方式。
- 进入稳定期后，不兼容变更提升 `major`。
- 版本 tag 统一为 `vX.Y.Z`，例如 `v0.1.0`。
- tag 必须与 `package.json` 中的 `version` 一致。

## 日常提交

提交信息建议使用 Conventional Commits：

```text
feat: add directory drag upload
fix: handle expired SFTP connection
docs: explain WSL SFTP setup
chore: update dependencies
```

功能或修复合并前必须通过：

```powershell
pnpm run check
```

CI 会在每次 push 到 `main` 和每个 pull request 上执行同一套检查。

## 发布新版本

1. 在 `CHANGELOG.md` 的 `## [Unreleased]` 下写清本次变更。
2. 确认工作区干净，且已经推送 `main`。
3. 执行版本脚本：

```powershell
pnpm release patch
# 或
pnpm release minor
# 或明确指定版本
pnpm release 1.0.0
```

脚本会：

- 校验工作区干净；
- 执行 `pnpm run check`；
- 更新 `package.json` 版本；
- 把 `Unreleased` 内容归档到新版本；
- 创建 `chore(release): vX.Y.Z` 提交和带注释的 Git tag。

4. 推送提交和 tag：

```powershell
git push origin main --follow-tags
```

也可以让脚本直接推送：

```powershell
pnpm release patch --push
```

5. 推送 tag 后，GitHub Actions 的 **Release** workflow 会再次构建和测试，生成 `.tgz` 包并创建 GitHub Release。发布说明由 GitHub 自动生成，CHANGELOG 仍是人工可读的权威记录。

## 安装指定版本

DSH 可以从 GitHub tag 安装已提交的 `lib` 产物：

```powershell
dsh plugin --profile desktop add --ignore-scripts "github:zhu0109/dsh-server-directory#v0.1.0"
```

升级时重新执行安装命令并替换 tag，然后重启 DSH、硬刷新页面。

## 版本历史

| 版本 | 日期 | 说明 |
|---|---|---|
| 0.1.0 | 2026-10-30 | 首个可用版本：多服务器 SFTP/FTP 目录管理 |
