# Configuration (config.json)

Required keys:
- token, channel, ip, port, password

Common flags:
- dev-mode: boolean (simulate telnet)
- allow-exec-command, allow-links-from-game, allow-multiple-instances, disable-commands
- Logging: log-console, log-messages, log-telnet
- Message filters: show-private-chat, show-discord-bot-msgs, disable-status-updates, disable-version-check, hide-prefix
- Game: horde-frequency
- Updates: updates.enabled, updates.intervalHours, updates.prerelease, updates.notifyMode, updates.notifyChannel
- BloodMoon: bloodMoon.enabled, .intervalSeconds, .frequency, .broadcastInGame
- Analytics: analytics.enabled (default true), analytics.endpoint, analytics.storagePath

Environment overrides (recommended for secrets):
- DISCORD_TOKEN, TELNET_PASSWORD, TELNET_IP, TELNET_PORT, DISCORD_CHANNEL
- DEV_MODE, LOG_ENGINE, LOG_LEVEL, DEADLINK_ANALYTICS, DEADLINK_ANALYTICS_ENDPOINT

