# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Illustrated Chinese plugin guide with feature screenshots in `docs/plugin-guide.md`.

### Fixed

- Keep the selected `FileList` snapshot before clearing the upload input, so uploading through the file picker starts reliably.

## [0.1.1] - 2026-10-30

### Changed

- Prepare npm distribution and advance the GitHub tag install example to `v0.1.1`.

## [0.1.0] - 2026-10-30

### Added

- DSH better-sidebar page for browsing and managing remote server directories.
- Multi-server inventory with independent connections and server switching.
- SFTP, FTP, explicit FTPS and implicit FTPS support with password authentication.
- SFTP SHA256 host-key confirmation and changed-key protection.
- Remote directory browsing with breadcrumbs, direct path entry and refresh.
- Create folder, rename, recursive delete, file download and upload operations.
- Drag-and-drop upload to the current directory or a specific directory row.
- Upload queue with progress, cancellation and overwrite confirmation.
- Host-side password storage that is never returned to the browser.
- Fenced HTTP API using the DSH connection trust service.
- Unit tests plus in-process SFTP/FTP integration tests.

[Unreleased]: https://github.com/zhu0109/dsh-server-directory/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/zhu0109/dsh-server-directory/releases/tag/v0.1.1
[0.1.0]: https://github.com/zhu0109/dsh-server-directory/releases/tag/v0.1.0
