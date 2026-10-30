export function parseVersion(version: string): number[]
export function compareVersions(left: string, right: string): number
export function nextVersion(current: string, request: string): string
export function updateChangelog(
  text: string,
  options: {
    version: string
    date: string
    repoUrl: string
    allowEmpty?: boolean
  },
): string
