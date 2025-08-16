# DeadLink v2.13.3 (2025-08-16)

Highlights
- Centralized UI constants for consistent emoji/labels (`lib/uiConstants.js`).
- Moved embed legend to `lib/embeds.js` and added consistent legend usage across Dashboard & Info.
- Demo telnet client now emits `data` events to quiet dev-mode watchdog during development.
- Normalized telnet error logging with `formatErrorForLog()` for clearer diagnostics.
- Added deterministic snapshot tests for embeds and CI-friendly date mocking.
- Minor refactors and test hygiene: fixed open handles and added lifecycle cleanup.

See commits for full details.
# Release v2.13.3

Release date: 2025-08-15

Changelog (selected):

- Docs: Removed accidental full-file code fences from `docs/guide/*.md` and hardened the client-side docs loader.
- CI: Added docs fence detection and lightweight docs link checks via `scripts/check-docs-fences.js` and `scripts/check-doc-links.js`.
- Tests: Fixed lingering async handle in `lib/http-utils.js` so Jest exits cleanly.
- Docs: Cleaned legacy/alternate docs pages and consolidated canonical site assets.
- Misc: Minor fixes to log rotation behavior to ensure active log file presence after rotation.

Notes:

- This is a docs and tooling focused patch; no breaking changes to runtime behavior are expected.
- Marked as prerelease for final QA before broader publication.
