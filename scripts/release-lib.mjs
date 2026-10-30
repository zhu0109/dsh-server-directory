/**
 * Pure helpers for the release script. Kept separate from release.mjs so the
 * SemVer and CHANGELOG transformations can be tested without touching git.
 */

/**
 * @param {string} version
 * @returns {number[]}
 */
export function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`无效版本号：${version}（需要 X.Y.Z）`)
  return match.slice(1).map(Number)
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

/**
 * @param {string} current
 * @param {string} request
 * @returns {string}
 */
export function nextVersion(current, request) {
  if (request === 'patch' || request === 'minor' || request === 'major') {
    const [major, minor, patch] = parseVersion(current)
    if (request === 'patch') return `${major}.${minor}.${patch + 1}`
    if (request === 'minor') return `${major}.${minor + 1}.0`
    return `${major + 1}.0.0`
  }
  parseVersion(request)
  return request
}

/**
 * Move the Unreleased section into a dated release and update link refs.
 *
 * @param {string} text
 * @param {{ version: string, date: string, repoUrl: string, allowEmpty?: boolean }} options
 * @returns {string}
 */
export function updateChangelog(text, options) {
  const { version, date, repoUrl, allowEmpty = false } = options
  const marker = '## [Unreleased]'
  const markerIndex = text.indexOf(marker)
  if (markerIndex < 0) throw new Error('CHANGELOG.md 缺少 "## [Unreleased]" 段')
  const contentStart = markerIndex + marker.length
  const nextHeading = text.indexOf('\n## ', contentStart)
  if (nextHeading < 0) throw new Error('CHANGELOG.md 的 Unreleased 段后缺少已发布版本段')
  const unreleased = text.slice(contentStart, nextHeading).trim()
  if (!unreleased && !allowEmpty) {
    throw new Error('CHANGELOG.md 的 Unreleased 段为空。请先记录本次变更，或使用 --allow-empty。')
  }

  const rest = text.slice(nextHeading + 1)
  const content = unreleased || '- Maintenance release.'
  let updated = `${text.slice(0, markerIndex)}${marker}\n\n`
    + `## [${version}] - ${date}\n\n${content}\n\n${rest}`

  updated = updated.replace(
    /^\[Unreleased\]: .*$/m,
    `[Unreleased]: ${repoUrl}/compare/v${version}...HEAD`,
  )
  if (!updated.includes(`[${version}]:`)) {
    updated = updated.replace(
      /^(\[Unreleased\]: .*)$/m,
      `$1\n[${version}]: ${repoUrl}/releases/tag/v${version}`,
    )
  }
  return updated
}
