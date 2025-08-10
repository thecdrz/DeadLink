# HordeComms v2.9.1

Patch date: 2025-08-10

What’s fixed
- Commands now only respond to the configured prefix (default `7d!`) to avoid accidental triggers.
- Update announcements reliably post to the configured `updates.notifyChannel` (independent of the default chat channel).
- Added a PowerShell script to publish releases via GitHub API: `scripts/publish-release.ps1`.

Notes
- Configure your announcement channel in `config.json`:
```json
"updates": {
  "enabled": true,
  "intervalHours": 24,
  "prerelease": false,
  "notifyMode": "channel",
  "notifyChannel": "1403960538907676815"
}
```

Upgrade
- Windows: `scripts/update.ps1 -Tag v2.9.1`
- Linux: `TAG=v2.9.1 bash scripts/update.sh`
