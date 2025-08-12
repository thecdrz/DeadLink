#!/usr/bin/env node
// Registers slash commands (/dashboard, /activity, /trends, /info)
// Usage:
//   node scripts/register-commands.js --guild <GUILD_ID>
//   node scripts/register-commands.js --global
// Env: DISCORD_TOKEN required. DISCORD_CLIENT_ID optional (auto-detected if missing).

try { require('dotenv').config(); } catch (_) { /* optional */ }
const minimist = require('minimist');

// Node 18+ has global fetch; fallback if needed
if (typeof fetch === 'undefined') {
  global.fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
}

const API = 'https://discord.com/api/v10';

async function getBotApplication(token) {
  const r = await fetch(`${API}/oauth2/applications/@me`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Failed to resolve application via token: ${r.status} ${t}`);
  }
  return r.json();
}

async function main() {
  const args = minimist(process.argv.slice(2));
  const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || '';
  let appIdEnv = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || '';
  let argGuild = args.guild;
  // If invoked with --guild without value, minimist sets it to true
  if (argGuild === true) argGuild = '';
  // If a literal "$env:DISCORD_GUILD_ID" or "%DISCORD_GUILD_ID%" sneaks in, ignore it
  if (typeof argGuild === 'string' && /\$env:|%.*%/.test(argGuild)) argGuild = '';
  const guildId = (typeof argGuild === 'string' && argGuild) || process.env.DISCORD_GUILD_ID || '';
  const isGlobal = !!args.global || (!guildId);

  if (!token) {
    console.error('ERROR: DISCORD_TOKEN not set.');
    process.exit(1);
  }

  // Resolve application via token and prefer that ID; warn if env is mismatched
  let appId;
  try {
    const app = await getBotApplication(token);
    const resolved = app.id;
    if (appIdEnv && appIdEnv !== resolved) {
      console.warn(`Provided DISCORD_CLIENT_ID (${appIdEnv}) does not match token application (${resolved}); using ${resolved}.`);
    }
    appId = resolved;
    console.log(`Using application id: ${appId}`);
  } catch (e) {
    if (appIdEnv) {
      console.warn('Could not resolve application via token; falling back to DISCORD_CLIENT_ID.');
      appId = appIdEnv;
    } else {
      console.error(String(e.message || e));
      process.exit(1);
    }
  }

  const commands = [
    { name: 'dashboard', description: 'Show the 7 Days to Die server dashboard' },
    {
      name: 'activity',
      description: 'Show the latest narrative activity report',
      options: [
        {
          name: 'mode',
          description: 'Choose brief (default) or full narrative view',
          type: 3,
          required: false,
          choices: [
            { name: 'brief', value: 'brief' },
            { name: 'full', value: 'full' }
          ]
        }
      ]
    },
    { name: 'players', description: 'Show current players online' },
  { name: 'player', description: 'List players or deep dive one', options: [ { name: 'name', description: 'Player name for deep dive', type: 3, required: false } ] },
    { name: 'time', description: 'Show current in-game time' },
    { name: 'trends', description: 'Show player analytics and trends' },
    { name: 'info', description: 'Show DeadLink info and commands' },
    {
      name: 'update',
      description: 'Update helpers (public)',
      options: [
        {
          name: 'action',
          description: 'What to do',
          type: 3,
          required: false,
          choices: [
            { name: 'check', value: 'check' },
            { name: 'notes', value: 'notes' },
            { name: 'announce', value: 'announce' }
          ]
        }
      ]
    },
    {
      name: 'bloodmoon',
      description: 'Admin: simulate Blood Moon notifications',
  // MANAGE_GUILD = 0x20 (32) or use ADMINISTRATOR 0x8 (8) but Discord expects decimal string
  default_member_permissions: '8',
      dm_permission: false,
      options: [
        {
          name: 'state',
          description: 'Which notification to simulate',
          type: 3,
          required: true,
          choices: [
            { name: 'imminent', value: 'imminent' },
            { name: 'active', value: 'active' },
            { name: 'ended', value: 'ended' }
          ]
        }
      ]
    }
  ];

  const route = isGlobal
    ? `${API}/applications/${appId}/commands`
    : `${API}/applications/${appId}/guilds/${guildId}/commands`;

  console.log(`Registering ${commands.length} commands to ${isGlobal ? 'GLOBAL' : `GUILD ${guildId}`}`);
  if (!isGlobal && !guildId) {
    console.error('ERROR: No guild id provided. Set DISCORD_GUILD_ID in .env or pass --guild <id>.');
    process.exit(1);
  }
  const res = await fetch(route, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Failed to register commands:', res.status, text);
    console.error('Endpoint:', route);
    console.error('Hint: Ensure DISCORD_TOKEN belongs to the same application as DISCORD_CLIENT_ID.');
    process.exit(1);
  }

  const data = await res.json();
  const scope = isGlobal ? 'GLOBAL' : `GUILD ${guildId}`;
  console.log(`Registered ${data.length || commands.length} commands to ${scope}.`);
}

main().catch((e) => {
  console.error('Unexpected error:', e && e.message ? e.message : e);
  process.exit(1);
});
