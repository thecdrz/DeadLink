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
