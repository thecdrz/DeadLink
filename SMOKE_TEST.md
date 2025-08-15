Smoke test — DeadLink
======================

Date: 2025-08-15

Summary
-------
This short note records a local smoke test run of DeadLink to confirm:
- Telnet integration (demo and live flows) boots and responds.
- Discord client binds to the configured channel.
- UI→Telnet actions are visible in logs.
- The codebase unit tests and config check run cleanly.

What I ran (high level)
------------------------
1) Started the bot in demo mode (background) to exercise simulated telnet behavior.
2) Ran the full Jest test suite (npm test).
3) Ran the quick config check (node index.js --check).

Key findings / evidence
-----------------------
- Demo/live telnet output (sample):
  - "Connected", "Password dispatched (raw+exec)", "Console stream active (auth likely succeeded)"
  - Repeated simulated telnet commands output such as "Day 200, 18:59" and listplayers/listplayer debug lines.

- UI→Telnet logging present:
  - Example log entries observed during the run:
    - "[UI->TELNET] User requested activity (lp) via dashboard"
    - "[TELNET-QUEUE] exec -> lp"

- Test & config check results (local run):
  - Jest: 15 test suites passed, 31 tests passed
  - Config check: returned "CONFIG OK" with a JSON summary (version, channel, ip, port, updates)

Reproduce locally (PowerShell)
-----------------------------
Open PowerShell in the repository root and run the following examples.

Run full unit tests:

```powershell
npm test
```

Run a quick config validation (the same task used in CI):

```powershell
# This example preserves your current env values; run from repo root
$env:DISCORD_TOKEN=$env:DISCORD_TOKEN; $env:TELNET_PASSWORD=$env:TELNET_PASSWORD; $env:TELNET_IP=$env:TELNET_IP; $env:TELNET_PORT=$env:TELNET_PORT; $env:DISCORD_CHANNEL=$env:DISCORD_CHANNEL; node index.js --check
```

Run the bot in demo mode (foreground):

```powershell
$env:DEV_MODE='true'
$env:LOG_LEVEL='debug'
node .\index.js
```

Run the bot in demo mode (background job):

```powershell
# Replace the path if you're not already in repo root
Start-Job -ScriptBlock { $env:DEV_MODE='true'; $env:LOG_LEVEL='debug'; node .\index.js } | Out-Null
```

Stopping running nodes
----------------------
If you need to stop running node instances created by the smoke test:

```powershell
# Force-kill node processes (use carefully)
taskkill /IM node.exe /F
```

Notes & next steps
------------------
- The background demo run exercised the telnet parsing & scheduled queries (gettime/listplayers) repeatedly — the logs show simulated telnet responses.
- If you want the demo output captured to a separate file for inspection, start the bot in foreground and redirect stdout/stderr to a file.
- If you'd like, I can:
  - Add a small integration test that runs the demo telnet client for a couple of cycles and asserts expected log entries.
  - Add a short CI job to run the config check and tests on PRs.

File created by: automated smoke-test assistant
