# Release v2.13.2 (pre-release)

Release date: 2025-08-15

NOTE: This release is being published as a pre-release while we validate the deployment and CI matrix. It's safe to try in development or staging environments; for production, wait for the final release.

Changelog (selected):

- Fix: Ensure log rotation leaves an active `deadlink.log` file after rotation to avoid missing log file edge-cases (fixes CI test).
- Fix: Allow running in `dev-mode` when Discord token is not configured (prevents demo-mode child process from exiting early during integration tests).
- Tests: Verified `__tests__/demo.integration.test.js` and `__tests__/log-utils.test.js` pass across test matrix.

Notes:

- These are small, backward-compatible fixes; production behavior is unchanged when running in live mode.

If you'd like me to promote this to a full release (remove the pre-release flag), say so and I'll update the release on GitHub.
