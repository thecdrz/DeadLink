const { generateEnhancedAnalytics, analyzePlayerSessions } = require('../lib/enhancedAnalytics');

function makeHistory(counts, opts = {}) {
  const start = Date.now() - (counts.length * 5 * 60 * 1000);
  return counts.map((c, i) => ({
    timestamp: start + i * 5 * 60 * 1000,
    count: c,
    players: opts.players?.[i] || []
  }));
}

describe('generateEnhancedAnalytics', () => {
  test('returns insufficient data message for small history', () => {
    const h = makeHistory([1,2]);
    expect(generateEnhancedAnalytics(h)).toMatch(/Insufficient/);
  });

  test('includes activity levels and session insights when data present', () => {
    const playerSeries = Array(24).fill([]);
    // Simulate some players staying present in recent points for session insight calculation
    for (let i = 18; i < 24; i++) playerSeries[i] = ['Alice', 'Bob'];
    const h = makeHistory([1,2,3,3,4,5,4,3,2,2,3,4,5,6,5,5,4,5,6,7,6,6,5,5], { players: playerSeries });
    const txt = generateEnhancedAnalytics(h);
    expect(txt).toMatch(/Last Hour/);
    expect(txt).toMatch(/Last 3 Hours/);
    expect(txt).toMatch(/Last 6 Hours/);
    // Session insights and patterns may or may not appear depending on thresholds
    // but our data should produce some insights
    expect(txt).toMatch(/Session|Pattern|Activity/);
  });
});

describe('analyzePlayerSessions', () => {
  test('returns null with too little data', () => {
    const h = makeHistory([1,1,1,1,1]);
    expect(analyzePlayerSessions(h)).toBeNull();
  });

  test('returns retention line when unique players exist', () => {
    const players = Array(12).fill([]);
    for (let i=6;i<12;i++) players[i] = ['Alice'];
    const h = makeHistory([1,1,1,1,1,1,1,1,1,1,1,1], { players });
    const out = analyzePlayerSessions(h);
    expect(out).toMatch(/Retention/);
  });
});
