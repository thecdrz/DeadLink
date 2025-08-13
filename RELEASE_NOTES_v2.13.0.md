# DeadLink v2.13.0

Release date: 2025-08-13

## Highlights
- Complete multi-stage visual redesign (glassmorphism) across site, telemetry dashboard, and analytics pages.
- Modernized docs styling and expanded gallery & devops guides.
- Telnet stream hardening: buffered line assembly, timestamp boundary splitting, inactivity watchdog, safe reconnect.
- Discord ↔ game bridge reliability: safeChannelSend retries, duplicate suppression, improved join/leave/death rich embeds.
- Anonymous telemetry enhancements: single-event helper, flush/buffer scripts, quick smoke test, HTML/MD report generator polish.
- Added LOC utility script and multiple new npm scripts for telemetry workflows.

## Changes
- `index.js`: robust telnet buffering, watchdog (lp probe), password re-dispatch, enhanced join/leave/death embeds, safeChannelSend with retries.
- `scripts/telemetry-report.js`: glass UI redesign & animation support.
- `docs/`: redesigned `index.html`, styles, additional themed variants and gallery/devops content.
- `scripts/`: new helpers (`send-telemetry-once.js`, `telemetry-flush-buffer.js`, `telemetry-smoke.js`, `loc.js`).
- `__tests__/`: added telnet buffering & GMSG parsing tests; telemetry coverage retained.
- `package.json`: version bump, scripts for telemetry & site report generation.
- `updates.json`: lastNotifiedVersion updated.

## Upgrade Notes
- No breaking config changes. Existing configs continue to work.
- Enhanced event embeds (join/leave/death) require `disable-misc-gmsgs` to be false (default) to appear.
- Optional Pino logging: set `LOG_ENGINE=pino` (or `pino+console`) for structured logs.
- Telemetry remains opt-out; to disable set `analytics.enabled=false` or env override.

## Next Focus (Planned)
- Further stabilization of inbound telnet stream (additional diagnostics if silence persists).
- Slash command UX polish & richer dashboard interactions.

Thank you for using DeadLink! Contributions & feedback welcome.
