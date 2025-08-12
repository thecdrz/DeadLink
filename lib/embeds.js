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

function playersListEmbed({ description = '' } = {}) {
  return {
    color: 0x2ecc71,
    title: '👥 Current Players Online',
    description: (description || '').slice(0, 4096),
  footer: timestampFooter()
  };
}

function timeEmbed({ description = '' } = {}) {
  return {
    color: 0x3498db,
    title: '⏰ Current Game Time',
    description: (description || '').slice(0, 4096),
  footer: timestampFooter()
  };
}

function playerDeepDiveEmbed({ title = '🎯 Player Deep Dive', description = '' } = {}) {
  return {
    color: 0x5865f2,
    title,
    description: (description || '').slice(0, 4000),
  footer: timestampFooter()
  };
}

module.exports = { serverAnalyticsEmbed, activityEmbed, playersListEmbed, timeEmbed, playerDeepDiveEmbed };
