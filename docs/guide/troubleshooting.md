# Troubleshooting

## Telnet timeouts
- Verify telnet is enabled on the game server and reachable.
- Check firewall/port forwarding for TELNET_PORT.
- Set a fixed `TELNET_IP` to the public host if needed.

## Discord command registration
- Global registration can take up to an hour. Use guild registration for instant updates.

## Charts do not render
- PNG charts are optional; install optional deps or rely on ASCII fallback.
- Optional deps: `canvas`, `chart.js`, `chartjs-node-canvas`.

## Snapshot script fails
- Puppeteer requires a headless Chrome; the script is configured for CI with `--no-sandbox`.
- Regenerate assets: `npm run snapshots`.
