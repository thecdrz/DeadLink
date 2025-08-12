- Activity: Slash parity with `/activity [mode]` (brief default, full narrative on demand)
- UI: Brief-by-default Activity with a “Details” toggle in-message
- Docs: README top logo corrected and sized; Commands docs updated
- Release: Version bump to 2.12.2 and notes added

Upgrade tip: Re-register slash commands to pick up the new option (guild-scoped is instant):
- Guild: `npm run slash:guild`
- Global: `npm run slash:global` (can take ~1 hour)
