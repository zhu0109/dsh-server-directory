import type { ReactNode } from 'react'

export interface IconProps {
  size?: number
}

function svg(size: number, path: ReactNode, viewBox = '0 0 24 24'): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  )
}

function icon(draw: (size: number) => ReactNode): (props: IconProps) => ReactNode {
  return function Icon({ size = 16 }: IconProps): ReactNode {
    return draw(size)
  }
}

export const ServerIcon = icon(size => svg(size,
  <>
    <rect x="3" y="4" width="18" height="6" rx="1.5" />
    <rect x="3" y="14" width="18" height="6" rx="1.5" />
    <path d="M7 7h.01M7 17h.01" />
    <path d="M11 7h6M11 17h6" />
  </>))

export const FolderIcon = icon(size => svg(size,
  <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />))

export const FileIcon = icon(size => svg(size,
  <>
    <path d="M6 3h7l5 5v13H6z" />
    <path d="M13 3v5h5" />
  </>))

export const LinkIcon = icon(size => svg(size,
  <>
    <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
    <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
  </>))

export const UnknownIcon = icon(size => svg(size,
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-.9.7-1.5 1.2-1.5 2.5M12 17h.01" />
  </>))

export const PlusIcon = icon(size => svg(size, <path d="M12 5v14M5 12h14" />))

export const RefreshIcon = icon(size => svg(size,
  <>
    <path d="M20 11a8 8 0 1 0-2.3 6.7" />
    <path d="M20 4v7h-7" />
  </>))

export const UpIcon = icon(size => svg(size, <path d="M12 19V5M6 11l6-6 6 6" />))

export const UploadIcon = icon(size => svg(size,
  <>
    <path d="M12 16V4M8 8l4-4 4 4" />
    <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
  </>))

export const DownloadIcon = icon(size => svg(size,
  <>
    <path d="M12 4v12M8 12l4 4 4-4" />
    <path d="M4 18v.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V18" />
  </>))

export const TrashIcon = icon(size => svg(size,
  <>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    <path d="M10 11v5M14 11v5" />
  </>))

export const EditIcon = icon(size => svg(size,
  <>
    <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16z" />
    <path d="M13 6l4 4" />
  </>))

export const CloseIcon = icon(size => svg(size, <path d="M6 6l12 12M18 6L6 18" />))

export const ChevronIcon = icon(size => svg(size, <path d="M9 6l6 6-6 6" />))

export const SettingsIcon = icon(size => svg(size,
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.9v-4H3a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>))
