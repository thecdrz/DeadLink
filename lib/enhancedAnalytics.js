// Enhanced analytics helpers extracted for reuse and testing
const { calculateActivityLevel, calculateConsistency } = require('./analyticsUtils');

function getActivityPattern(history) {
  if (!Array.isArray(history) || history.length < 6) return null;
  const recent = history.slice(-6);
  const counts = recent.map(h => h.count);
  const increasing = counts.every((c, i) => i === 0 || c >= counts[i - 1]);
  const decreasing = counts.every((c, i) => i === 0 || c <= counts[i - 1]);
  const stable = counts.every((c, i) => i === 0 || Math.abs(c - counts[i - 1]) <= 1);
  if (increasing) return 'Steadily increasing';
  if (decreasing) return 'Gradually declining';
  if (stable) return 'Consistent activity';
  return 'Variable activity';
}

function analyzeActivityPatterns(history) {
  if (!Array.isArray(history) || history.length < 12) return null;
  const recent = history.slice(-6);
  const previous = history.slice(-12, -6);
  const recentAvg = recent.reduce((s, h) => s + h.count, 0) / recent.length;
  const previousAvg = previous.reduce((s, h) => s + h.count, 0) / previous.length;
  const change = recentAvg - previousAvg;
  const changePercent = Math.round((change / (previousAvg || 1)) * 100);
  let patterns = '';
  if (Math.abs(changePercent) > 10) {
    const direction = changePercent > 0 ? 'increasing' : 'decreasing';
    patterns += `📊 **Activity ${direction}** by ${Math.abs(changePercent)}%\n`;
  } else {
    patterns += `📊 **Stable activity** (±${Math.abs(changePercent)}%)\n`;
  }
  const consistency = calculateConsistency(history);
  patterns += `🎯 **Consistency**: ${consistency}\n`;
  return patterns;
}

function estimateSessionLength(history, currentPlayers) {
  if (!Array.isArray(currentPlayers) || currentPlayers.length === 0 || history.length < 2) return null;
  let sessionStart = Date.now();
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    const entryPlayers = entry.players || [];
    const hasCurrentPlayers = currentPlayers.some(p => entryPlayers.includes(p));
    if (hasCurrentPlayers) sessionStart = entry.timestamp; else break;
  }
  const sessionHours = Math.round((Date.now() - sessionStart) / (1000 * 60 * 60) * 10) / 10;
  return sessionHours > 0 ? sessionHours : null;
}

function analyzePlayerSessions(history) {
  if (!Array.isArray(history) || history.length < 6) return null;
  const recentPlayers = new Set();
  const last24 = history.filter(h => h.timestamp >= Date.now() - (24 * 60 * 60 * 1000));
  last24.forEach(entry => (entry.players || []).forEach(p => recentPlayers.add(p)));
  const uniquePlayers = recentPlayers.size;
  const currentPlayers = history[history.length - 1].players || [];
  let insights = '';
  if (uniquePlayers > 0) {
    const retentionRate = Math.round((currentPlayers.length / uniquePlayers) * 100);
    insights += `🎯 **Retention**: ${retentionRate}% of recent players still online\n`;
  }
  if (currentPlayers.length > 0) {
    const avgSession = estimateSessionLength(history, currentPlayers);
    if (avgSession) insights += `⏱️ **Avg Session**: ~${avgSession} hours\n`;
  }
  const activityPattern = getActivityPattern(history);
  if (activityPattern) insights += `📈 **Pattern**: ${activityPattern}\n`;
  return insights || null;
}

function generateEnhancedAnalytics(history) {
  if (!Array.isArray(history) || history.length < 3) return '📊 *Insufficient data for detailed analysis*';
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  const threeHoursAgo = now - (3 * 60 * 60 * 1000);
  const sixHoursAgo = now - (6 * 60 * 60 * 1000);
  const lastHour = history.filter(h => h.timestamp >= oneHourAgo);
  const last3 = history.filter(h => h.timestamp >= threeHoursAgo);
  const last6 = history.filter(h => h.timestamp >= sixHoursAgo);
  const currentActivity = calculateActivityLevel(lastHour);
  const recentActivity = calculateActivityLevel(last3);
  const extendedActivity = calculateActivityLevel(last6);
  const sessionInsights = analyzePlayerSessions(history);
  const activityPatterns = analyzeActivityPatterns(history);
  let analytics = '';
  analytics += `🕐 **Last Hour**: ${currentActivity.level} (${currentActivity.avg} avg)\n`;
  analytics += `⏰ **Last 3 Hours**: ${recentActivity.level} (${recentActivity.avg} avg)\n`;
  analytics += `📅 **Last 6 Hours**: ${extendedActivity.level} (${extendedActivity.avg} avg)\n`;
  if (sessionInsights) analytics += `\n👥 **Session Insights**\n${sessionInsights}`;
  if (activityPatterns) analytics += `\n📊 **Activity Patterns**\n${activityPatterns}`;
  return analytics;
}

module.exports = {
  getActivityPattern,
  analyzeActivityPatterns,
  estimateSessionLength,
  analyzePlayerSessions,
  generateEnhancedAnalytics,
};
