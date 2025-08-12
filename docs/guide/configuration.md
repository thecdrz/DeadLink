# Configuration (config.json)

This page shows complete examples and explains every option. You can also use environment variables to override secrets without storing them in the file.

## Minimal example (recommended)

```jsonc
{
  // Required
  "token": "${DISCORD_TOKEN}",          // or put your token string here
  "channel": "${DISCORD_CHANNEL}",      // channel ID where the dashboards post
  "ip": "${TELNET_IP}",                 // 7DtD server host/IP ("localhost" if same machine)
  "port": ${TELNET_PORT},                 // telnet port (default 8081)
  "password": "${TELNET_PASSWORD}",

  // Quality-of-life
  "dev-mode": false,                      // true = simulated data (no real telnet)
  "disable-status-updates": false         // hide bot presence when true
}
```

Tip: On Windows PowerShell, set env vars before running:

```powershell
$env:DISCORD_TOKEN = "<token>"
$env:TELNET_PASSWORD = "<telnet password>"
$env:TELNET_IP = "<server ip>"
$env:TELNET_PORT = "8081"
$env:DISCORD_CHANNEL = "<channel id>"
node index.js
```

## Full example (with comments)

```jsonc
{
  // Discord
  "token": "${DISCORD_TOKEN}",
  "channel": "${DISCORD_CHANNEL}",

  // Telnet target
  "ip": "${TELNET_IP}",
  "port": 8081,
  "password": "${TELNET_PASSWORD}",

  // Mode & behavior
  "dev-mode": false,                // Simulate data (no telnet). Great for demos.
  "allow-multiple-instances": false,// Safety: avoid duplicate instances
  "disable-commands": true,         // Legacy text commands disabled (slash-first)
  "disable-status-updates": false,  // Hide bot presence if true

  // Logging
  "log-console": true,              // Write console.log file (rotating)
  "log-messages": false,            // Echo chat messages to terminal
  "log-telnet": false,              // Echo raw telnet lines to terminal

  // Message filters (legacy relay)
  "show-private-chat": true,
  "show-discord-bot-msgs": false,
  "hide-prefix": false,

  // Game options
  "horde-frequency": 7,             // Used when blood moon schedule isn't in telnet

  // Automated Updates
  "updates": {
    "enabled": true,
    "intervalHours": 24,            // How often to check GitHub releases
    "prerelease": false,            // Include prereleases when true
    "notifyMode": "channel",       // "channel" to announce in public channel; omit for silent
    "notifyChannel": "${DISCORD_CHANNEL}"
  },

  // Blood Moon monitor
  "bloodMoon": {
    "enabled": true,
    "intervalSeconds": 60,          // Poll cadence
    "frequency": 7,                  // Override global if needed
    "broadcastInGame": true          // Also announce in game chat
  },

  // Analytics & telemetry
  "analytics": {
    "enabled": true,                 // Local anonymous telemetry (opt-out)
    "storagePath": "./analytics.json"
  }
}
```

## All settings explained

| Setting | Type | Default | Purpose |
|---|---:|---:|---|
| token | string | — | Discord bot token. Prefer env var DISCORD_TOKEN. |
| channel | string | — | Discord channel ID to post dashboards. DISCORD_CHANNEL overrides. |
| ip | string | "localhost" | Telnet host/IP of your 7DtD server. TELNET_IP overrides. |
| port | number | 8081 | Telnet port. TELNET_PORT overrides. |
| password | string | — | Telnet password. Use TELNET_PASSWORD. |
| dev-mode | boolean | false | Simulated data; no telnet. Great for demos/tests. |
| allow-multiple-instances | boolean | false | Permit multiple bot instances. Generally false. |
| disable-commands | boolean | true | Legacy text commands off (slash-first). |
| disable-status-updates | boolean | false | Hide Discord presence when true. |
| log-console | boolean | true | Write rotating console logs to file. |
| log-messages | boolean | false | Echo chat messages in terminal. |
| log-telnet | boolean | false | Echo raw telnet stream in terminal (noisy). |
| show-private-chat | boolean | true | Include private chat in relay (legacy). |
| show-discord-bot-msgs | boolean | false | Include other bots (legacy). |
| hide-prefix | boolean | false | Filter legacy prefix in chat relay. |
| horde-frequency | number | 7 | Blood moon cycle when server config is unknown. |

### updates.*
| Setting | Type | Default | Purpose |
|---|---:|---:|---|
| enabled | boolean | false | Auto-check GitHub releases. |
| intervalHours | number | 24 | Check cadence. |
| prerelease | boolean | false | Include prereleases. |
| notifyMode | string | — | "channel" to announce to public channel. |
| notifyChannel | string | — | Channel ID for announcements. |

### bloodMoon.*
| Setting | Type | Default | Purpose |
|---|---:|---:|---|
| enabled | boolean | true | Turn monitor on/off. |
| intervalSeconds | number | 60 | Poll cadence. |
| frequency | number | 7 | Override global frequency. |
| broadcastInGame | boolean | true | Post transitions to in-game chat. |

### analytics.*
| Setting | Type | Default | Purpose |
|---|---:|---:|---|
| enabled | boolean | true | Anonymous, local-only telemetry. |
| storagePath | string | ./analytics.json | Where to store the local analytics file. |

## Environment variables (overrides)
- DISCORD_TOKEN, DISCORD_CHANNEL
- TELNET_IP, TELNET_PORT, TELNET_PASSWORD
- DEV_MODE, LOG_ENGINE, LOG_LEVEL
- DEADLINK_ANALYTICS (true/false), DEADLINK_ANALYTICS_ENDPOINT (if ever used)

Notes:
- Env vars win over config.json when both are present.
- For Windows, prefer PowerShell syntax shown above; for Linux/macOS, use export VAR=value.

