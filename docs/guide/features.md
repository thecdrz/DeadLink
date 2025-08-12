# Features

A high‑level overview of DeadLink’s capabilities.

## Key Features
- Daily Activity Reports — automatic summaries of joins, leaves, deaths, chat, and notable events posted to Discord
- Horde Night Alerts — polite, rate‑limited warnings with Blood Moon context and cool‑downs
- Player & Server Trends — history, peaks, and consistency; optional charts when dependencies are available
- Interactive Dashboard — buttons for Activity, Players, Trends, Info; brief‑by‑default with a Details toggle
- Player Deep Dive — inspect per‑player stats (ping, distance, session length, deathless streaks, last seen)
- Safe Server Controls — scoped actions; no raw telnet spam in channels
- Logs & Updates — rotating logs with levels; release checks and optional public announcements

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
