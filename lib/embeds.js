// Centralized embed builders for consistent UI

function timestampFooter() {
  return { text: `Generated on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}` };
}

function serverAnalyticsEmbed({ description, withImage = false } = {}) {
  const embed = {
    color: 0x3498db,
    title: '📊 Server Analytics Dashboard',
    description: (description || '').slice(0, 4096),
  footer: timestampFooter()
  };
  if (withImage) embed.image = { url: 'attachment://trends.png' };
  return embed;
}

function activityEmbed({ description = '' } = {}) {
  return {
    color: 0x2ecc71,
    title: '🎯 Server Activity Report',
    description: (description || '').slice(0, 4096),
  footer: timestampFooter()
  };
}

const UI = require('./uiConstants');

function playersListEmbed({ description = '', players = null, clustersSummary = '' } = {}) {
  const embed = {
    color: 0x2ecc71,
    title: '👥 Current Players Online',
    footer: timestampFooter()
  };
  // Backcompat: if no structured players provided, use description
  if (!Array.isArray(players) || players.length === 0) {
    embed.description = (description || '').slice(0, 4096);
    return embed;
  }

  // Build compact fields for each player (max 24 fields to be safe)
  embed.fields = players.slice(0, 24).map(p => {
    const name = `${p.name} L${p.level || '?'} — ❤️ ${p.health || '—'}`;
    const stats = [];
  if (p.kills != null) stats.push(`${UI.ICON_KILLS} ${p.kills}`);
    if (p.deaths != null) stats.push(`${UI.ICON_DEATHS} ${p.deaths}`);
    if (p.ping != null) stats.push(`${p.ping}ms`);
    if (p.sessionDuration != null) stats.push(`${p.sessionDuration}`);
    if (p.sessionDistance != null) stats.push(`${UI.ICON_DISTANCE} ${p.sessionDistance}m`);
    if (p.streak != null) stats.push(`${UI.ICON_STREAK} ${p.streak}m`);
    const value = `${stats.join(' · ')}\n↳ ${String(p.location || '').slice(0, 64)}`;
    return { name: name.slice(0, 256), value: value.slice(0, 1024), inline: false };
  });

  if (clustersSummary) {
    embed.fields.push({ name: 'Clusters', value: clustersSummary, inline: false });
  }

  return embed;
}

function timeEmbed({ description = '' } = {}) {
  return {
    color: 0x3498db,
    title: '⏰ Current Game Time',
    description: (description || '').slice(0, 4096),
  footer: timestampFooter()
  };
}

function playerDeepDiveEmbed({ title = '🎯 Player Deep Dive', description = '', fields = null } = {}) {
  const embed = {
    color: 0x5865f2,
    title,
    footer: timestampFooter()
  };
  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    embed.description = (description || '').slice(0, 4000);
    return embed;
  }
  embed.fields = fields.map(f => ({ name: f.name.slice(0, 256), value: String(f.value).slice(0, 1024), inline: false }));
  return embed;
}

// Dashboard embed builder (stateless) - used by index.js to compose status header
function dashboardEmbed({ connFmt = { emoji: '⚪', text: 'N/A' }, discordFmt = { emoji: '⚪', text: 'N/A' }, modeMsg = 'Live', version = '' } = {}) {
  const UI = require('./uiConstants');
  return {
    color: 0x7289da,
    title: `${modeMsg && String(modeMsg).includes(UI.ICON_DEV_BADGE) ? UI.ICON_DEV_BADGE + ' ' : ''}🎮 7 Days to Die Server Dashboard`,
    description: `${connFmt.emoji} **Server Status**: ${connFmt.text}   •   ${discordFmt.emoji} **Discord**: ${discordFmt.text}\n${UI.ICON_MODE} **Mode**: ${modeMsg}\n\n` +
                 `Welcome to the interactive server control panel! Use the buttons below to quickly access server information and analytics.\n\n` +
                 `🎯 **Activity** - Get detailed player activity reports\n` +
                 `📊 **Trends** - View player count analytics and trends\n` +
                 `👥 **Players** - See current online players\n` +
                 `⏰ **Time** - Use /time to check current game time\n` +
                 `ℹ️ **Info** - Server version and details`,
    footer: { text: `DeadLink v${version}` }
  };
}

// Return a standard Legend field (name/value object) for embeds
function legendField() {
  const UI = require('./uiConstants');
  const legend = `${UI.ICON_KILLS} Kills · ${UI.ICON_DEATHS} Deaths · ${UI.ICON_DISTANCE} Distance · ${UI.ICON_STREAK} Streak · ${UI.ICON_HEALTH} Health · ${UI.ICON_DEV_BADGE} Dev`;
  return { name: 'Legend', value: legend, inline: false };
}

module.exports = { serverAnalyticsEmbed, activityEmbed, playersListEmbed, timeEmbed, playerDeepDiveEmbed, dashboardEmbed, legendField };
