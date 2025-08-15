## Unreleased

- Refactor: centralize filesystem helpers (lib/fs-utils.js) and HTTP helpers (lib/http-utils.js)
- New: lifecycle manager (lib/lifecycle.js) to track timers/servers and support clean shutdown
- New: log utilities (lib/log-utils.js) for log rotation
- Fix: telemetry buffer regression (missing fs helper export)
- Test: prevent spawned demo processes from inheriting Jest env (unset JEST_WORKER_ID/NODE_ENV in integration test)
- CI: add process shutdown wiring to call lifecycle.shutdown on SIGINT/SIGTERM

All tests pass locally (16 suites, 32 tests).
