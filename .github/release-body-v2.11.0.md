![DeadLink Logo](../screenshots/Hc_Logo.png)

# DeadLink v2.11.0

Highlights
- First release under the DeadLink name and branding
- Update service wired to thecdrz/DeadLink; badges and docs updated
- PNG trend charts enabled (optional deps) with ASCII fallback
- Telnet exec queue + rate limiting; friendlier errors
- Hidden admin blood moon test and quick --check mode

Install / Upgrade
- Windows: powershell -ExecutionPolicy Bypass -File .\scripts\update.ps1 -Tag v2.11.0
- Linux: TAG=v2.11.0 bash scripts/update.sh

Notes
- PNG charts require: chartjs-node-canvas, chart.js v4, canvas. These are optional.
- If you previously used HordeComms, migrate config.json and analytics.json.
