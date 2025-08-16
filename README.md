# DeadLink – 7 Days to Die Server Companion

<p align="center">
			<img alt="DeadLink logo" src="docs/assets/deadlink-logo.png" width="370" />
</p>

[![Latest release](https://img.shields.io/github/v/release/thecdrz/DeadLink?sort=semver)](https://github.com/thecdrz/DeadLink/releases/latest)

DeadLink is a modern 7 Days to Die Server Companion that integrates your server with Discord. It provides a clean dashboard, real‑time analytics, horde‑night context, and safe server actions—purpose‑built for running and showcasing your world. Docker‑friendly, secure by default, and tuned for smooth screenshot and admin workflows.

## Highlights
- Fully rewritten, dashboard‑first GUI (buttons, selects) — fast, clean, slash‑only
- Update system: check releases, view notes, and optionally announce to a channel
- Persistent, structured logs (rotating) with startup summary and clear levels
- Reliable telnet pipeline (queued, timed, reconnecting) with scoped actions
- Analytics: player trends, clusters, MVP, deep‑dive stats (session, distance, streaks)
- Interactive dashboard: Activity (brief default with Details), Players (list + deep dive picker), Trends, Info — all with consistent navigation
- Player stats and trends: ping quality, distance traveled, session length, deathless streaks, clusters, and time‑series patterns
- Jest smoke and unit tests for quick validation

Note: PNG trend charts and config validation are optional features. They are listed as optionalDependencies and will install on supported systems; if they fail to build, you can install them manually:
`npm i chartjs-node-canvas chart.js canvas zod`

DeadLink runs as a separate companion via telnet—no game mods required. **Supports Windows and Linux dedicated servers; console servers aren’t supported.**

## Key Features
- Daily Activity Reports — automatic summaries of joins, leaves, deaths, chat, and events to Discord
- Horde Night Alerts — polite, rate‑limited Blood Moon warnings with cool‑downs and context
- Player & Server Trends — history, peaks, and patterns; optional PNG charts when available
- Interactive Dashboard — buttons for Activity, Players, Trends, and Info; brief‑by‑default with Details toggle
- Player Deep Dive — per‑player stats (ping, distance, session, streaks, last seen)
- Safe Server Controls — scoped actions (no raw telnet spam) for a safer ops workflow
- Logs & Updates — rotating structured logs; release checks and optional announcement posts
# DeadLink — 7 Days to Die Server Companion

[![Latest release](https://img.shields.io/github/v/release/thecdrz/DeadLink?sort=semver)](https://github.com/thecdrz/DeadLink/releases/latest)

DeadLink is a lightweight, dashboard-first Discord companion for 7 Days to Die servers. It connects to a server's telnet interface, summarizes activity, provides player analytics, issues polite Blood Moon alerts, and exposes a small interactive dashboard via Discord slash commands.

This repository is a maintained fork with added analytics, a modern dashboard UI, test coverage, and improved lifecycle/logging utilities.

---

## Quick start

Requirements
- Node.js (LTS, tested on 18/20/22)
- A Discord bot application (bot token + client ID)
- Telnet enabled on the target 7 Days to Die dedicated server

Install & run (local development)

```powershell
# Install deps
npm install

# Provide secrets via environment (recommended) and start
$env:DISCORD_TOKEN = "<your-bot-token>"
$env:TELNET_IP = "127.0.0.1"
$env:TELNET_PORT = "8081"
$env:TELNET_PASSWORD = "changeme"
node index.js
```

For demos or screenshots, set `DEV_MODE=true` to enable the simulated telnet/demo server.

---

## Key features
- Interactive dashboard via slash commands (`/dashboard`, `/activity`, `/players`, `/trends`, `/info`, `/update`)
- Player analytics and trends (session lengths, distances, streaks)
- Polite Blood Moon alerts with rate limiting and context
- Safe telnet pipeline with queued commands, timeouts, and reconnection logic
- Rotating structured logs and an updates checker (optional announcements)
- Test suite (Jest) and small telemetry tooling for local validation

---

## Configuration
Primary configuration lives in `config.json` (rename from `config.example.json`), but the app prefers environment variables for secrets.

Important environment variables
- `DISCORD_TOKEN` — bot token (required for live mode)
- `DISCORD_CLIENT_ID` — Application (Client) ID (for registering slash commands)
- `DISCORD_GUILD_ID` — optional; register slash commands to one guild for instant availability
- `TELNET_IP`, `TELNET_PORT`, `TELNET_PASSWORD` — telnet connection details
- `DEV_MODE` — `true` to run the demo/telnet simulator (good for screenshots/tests)

Relevant config sections in `config.json`
- `bloodMoon` — monitor options (enabled, poll interval, frequency)
- `updates` — release-checking and announcement options (`enabled`, `intervalHours`, `prerelease`, `notifyMode`, `notifyChannel`)

See `lib/configSchema.js` for the complete schema and defaults.

---

## Scripts
Available npm scripts (run with `npm run <script>`):

- `start` — run the app (`node index.js`)
- `test` — run Jest tests
- `smoke:e2e` — run end-to-end smoke script
- `slash:global` / `slash:guild` — register slash commands globally or to a guild
- `telemetry:*` — telemetry helper scripts (serve/send/flush/report)
- `snapshots*` — snapshot embeds and animations (for visual tests)

Check `package.json` for the full list and exact usage examples.

---

## Development notes
- New helper modules live in `lib/` (examples: `lib/log-utils.js`, `lib/lifecycle.js`, `lib/fs-utils.js`, `lib/telemetry.js`).
- The app uses a lifecycle registry to clean up timers and servers to avoid leaked handles in tests.
- Optional PNG charts require `canvas` / `chartjs-node-canvas` and are listed as optional dependencies; the code falls back gracefully if unavailable.

---

## Testing
Run the full test suite locally:

```powershell
npm test
```

For verbose JSON output suitable for CI or local inspection:

```powershell
npm run test:json
```

If you see Jest warnings about open handles, run with `--detectOpenHandles` to diagnose them.

---

## Releases & publishing
- Create a `RELEASE_NOTES_vX.Y.Z.md` file for the tag you will push.
- Bump `package.json` and `version.json` as needed.
- Tag the commit (`git tag -a vX.Y.Z -m 'vX.Y.Z'`) and push tags.
- GitHub Actions will build and publish releases on tag push (or run the manual release workflow if needed).

To create or edit releases locally using the GitHub CLI (if installed):

```powershell
& 'C:\Program Files (x86)\GitHub CLI\gh.exe' release create vX.Y.Z --title 'vX.Y.Z' --notes-file 'RELEASE_NOTES_vX.Y.Z.md' --repo thecdrz/DeadLink
```

---

## Docs & website
Docs live under `docs/` and are used by the GitHub Pages site. If the site looks broken, ensure `docs/styles.css` exists and that the `docs/index.html` links are correct (we fixed the stylesheet path in recent changes). The changelog page attempts to fetch `RELEASE_NOTES_v<version>.md` from the `master` branch; ensure `version.json` points to the intended `lastAnnouncedVersion`.

---

## Security
- Never commit `config.json` with secrets. Keep tokens and passwords in environment variables.
- `allow-exec-command` and similar options that execute telnet actions should be used with caution; they may allow powerful operations if misconfigured.

---

## License & credits
MIT — this project builds on Dishorde by LakeYS with substantial enhancements by CDRZ.

Project: https://github.com/thecdrz/DeadLink
Original: https://github.com/LakeYS/Dishorde

---

If you'd like a shorter README (or a separate CONTRIBUTING / MAINTAINER guide), say which sections to trim and I'll update accordingly.
- `log-telnet` - All output from the connection will show up in the terminal.
