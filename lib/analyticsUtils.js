function calculateActivityLevel(dataPoints) {
  if (!Array.isArray(dataPoints) || dataPoints.length === 0) return { level: 'No Data', avg: 0 };
  const counts = dataPoints.map(d => d.count);
  const avg = Math.round((counts.reduce((a, b) => a + b, 0) / counts.length) * 10) / 10;
  const level = avg >= 5 ? 'High' : avg >= 2 ? 'Moderate' : 'Low';
  return { level, avg, max: Math.max(...counts) };
}

function calculateConsistency(history) {
  if (!Array.isArray(history) || history.length < 6) return 'Insufficient data';
  const counts = history.map(h => h.count);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const coeff = (stdDev / (avg || 1)) * 100;
  if (coeff < 20) return 'Very consistent';
  if (coeff < 40) return 'Moderately consistent';
  if (coeff < 60) return 'Variable';
  return 'Highly variable';
}

module.exports = { calculateActivityLevel, calculateConsistency };
