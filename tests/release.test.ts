import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  nextVersion,
  parseVersion,
  updateChangelog,
} from '../scripts/release-lib.mjs'

const REPO = 'https://github.com/zhu0109/dsh-server-directory'

function sampleChangelog(unreleased: string): string {
  return `# Changelog

## [Unreleased]

${unreleased}

## [0.1.0] - 2026-10-30

### Added

- Initial release.

[Unreleased]: ${REPO}/compare/v0.1.0...HEAD
[0.1.0]: ${REPO}/releases/tag/v0.1.0
`
}

describe('release version helpers', () => {
  it('parses and compares semantic versions', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
    expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(() => parseVersion('v1.0')).toThrow()
  })

  it('computes patch, minor, major and explicit versions', () => {
    expect(nextVersion('0.1.0', 'patch')).toBe('0.1.1')
    expect(nextVersion('0.1.9', 'minor')).toBe('0.2.0')
    expect(nextVersion('0.9.9', 'major')).toBe('1.0.0')
    expect(nextVersion('1.2.3', '4.5.6')).toBe('4.5.6')
  })
})

describe('changelog release transformation', () => {
  it('archives Unreleased content and updates version links', () => {
    const updated = updateChangelog(sampleChangelog('- Added a feature.'), {
      version: '0.2.0',
      date: '2026-11-01',
      repoUrl: REPO,
    })
    expect(updated).toContain('## [Unreleased]\n\n## [0.2.0] - 2026-11-01')
    expect(updated).toContain('## [0.2.0] - 2026-11-01\n\n- Added a feature.')
    expect(updated).toContain('## [0.1.0] - 2026-10-30')
    expect(updated).toContain(`[Unreleased]: ${REPO}/compare/v0.2.0...HEAD`)
    expect(updated).toContain(`[0.2.0]: ${REPO}/releases/tag/v0.2.0`)
  })

  it('requires a changelog entry unless opt-in', () => {
    expect(() => updateChangelog(sampleChangelog(''), {
      version: '0.2.0',
      date: '2026-11-01',
      repoUrl: REPO,
    })).toThrow(/Unreleased/)
    const updated = updateChangelog(sampleChangelog(''), {
      version: '0.2.0',
      date: '2026-11-01',
      repoUrl: REPO,
      allowEmpty: true,
    })
    expect(updated).toContain('- Maintenance release.')
  })
})
