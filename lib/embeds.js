// Centralized embed builders for consistent UI

function serverAnalyticsEmbed({ description, withImage = false } = {}) {
  const embed = {
    color: 0x3498db,
    title: '📊 Server Analytics Dashboard',
    description: (description || '').slice(0, 4096),
    footer: { text: `Report generated on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}` }
  };
  if (withImage) embed.image = { url: 'attachment://trends.png' };
  return embed;
}

function playerDeepDiveEmbed({ title = '🎯 Player Deep Dive', description = '' } = {}) {
  return {
    color: 0x5865f2,
    title,
    description: (description || '').slice(0, 4000),
    footer: { text: `Generated at ${new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'})}` }
  };
}

module.exports = { serverAnalyticsEmbed, playerDeepDiveEmbed };
