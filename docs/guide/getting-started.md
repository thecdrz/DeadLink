# Getting Started

Welcome to DeadLink! This quick start helps you run the bot and see the dashboard in minutes.

## Prerequisites
- Node.js LTS installed
- A Discord bot token (from the Developer Portal)
- Your 7 Days to Die server telnet credentials

## Run locally
```powershell
$env:DISCORD_TOKEN = "<bot token>"
$env:TELNET_PASSWORD = "<telnet password>"
$env:TELNET_IP = "<server ip>"
$env:TELNET_PORT = "<port>"
$env:DISCORD_CHANNEL = "<channel id>"
node index.js
```

Tip: set `DEV_MODE=true` for a simulated telnet source in screenshots/demos.

## Register slash commands
```powershell
# Global (may take ~1 hour)
npm run slash:global

# Guild (instant) – set your guild ID first:
$env:DISCORD_GUILD_ID = "<your_guild_id>"; npm run slash:guild
```

## Docker
Use the published image on GHCR:

```powershell
docker run --name deadlink -d `
  -e DISCORD_TOKEN=$env:DISCORD_TOKEN `
  -e TELNET_PASSWORD=$env:TELNET_PASSWORD `
  -e TELNET_IP=$env:TELNET_IP `
  -e TELNET_PORT=$env:TELNET_PORT `
  -e DISCORD_CHANNEL=$env:DISCORD_CHANNEL `
  -e DEV_MODE=true `
  ghcr.io/thecdrz/deadlink:latest
```

## What you'll see (annotated)

Below are quick previews of the main dashboards. Click to open the full image in the Gallery.

<figure>
  <a href="assets/snapshots/terminal-startup.png" target="_blank" rel="noopener">
    <img alt="Terminal startup logs with clean sections for init, telnet, discord, analytics, updates" src="assets/snapshots/terminal-startup.png">
  </a>
  <figcaption>
    Terminal — Clean, structured startup logs show config, telnet/Discord connect, analytics load, and update checks.
  </figcaption>
</figure>

<figure>
  <a href="assets/snapshots/dashboard-trends.png" target="_blank" rel="noopener">
    <img alt="Trends dashboard showing player count and server metrics with navigation buttons" src="assets/snapshots/dashboard-trends.png">
  </a>
  <figcaption>
    Trends – Use the navigation buttons to switch between Activity, Players, Time, and Info.
  </figcaption>
</figure>

<figure>
  <a href="assets/snapshots/activity-brief.png" target="_blank" rel="noopener">
    <img alt="Activity (brief) with blood moon context and alerts" src="assets/snapshots/activity-brief.png">
  </a>
  <p>Prefer the full narrative? See <a href="assets/snapshots/activity-full.png" target="_blank" rel="noopener">Activity (full)</a>.</p>
  <figcaption>
    Activity – Narrative feed enriched with biome, time-of-day, and horde-night cues.
  </figcaption>
</figure>

<figure>
  <a href="assets/snapshots/players.png" target="_blank" rel="noopener">
    <img alt="Players view showing online roster with per-player stats" src="assets/snapshots/players.png">
  </a>
  <figcaption>
  Players – Live roster with session stats, ping, and deathless streak.
  </figcaption>
</figure>

<figure>
  <a href="assets/snapshots/player-deep-dive.png" target="_blank" rel="noopener">
    <img alt="Player Deep Dive select menu with per-player distance and streak metrics" src="assets/snapshots/player-deep-dive.png">
  </a>
  <figcaption>
    Player Deep Dive – Select a player to view lifetime distance, last seen, and PB streaks.
  </figcaption>
</figure>

<p>
  See more examples in the <a href="../gallery.html">Gallery</a>.
  In dev mode, the bot generates mock data to explore these views without a live server.
  Enable with <code>DEV_MODE=true</code>.
  For a headless preview pipeline, run <code>npm run snapshots</code> to regenerate these images.
  Images are saved to <code>docs/assets/snapshots/</code>.
</p>
