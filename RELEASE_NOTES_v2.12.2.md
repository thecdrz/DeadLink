## DeadLink v2.12.2

Slash parity for Activity + docs updates

### New
- /activity now supports an optional `mode` parameter: `brief` (default) or `full`.
  - `brief` gives the compact summary (current default in the dashboard).
  - `full` renders the complete narrative view.

### Docs & UX
- README and Docs updated to show `/activity [mode]` usage.
- In-app Info panel now mentions the `mode` parameter.

### Housekeeping
- Version bump for release tagging.

### Upgrade Notes
If you register slash commands globally, re-run the registration to propagate the new option:
`npm run slash:guild` (instant) or `npm run slash:global` (can take ~1 hour).
