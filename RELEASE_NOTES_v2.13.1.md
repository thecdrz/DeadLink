# Release v2.13.1

Release date: 2025-08-15

Changelog (selected):

- CI: Add smoke e2e demo check that runs the dev-mode demo client to detect regressions in telnet/demo flows.
- Tests: Add deterministic demo integration test to validate demo telnet startup messages.
- Scripts: Add `scripts/smoke-e2e.js` and `npm run smoke:e2e` for CI and local smoke runs.
- Docs: Documented smoke test workflow and reproduction in `SMOKE_TEST.md`.
- Stability: Relaxed and hardened smoke-e2e timing to reduce CI flakiness.

Notes:

- This patch does not change runtime behavior in production mode. The smoke checks run only in `DEV_MODE=true` and are safe to run in CI.
