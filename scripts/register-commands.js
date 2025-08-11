#!/usr/bin/env node
// Registers slash commands (/dashboard, /trends, /info)
// Usage:
//   node scripts/register-commands.js --guild <GUILD_ID>
//   node scripts/register-commands.js --global
// Env required: DISCORD_TOKEN, DISCORD_CLIENT_ID

const minimist = require('minimist');

async function main() {
  const args = minimist(process.argv.slice(2));
  const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || '';
  const appId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || '';
  const guildId = args.guild || process.env.DISCORD_GUILD_ID || '';
  const isGlobal = !!args.global || (!guildId);

  if (!token) {
    console.error('ERROR: DISCORD_TOKEN not set.');
    process.exit(1);
  }
  if (!appId) {
    console.error('ERROR: DISCORD_CLIENT_ID not set.');
    process.exit(1);
  }

  const commands = [
    { name: 'dashboard', description: 'Show the 7 Days to Die server dashboard' },
    { name: 'trends', description: 'Show player analytics and trends' },
    { name: 'info', description: 'Show DeadLink info and commands' },
  ];

  const base = 'https://discord.com/api/v9';
  const route = isGlobal
    ? `${base}/applications/${appId}/commands`
    : `${base}/applications/${appId}/guilds/${guildId}/commands`;

  const res = await fetch(route, {
    method: 'PUT',
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Failed to register commands:', res.status, text);
    process.exit(1);
  }

  const data = await res.json();
  const scope = isGlobal ? 'GLOBAL' : `GUILD ${guildId}`;
  console.log(`Registered ${data.length || commands.length} commands to ${scope}.`);
}

// Node 18+ has global fetch; fallback if needed
if (typeof fetch === 'undefined') {
  global.fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
}

main().catch((e) => { console.error('Unexpected error:', e && e.message ? e.message : e); process.exit(1); });
