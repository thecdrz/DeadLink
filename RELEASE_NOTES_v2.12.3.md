# DeadLink v2.12.3

Release date: 2025-08-12

Highlights
- Anonymous telemetry reliability: durable in-memory queue with file-backed buffer for offline persistence.
- Local/self-hosted telemetry receiver for dev/testing (`npm run telemetry:serve`).
- HTTP support in telemetry client (works with http:// and https:// endpoints).
- Debug toggles and tuning knobs for telemetry (flush interval, batch size).
- Tests: added telemetry posting and buffering tests; enabled full suite in CI across Node 18/20/22.
- Docs: added analytics/telemetry guide (self-hosting + buffering), config reference updated.

Changes
- lib/telemetry.js: queue + buffer, protocol selection, `flushNow()` API.
- __tests__: `telemetry.test.js`, `telemetry-buffer.test.js`.
- scripts/telemetry-server.js: minimal JSONL receiver.
- docs/guide: telemetry docs and configuration updates.
- config.example.json: new analytics.* fields (endpoint, bufferEnabled, bufferPath, flushIntervalMs, batchSize).
- .gitignore: ignore telemetry JSONL files.

Upgrade notes
- No breaking changes. Telemetry remains opt-out via config or env.
- New config keys under `analytics.*` are optional; sensible defaults apply.
- If you self-host the endpoint, set DEADLINK_ANALYTICS_ENDPOINT or configure `analytics.endpoint`.

Thanks for using DeadLink!
