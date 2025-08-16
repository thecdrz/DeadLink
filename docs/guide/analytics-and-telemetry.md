# Analytics & Telemetry
# Analytics & Telemetry

## Gameplay Analytics
DeadLink tracks non-PII server activity to provide insights:
- Player counts over time (history)
- Session estimates, retention, activity patterns
- Optional PNG charts (attachment-based embeds)

Persistent data is stored in analytics.json (gitignored).

## Anonymous Telemetry (Bot Analytics)
- Purpose: aggregate usage to improve DeadLink reliability and UX
- Privacy-first: no PII, no tokens, no guild or user IDs, no IPs
- Data points: app version, Node version, platform/arch, feature flags, dev mode, chart availability, optional events (startup, discord_ready, channel_bound, UI clicks)
- Default: enabled; Opt-out via config.analytics.enabled=false or env DEADLINK_ANALYTICS=0
- Endpoint override: config.analytics.endpoint or DEADLINK_ANALYTICS_ENDPOINT
- Instance ID: random UUID stored locally in telemetry.json (no linkage to Discord)

### Reliability and buffering
- Events are queued in-memory and periodically flushed.
- If the endpoint is unreachable, events are persisted to a local buffer file (./logs/telemetry-buffer.jsonl) and retried.
- Tuning: `flushIntervalMs`, `batchSize`, `bufferEnabled`, `bufferPath` under `analytics.*`.
- Debug: set `DEADLINK_TELEMETRY_DEBUG=1` to print sends and endpoint at startup.

### Self-host the telemetry endpoint (optional)
- Start a local receiver: `npm run telemetry:serve` (listens on http://localhost:8787)
- Point the bot to it by setting either:
	- config.analytics.endpoint: "http://localhost:8787/v1/event"
	- or environment DEADLINK_ANALYTICS_ENDPOINT=http://localhost:8787/v1/event
- Events are appended to logs/telemetry-events.jsonl in JSON Lines format.

