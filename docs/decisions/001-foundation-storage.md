# 001 — Isolated redesign workspace and SQLite foundation

Date: 6 October 2026. Status: implemented for development; production migration remains deferred.

## Context

Legacy renderer state writes products and bills independently into a shared JSON store. The rebuild requires atomic stock/invoice operations, reliable recovery, and development that cannot initialize or reset the operator's current data.

## Decision

Use a separate Electron entry point and preload for the redesign. `npm run redesign` builds the renderer and opens the new shell. It always uses `<repository>/.local/redesign`; it never reads the legacy `.storage-config` pointer. The legacy launch and packaged entry point remain available while the rebuild progresses.

Use SQLite through the installed runtime's built-in `node:sqlite`, with WAL journaling, full synchronization, versioned migrations, and synchronous transactions. Verified locally with Electron 41.5.0 / Node 24.15.0 / SQLite 3.51.3. No third-party native database dependency was added. The built-in API's maturity and future runtime compatibility remain release-review items; there is no silent fallback to independent JSON writes.

Reference: [Node SQLite API](https://nodejs.org/api/sqlite.html) and [Electron 41 runtime announcement](https://www.electronjs.org/blog/electron-41-0). The local runtime probe, rather than the Node installation used by npm, establishes desktop compatibility.

The renderer receives only named methods through a sandboxed preload. Main-process handlers check the requesting frame and validate preference fields. External navigation/windows and permission requests are denied in this foundation workspace.

## Delivered schema and recovery boundary

Schema 1 stores preferences only: business details, theme, and remembered screen. It intentionally has no sample inventory or invoices. Catalog identities, counters, stock movements, and bill tables will arrive through later schema migrations; no claim is made that billing transactions are implemented yet.

Foundation backups are a versioned JSON envelope containing preferences and a SHA-256 checksum. The checksum detects accidental damage, not malicious authenticity. Writes use a flushed temporary file and rename. Restore validates the full payload, writes a safety backup, and replaces preferences in one transaction. Backup review uses a one-time main-process token so the renderer cannot substitute an arbitrary path or payload at confirmation.

These backups are not interchangeable with legacy app backups. They will be extended through explicit schema/version handling when operational data is introduced. Daily scheduling/retention remains in phase 7.

## Evidence and tradeoffs

Automated foundation tests cover persistence, field validation, transaction commit/rollback, abrupt child-process exit before commit, damaged/incompatible backup rejection, restore, and failure of the safety backup. Probe tables exercise atomic multi-record writes without exposing unfinished billing operations to the renderer.

This reduces migration risk but temporarily leaves two entry points. Production packaging/cutover must deliberately switch to the new entry point only after all release gates pass. The current CI Node version must be updated or foundation tests run under a compatible runtime before adding them to CI. Node 24 is the documented local test runtime.

## Verification on 6 October 2026

- Seven Node foundation tests passed, including interrupted-process recovery and safety-backup failure.
- Nine Jest tests passed across the shell and existing catalog importer.
- React production build passed with `CI=true` (warnings treated as errors by the build).
- Hidden Electron smoke test passed against a fresh `.local/smoke-*` store: narrow bridge, invalid theme rejection, navigation, persisted theme/screen after reload, and compact-width overflow check.
- Captured and inspected Products in light/compact layouts and Settings in dark mode. The smoke test uses offscreen rendering and software acceleration for hidden capture; a production installer and hardware-rendering smoke check remain part of the release phase.

The sandbox initially prevented Electron child processes from starting; the successful desktop test ran outside it with the same isolated test store policy. Existing live data was not opened or migrated.
