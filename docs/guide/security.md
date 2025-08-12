# Security

- Secrets: use environment variables for token/password; never commit secrets.
- Network: 7DTD telnet is unencrypted; run on trusted networks only.
- Bot permissions: least privilege; restrict the bot to a specific channel.
- Single instance: allow-multiple-instances=false (recommended) to prevent accidental duplicates.
- Logging: sensitive data is not logged; review logs/ rotation behavior.

