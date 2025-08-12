# Features

A high-level overview of DeadLink’s capabilities.

## Dashboards
- Interactive Dashboard with buttons: Activity, Players, Time, Info
- Trends dashboard with optional charts, insights, and patterns
- Player Deep Dive selector integrated into Players view

## Analytics
- Player counts with 24h averages, peaks, and consistency
- Narrative Activity engine with biome/time/health context
- Cluster detection (nearby players), MVP callouts
- Distance tracking (session + lifetime) and average speed
- Deathless streaks with personal bests

## Operations & Reliability
- Telnet queue with timeouts and reconnection
- Deferred scheduling until connect + analytics load
- Rotating file logs with levels (error, warn, info, debug)

## Security
- Scoped actions and safer defaults; no raw telnet spam
- Slash-first command UX (legacy text commands removed)

## Telemetry (opt-out)
- Anonymous, local-only telemetry: lifecycle + UI view events
- Toggle or purge at any time; stored in repo folder

## Dev & CI
- Jest test suite for smoke/config
- Puppeteer snapshots for website previews
- GitHub Pages site with Gallery + Docs

See also:
- [Getting Started](#/getting-started)
- [Analytics & Telemetry](#/analytics-and-telemetry)
- [DevOps](../devops.html)
