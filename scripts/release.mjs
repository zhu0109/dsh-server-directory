#!/usr/bin/env node
/**
 * Local release helper.
 *
 *   pnpm release patch
 *   pnpm release minor
 *   pnpm release major
 *   pnpm release 1.2.3
 *   pnpm release patch --push
 *
 * The script refuses to run on a dirty tree, runs the full check first, bumps
 * package.json, archives the CHANGELOG Unreleased section, then creates a
 * release commit and an annotated vX.Y.Z tag. Pushing is opt-in.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareVersions, nextVersion, updateChangelog } from './release-lib.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHANGELOG = join(ROOT, 'CHANGELOG.md')
const PACKAGE = join(ROOT, 'package.json')
const REPO_URL = 'https://github.com/zhu0109/dsh-server-directory'

const args = process.argv.slice(2)
const shouldPush = args.includes('--push')
const allowEmpty = args.includes('--allow-empty')
const request = args.find(value => !value.startsWith('--'))

function die(message) {
  console.error(`\n[release] ${message}\n`)
  process.exit(1)
}

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    ...options,
  })
}

function runPnpm(commandArgs) {
  const execPath = process.env.npm_execpath
  if (execPath) {
    return run(process.execPath, [execPath, ...commandArgs])
  }
  return run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', commandArgs, {
    shell: process.platform === 'win32',
  })
}

function output(command, commandArgs) {
  return execFileSync(command, commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()
}

function localDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

if (!request) {
  die('用法：pnpm release <patch|minor|major|X.Y.Z> [--push] [--allow-empty]')
}

const status = output('git', ['status', '--porcelain'])
if (status) {
  die('工作区不干净。请先提交或 stash 所有改动。')
}

const branch = output('git', ['branch', '--show-current'])
if (shouldPush && branch !== 'main') {
  die(`--push 只能在 main 分支使用，当前是 ${branch || '(detached)'}`)
}

const packageJson = JSON.parse(readFileSync(PACKAGE, 'utf8'))
const current = String(packageJson.version)
let version
try {
  version = nextVersion(current, request)
  if (compareVersions(version, current) <= 0) {
    throw new Error(`新版本 ${version} 必须大于当前版本 ${current}`)
  }
} catch (error) {
  die(error instanceof Error ? error.message : String(error))
}

console.log(`[release] 当前 ${current} -> 目标 ${version}`)
console.log('[release] 运行完整检查…')
runPnpm(['run', 'check'])

const postCheckStatus = output('git', ['status', '--porcelain'])
if (postCheckStatus) {
  die('检查过程改动了工作区（通常是 lib 构建结果）。请提交这些改动后重新发布。')
}

packageJson.version = version
writeFileSync(PACKAGE, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')

const changelog = readFileSync(CHANGELOG, 'utf8')
try {
  writeFileSync(CHANGELOG, updateChangelog(changelog, {
    version,
    date: localDate(),
    repoUrl: REPO_URL,
    allowEmpty,
  }), 'utf8')
} catch (error) {
  die(error instanceof Error ? error.message : String(error))
}

run('git', ['add', 'package.json', 'CHANGELOG.md'])
run('git', ['commit', '-m', `chore(release): v${version}`])
run('git', ['tag', '-a', `v${version}`, '-m', `v${version}`])

console.log(`\n[release] 已创建提交和 tag v${version}`)
if (shouldPush) {
  run('git', ['push', 'origin', 'main', '--follow-tags'])
  console.log(`[release] 已推送 main 和 v${version}；GitHub Actions 将创建 Release。`)
} else {
  console.log('[release] 下一步：')
  console.log('  git push origin main --follow-tags')
  console.log('  或使用：pnpm release <版本> --push')
}
