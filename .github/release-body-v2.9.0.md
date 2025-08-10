# HordeComms v2.9.0

Highlights
- Updates Service: Private update checks with admin commands.
- Public announcements: Optional auto-posts to a configured channel.
- On-demand: `7d!update announce` posts the embed; shows green when already on latest.
- Upgrade guides: OS-specific steps reference the actual release tag.
- Docs/screenshots: README updated; Info card refreshed for v2.8 with latest release link.

Commands
- `7d!update check`
- `7d!update notes`
- `7d!update guide [windows|linux]`
- `7d!update announce`

Config snippet
```json
"updates": {
  "enabled": true,
  "intervalHours": 24,
  "prerelease": false,
  "notifyMode": "channel",
  "notifyChannel": "1403960538907676815"
}
```

Notes
- Public announcements require updates.notifyMode: "channel" and a valid updates.notifyChannel.
- Telnet lifecycle and Blood Moon monitor from v2.8 remain unchanged and stable.

Install/Upgrade
- Windows: use `scripts/update.ps1 -Tag v2.9.0`
- Linux: `TAG=v2.9.0 bash scripts/update.sh`
