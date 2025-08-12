## DeadLink v2.12.0

### Major New Features
- Player Deep Dive select menu embedded directly in the Players dashboard (no need to run a separate command).
- Per-player distance tracking (session + lifetime) with average speed (m/min) in deep dive.
- Offline deep dive mode now shows last seen time, lifetime distance, deathless streak PB.
- Unified join/leave/death rich embeds (welcomes, departures, and contextual death reasons).

### Analytics & Gameplay Insights
- Deathless streak persistence with per-player PB tracking.
- Real-time narrative activity engine with biome, health, time-of-day, and blood moon context.
- Cluster analysis for player proximity plus MVP (highest kill rate) callout.
- Expanded players list metrics: kill rate, K/D, session length, deathless streak, distance.

### Reliability & Ops
- Heartbeat scheduling now deferred until after telnet connect + analytics load.
- Rotating file logger (5 x 512KB) with startup summary of existing log files.
- Safer telnet queue with timeouts and reconnection handling.
- Analytics persistence extended (sessions, baselines, streaks, travel metrics).

### UX & Dashboard
- Consistent navigation buttons across dashboard sub‑views.
- Info screen includes mode (Live vs 🧪 Dev) and consolidated feature list.
- Select menu maintains state when switching back to list view.

### Dev & Maintainability
- Structured log levels (error, warn, info, debug, success) with ANSI color + rotation.
- Test suite (Jest) covers config schema & smoke start.

### Internal / Future Hooks
- Placeholders added for crafting statistics (Undead Legacy integration path).
- Player travel & crafting structures persisted for future enrichment.

### Upgrade Notes
Just pull, install dependencies, re-register slash commands if upgrading from pre-2.10:
`npm run slash:guild` (or `slash:global`).

Distance tracking begins accumulating only after upgrading; lifetime distance is blank until movement is observed.

### Acknowledgements
Inspired by Dishorde (LakeYS). Rewritten and extended by CDRZ.
