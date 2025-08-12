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

