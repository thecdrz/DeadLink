# Environment Variables Configuration for Dishorde-CDRZ

## Security Best Practices

To keep your bot secure, set sensitive credentials as environment variables instead of storing them in config.json.

## Windows (PowerShell)

Create a `.env.ps1` file (or add to your PowerShell profile):

```powershell
# Discord Bot Configuration
$env:DISCORD_TOKEN = "your_discord_bot_token_here"
$env:DISCORD_CHANNEL = "your_discord_channel_id_here"

# 7 Days to Die Server Configuration  
$env:TELNET_PASSWORD = "your_telnet_password_here"
$env:TELNET_IP = "your_server_ip_here"
$env:TELNET_PORT = "your_telnet_port_here"

# Run the bot
Write-Host "Starting Dishorde bot with secure environment variables..."
node index.js
```

Then run: `powershell -ExecutionPolicy Bypass -File .env.ps1`

## Linux/macOS (Bash)

Create a `.env.sh` file:

```bash
#!/bin/bash

# Discord Bot Configuration
export DISCORD_TOKEN="your_discord_bot_token_here"
export DISCORD_CHANNEL="your_discord_channel_id_here"

# 7 Days to Die Server Configuration
export TELNET_PASSWORD="your_telnet_password_here"
export TELNET_IP="your_server_ip_here"
export TELNET_PORT="your_telnet_port_here"

# Run the bot
echo "Starting Dishorde bot with secure environment variables..."
node index.js
```

Then run: `chmod +x .env.sh && ./env.sh`

## Docker Environment

For Docker deployments, use environment variables:

```dockerfile
ENV DISCORD_TOKEN=your_discord_bot_token_here
ENV DISCORD_CHANNEL=your_discord_channel_id_here
ENV TELNET_PASSWORD=your_telnet_password_here
ENV TELNET_IP=your_server_ip_here
ENV TELNET_PORT=your_telnet_port_here
```

## GitHub Actions / CI/CD

Set these as repository secrets:
- `DISCORD_TOKEN`
- `TELNET_PASSWORD`
- `TELNET_IP`
- `TELNET_PORT`  
- `DISCORD_CHANNEL`

## Environment Variable Priority

The bot will use environment variables if available, otherwise fall back to config.json values:

1. **Environment Variables** (highest priority, most secure)
2. **config.json** (fallback, should use placeholder values)

## Security Notes

- Never commit real credentials to version control
- Use placeholder values in config.json (like "yourbottoken")
- Environment variables are not visible in process lists on most systems
- Consider using a secrets management system for production deployments

## Validation

The bot will automatically validate that required credentials are set and exit with helpful error messages if they're missing.
