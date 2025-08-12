const { renderTrendPng } = require('./charts');
const { serverAnalyticsEmbed } = require('./embeds');

// Build a payload for Discord send() based on report text and history.
// Returns { files, embeds } where files may be [] and embed includes image when a PNG is available.
async function buildTrendsPayload(history, reportText) {
  const png = await renderTrendPng(history);
  if (png) {
    return {
      files: [{ attachment: png, name: 'trends.png' }],
      embeds: [serverAnalyticsEmbed({ description: reportText.split('\n').slice(0, 12).join('\n'), withImage: true })]
    };
  }
  return {
    files: [],
    embeds: [serverAnalyticsEmbed({ description: reportText, withImage: false })]
  };
}

module.exports = { buildTrendsPayload };
