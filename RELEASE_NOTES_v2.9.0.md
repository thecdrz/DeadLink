# HordeComms v2.9.0

Release date: 2025-08-10

Highlights
- Updates Service: Private update checks with admin commands.
- Public update announcements: Optional auto-posts to a configured channel.
- On-demand announcement: 7d!update announce posts the rich update embed; shows green when already on latest.
- Upgrade guides: OS-specific steps reference the actual release tag.
- Docs/screenshots: README updated previously; Info card refreshed for v2.8 and links to latest release.

Admin commands
- 7d!update check
- 7d!update notes
- 7d!update guide [windows|linux]
- 7d!update announce

Config
- updates: { enabled, intervalHours, prerelease, notifyMode, notifyChannel }

Notes
- Public announcements require updates.notifyMode: "channel" and a valid updates.notifyChannel ID.
- Telnet lifecycle and Blood Moon monitor from v2.8 remain unchanged and stable.
