Title: Refactor: centralize fs/http/lifecycle utils, fix telemetry, test hygiene

Summary:
- Added small utility modules to reduce duplication and improve testability:
  - lib/fs-utils.js (safeReadJson, safeWriteJson, safeAppendLine, safeReadLines, safeWriteFile)
  - lib/http-utils.js (httpGetJson, postJson)
  - lib/lifecycle.js (registerTimeout/registerInterval/registerServer/shutdown)
  - lib/log-utils.js (log file rotation helpers)
- Fixed a telemetry regression by exporting missing fs helpers.
- Registered long-lived timers/servers with lifecycle so tests can clean them up.
- Added process shutdown wiring to call lifecycle.shutdown on SIGINT/SIGTERM/beforeExit.
- Adjusted demo integration test to spawn a real child process (unset JEST_WORKER_ID and NODE_ENV).

Why:
- Reduce duplicate code and centralize common concerns.
- Improve test stability and make long-lived handles easier to manage in CI.

Notes for reviewers:
- All unit/integration tests pass locally: 16 suites, 32 tests.
- Jest still prints the common "did not exit" warning; lifecycle registration reduces lingering handles but some libs hold internal handles that are safe.

Next steps (optional, follow-ups):
- Wire lifecycle.shutdown into a centralized CLI/daemon manager and call it from the test harness where appropriate.
- Add unit tests for lifecycle.js and http-utils.js.
- Consider moving log rotation to a configurable logger module.

Files changed (high level):
- Added: lib/log-utils.js
- Updated: index.js, __tests__/demo.integration.test.js
- (Other helper files were added/updated in previous commits)

Checklist:
- [x] Tests pass locally
- [x] Small, non-breaking refactors
- [x] PR description and changelog prepared
