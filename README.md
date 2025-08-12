# DeadLink – 7 Days to Die Server Companion

<p align="center">
	<img alt="DeadLink logo" src="docs/assets/deadlink-logo-light.png" width="256" />
</p>

[![Latest release](https://img.shields.io/github/v/release/thecdrz/DeadLink?sort=semver)](https://github.com/thecdrz/DeadLink/releases/latest)

DeadLink is a modern 7 Days to Die Server Companion that integrates your server with Discord. It provides a clean dashboard, real‑time analytics, horde‑night context, and safe server actions—purpose‑built for running and showcasing your world. Docker‑friendly, secure by default, and tuned for smooth screenshot and admin workflows.

## Highlights
### Highlights
- Slash commands + Dashboard UI for all interactions (legacy text commands removed)
- Safer telnet commands via a queued executor with light rate limiting
- Friendlier user errors when the server is loading/not connected/timeouts
- Optional PNG trend charts in Trends (falls back to ASCII if deps missing)
- Optional config validation (zod) with human-readable warnings
- Test scaffolding (Jest) for quick smoke checks

Note: PNG trend charts and config validation are optional features. They are listed as optionalDependencies and will install on supported systems; if they fail to build, you can install them manually:
`npm i chartjs-node-canvas chart.js canvas zod`

DeadLink runs as a separate companion via telnet—no game mods required. **Supports Windows and Linux dedicated servers; console servers aren’t supported.**

## Slash Commands
DeadLink now uses slash commands for everything. Use these:

- `/dashboard` – Show the interactive dashboard with buttons
- `/activity [mode]` – Show the latest activity (mode: `brief` default | `full`)
	- Defaults to a compact summary; use the in-message “Details” button or `/activity full` for the full narrative.
- `/players` – Show current players online
- `/time` – Show current in-game time
- `/trends` – Show player analytics and trends
- `/info` – Show DeadLink information and features
 - `/update` – Check latest release, view notes, or announce (public)

To register commands, set these environment variables:

- `DISCORD_TOKEN` – your bot token
- `DISCORD_CLIENT_ID` – the Application (Client) ID
- Optional: `DISCORD_GUILD_ID` – to register to one server instantly

Then run one of:

```powershell
# Global registration (can take up to ~1 hour to propagate)
npm run slash:global

# Guild registration (instant). Set your guild ID first:
$env:DISCORD_GUILD_ID = "<your_guild_id>"; npm run slash:guild
```

Re-run the script any time to update commands (it replaces the set).

### Finding your Guild (Server) ID
In Discord, enable Developer Mode (User Settings → Advanced → Developer Mode). Then right‑click your server name in the left sidebar and click “Copy Server ID.” That’s your `DISCORD_GUILD_ID`.

### Recommended .env entries
Add these lines to your `.env` in the project root so both the bot and the registration script pick them up:

```
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_client_id
DISCORD_GUILD_ID=your_server_id   # optional, for instant guild registration
```

## 🎮 Dashboard + Slash Commands

- `/dashboard` — Interactive GUI with clickable buttons for Activity, Players, Time, Info
- `/trends` — Player count analytics with enhanced insights and pattern analysis
- `/info` — Complete feature overview and server information

Admin-only helpers (Manage Server permission) are available via UI/buttons or future admin slash commands.

💡 Pro Tip: Use `/dashboard` for the best experience—click buttons instead of typing.

## 📸 Screenshots
Live gallery and docs site:

- Website: https://thecdrz.github.io/DeadLink/
- Gallery: https://thecdrz.github.io/DeadLink/gallery.html

See the website for a quick tour: https://thecdrz.github.io/DeadLink/

## Latest Release: v2.12.2

Key additions:
- Player Deep Dive select menu in Players dashboard
- Distance tracking (session + lifetime) + avg speed
- Offline deep dive enhancements (last seen, lifetime distance, PB streak)
- Deathless streak persistence & PB tracking
- Rotating file logs + startup summary, unified log levels
- Deferred heartbeat until telnet + analytics loaded
- Players list now shows distance metric

Full notes: `RELEASE_NOTES_v2.12.2.md`

# How it Works
DeadLink connects to your server’s telnet console to read game state (chat, players, time) and post summarized insights to Discord. It supports sending selected messages back to the server (optional), but its focus is a reliable companion experience: analytics, alerts, and an interactive control panel.

# Enhanced Features
This CDRZ fork adds intelligent analysis capabilities that monitor player activity and provide contextual insights:
- **Dynamic Narrative Engine**: Generates humorous, time-aware stories with multiple scenario templates
- **Empty Server Storytelling**: Witty atmospheric descriptions that entertain even when nobody's online
- **Multi-Player Scenarios**: Specialized narratives for solo players, small groups, and larger communities
- **Biome Detection & Analysis**: Players' locations are analyzed for environmental context and danger assessment
- **Health-Aware Suggestions**: Conditions trigger appropriate survival recommendations with priority alerts
- **Time-Contextual Stories**: Activity descriptions adapt to morning, afternoon, evening, and night scenarios
- **Blood Moon Integration**: Strategic warnings and preparation advice during horde events
- **Historical Context**: Incorporates recent player activity and server trends into storytelling

# Credits
DeadLink includes enhancements, docs, and UX work by CDRZ. The original concept of Discord integration for 7 Days to Die was pioneered by LakeYS in Dishorde.

Original project: https://github.com/LakeYS/Dishorde

# Authors
**DeadLink**: CDRZ | Discord: <@217012303063678978>

# Terminal Commands
`exit`

# Configuration
The bot can be configured by editing config.json. Here's a list of the preferences:
- `allow-exec-command` - Enables running telnet console commands from Discord (admin-only). **WARNING: This may pose a security risk for your server.**
- `allow-multiple-instances` - By default, the bot will not start if there is another copy of it already running. Enabling this will allow multiple instances of the bot to run on one system.
- `allow-links-from-game` - Allows players in-game to post links into Discord. When set to false, links will still show up, but will not be clickable. When enabled, links may include embeds in Discord unless you configure the bot's permissions otherwise.
- `disable-commands` - Legacy; no effect in slash-only mode.
- `disable-chatmsgs` - Disable chat messages to and from the server. Does not disable other in-game messages such as join/leave and deaths.
- `disable-join-leave-gmsgs` - Disables player join/leave messages.
- `disable-misc-gmsgs` - Disables all other global messages (player deaths, etc.)
- `disable-non-player-chatmsgs` - Disables chat messages sent by non-players. (Including the "say" console command and mods)
- `disable-status-updates` - Disable the bot's presence and online status display.
- `hide-prefix` - Legacy; relates to in-game chat relay filtering.
- `log-console` - Enables logging of the bot's console to a file, console.log.
- `log-messages` - Chat messages will show up in the terminal.
- `log-telnet` - All output from the connection will show up in the terminal.
- `prefix` - Legacy; text commands removed.

- `skip-discord-auth` - The bot will not log in to Discord.

Optional Blood Moon configuration block in `config.json` (all optional):

```
"bloodMoon": {
	"enabled": true,
	"intervalSeconds": 60,
	"frequency": 7,
	"broadcastInGame": true
}
```
– enabled: turn the monitor on/off
– intervalSeconds: how often to poll gettime
– frequency: override global `horde-frequency` if needed
– broadcastInGame: also announce transitions inside the game chat

Optional Updates configuration block in `config.json` (all optional):

```
"updates": {
	"enabled": true,
	"intervalHours": 24,
	"prerelease": false,
	"notifyMode": "channel",
	"notifyChannel": "<channel id>"
}
```
– enabled: enable automatic checks
– intervalHours: how often to check GitHub releases
– prerelease: include prereleases when true
– notifyMode: set to "channel" for public announcements; leave off/omit to stay silent
– notifyChannel: channel ID to post updates into

## Environment configuration (recommended)
You can keep secrets out of `config.json` by using environment variables. On Windows PowerShell:

```powershell
$env:DISCORD_TOKEN = "<your discord bot token>"
$env:TELNET_PASSWORD = "<your telnet password>"
$env:TELNET_IP = "<server host or IP>"
$env:TELNET_PORT = "<telnet port>"
$env:DISCORD_CHANNEL = "<channel id>"
node index.js
```

The app will automatically prefer these env vars when present.

## Docker
DeadLink images are published to GHCR on each tagged release.

Image: `ghcr.io/thecdrz/deadlink:latest` or `ghcr.io/thecdrz/deadlink:v2.11.5`

Example run:

```powershell
docker run --name deadlink -d `
	-e DISCORD_TOKEN=$env:DISCORD_TOKEN `
	-e TELNET_PASSWORD=$env:TELNET_PASSWORD `
	-e TELNET_IP=$env:TELNET_IP `
	-e TELNET_PORT=$env:TELNET_PORT `
	-e DISCORD_CHANNEL=$env:DISCORD_CHANNEL `
		-e DEV_MODE=$env:DEV_MODE `
	ghcr.io/thecdrz/deadlink:latest
```

Notes:
- DEV_MODE=true enables a simulated telnet for screenshots/testing.
- Logs stream to container stdout; use `docker logs -f deadlink`.

## Troubleshooting telnet
- If in-game broadcast replies with "response not received" but the message shows up in game, this is normal for some servers without a prompt; DeadLink treats it as success.
- If you see repeated "[TELNET] Timeout":
	- Verify server telnet is enabled and reachable (IP/port/password).
	- Ensure the telnet port is open on the firewall and forwarded if remote.
	- Try setting a fixed `TELNET_IP` to the public hostname.
	- The bot auto-reconnects; it will send when the connection stabilizes.

# How to Install - Windows
## Creating the bot account
1. Log in to the [Discord Developer Portal](https://discord.com/developers) in a browser and click "Create an application". Name the bot anything you'd like. Write down the application ID as you'll need it for later.
2. On the left hand side, click "Bot". Now click the "Add Bot" button to create your bot. Once created, you can set an avatar for your bot if desired.
3. Under "Privileged Gateway Intents", Message Content is NOT required for slash commands and the dashboard. You can leave it off.
4. Under "Authorization Flow", locate the "Public Bot" switch and turn this off. ***Important!** If you do not turn this off, anyone can create a link to invite your server's bot to their own server.*
5. Click "Save Changes" to confirm.
6. Back towards the top, click the "Reset Token" button and reset the token. When done, the button will be replaced by a long set of letters and numbers. This is your bot's 'token'--like a password for your bot's account. You'll need both this and the Client ID number later. Copy them both somewhere safe or keep the tab open. ***Note!** Once you close the page, you will not be able to retrieve your bot's token without resetting it.*
7. Copy the URL below into your browser and replace "APP_ID" with your application ID number. Hit enter and select the desired Discord server. Once this is done, the bot will show up in your server!

`https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot`

## Setting up the bot
1. [Download](https://github.com/thecdrz/DeadLink/releases/latest) this repository and extract it somewhere on your server's system.
2. Install Node.js LTS from [this website](https://nodejs.org/en/download/).
3. Once Node.js is finished installing, run install.bat in the bot's folder. This will automatically install the required modules for the bot.
4. Now you'll need to edit your server's config xml file. If you're using the Steam dedicated server, it should be located in `C:\Program Files (x86)\Steam\steamapps\common\7 Days to Die Dedicated Server`.
5. Open serverconfig.xml in a text editor (Right click and select 'Edit' to open it in Nodepad) and find "TelnetEnabled". Set it to true. Make sure TelnetPort is 8081 (or use the "port" argument in config.json). Set a telnet password.
6. Rename the config.json.example file to config.json. Right click this file and click "Edit".
7. Find "changeme" and replace it with your server's Telnet password. Replace "your_token_here" with the Discord token from earlier. If running the bot on a different network from the server, add `--ip=[your server's external ip]` (May require port forwarding if using an external IP. Make sure your Telnet password is secure.)

## Run the bot!
Once you complete all of this, you will be able to run the bot by opening run.bat. If you've done all of this correctly, you will see the following in the terminal:
`Connected to game. Connected to 1 Discord Servers.`

Bind your Discord channel by setting DISCORD_CHANNEL in config.json or as an environment variable. Once complete, the bot should be all set!


Note that if you close this terminal the bot will be disconnected. The bot can be run in the background with no terminal by opening run_silent.vbs.

You may want to create a shortcut to run.bat or run_silent.vbs in your Startup folder:

`C:\Users\[YOURNAME]\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`


# How to Install - Linux
## Setting up the bot
1. Open a terminal on your system.
2. Install Node.js and NPM. Install build tools if instructed. [[How to install via package manager]](https://nodejs.org/en/download/package-manager/). **Skip this step if installing to a Raspberry Pi device.**
3. Type `curl -L https://github.com/thecdrz/DeadLink/archive/refs/tags/v2.11.0.tar.gz -o deadlink.tar.gz` to download the v2.11.0 archive.
4. Type `tar -xzf deadlink.tar.gz` to extract the archive. This will create a directory named "DeadLink". Navigate to the directory with `cd DeadLink`.
5. Type `sudo chmod +x run.sh`. This gives you permission to execute run.sh. (If this does not work, try `chmod +x run.sh`)
6. Type `npm install` to install the required packages for the bot to run.

## Creating the bot account
1. Log in to the [Discord Developer Portal](https://discord.com/developers) in a browser and click "Create an application". Name the bot anything you'd like. Write down the application ID as you'll need it for later.
2. On the left hand side, click "Bot". Now click the "Add Bot" button to create your bot. Once created, you can set an avatar for your bot if desired.
3. Under "Privileged Gateway Intents", Message Content is NOT required for slash commands and the dashboard. You can leave it off.
4. Under "Authorization Flow", locate the "Public Bot" switch and turn this off. ***Important!** If you do not turn this off, anyone can create a link to invite your server's bot to their own server.*
5. Click "Save Changes" to confirm.
6. Back towards the top, click the "Reset Token" button and reset the token. When done, the button will be replaced by a long set of letters and numbers. This is your bot's 'token'--like a password for your bot's account. You'll need both this and the Client ID number later. Copy them both somewhere safe or keep the tab open. ***Note!** Once you close the page, you will not be able to retrieve your bot's token without resetting it.*
7. Copy the URL below into your browser and replace "APP_ID" with your application ID number. Hit enter and select the desired Discord server. Once this is done, the bot will show up in your server!

`https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot`

## Configuring the bot
1. On your server's system, navigate to the game's directory and edit your the config xml file.
2. Find "TelnetEnabled" and make sure it is set to "true". Set a telnet password and save the file. **Make sure your telnet password is secure , especially if the telnet port is open or the server is running on a VPS.**
3. Now navigate back to the bot's folder. Rename config.example.json to config.json and open this file in a text editor.
4. Find the line containing `"password": "changeme",` and replace "changeme" with your server's telnet password.
5. If running the bot on a different network from the server, change "localhost" to your server's external IP. (If using an external IP to connect the bot, forwarding the telnet port may be required)
6. Replace "your_token_here" with the Discord bot token from earlier.  Keep the file open for the next section.

## Run the bot!
Once you complete all of this, you will be able to run the bot by executing run.sh (Navigate to the bot's directory and enter `./run.sh`). If you've done all of this correctly, you will see the following:
`Connected to game. Connected to 1 Discord Servers.`

Bind your Discord channel by setting DISCORD_CHANNEL in config.json or as an environment variable. Once complete, the bot should be all set!
