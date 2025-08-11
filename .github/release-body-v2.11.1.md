Maintenance

Repo cleanup: removed outdated examples and notes (chart_examples.md, ENHANCEMENTS.md, DEV_NOTES.md)
Docs refreshed to prefer environment variables and Docker usage
Update guide now provides Docker pull/stop/run steps for Windows and Linux
Install / Upgrade (Docker)

Pull: docker pull ghcr.io/thecdrz/deadlink:v2.11.1
Restart: docker stop deadlink || true && docker rm deadlink || true
Run: docker run -d --name deadlink --restart=unless-stopped --env-file .env ghcr.io/thecdrz/deadlink:v2.11.1