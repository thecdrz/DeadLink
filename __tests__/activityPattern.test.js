const { getActivityPattern, analyzeActivityPatterns } = require('../lib/enhancedAnalytics');

function makeHistory(counts) {
  const start = Date.now() - (counts.length * 5 * 60 * 1000);
  return counts.map((c, i) => ({ timestamp: start + i * 5 * 60 * 1000, count: c, players: [] }));
}

describe('getActivityPattern', () => {
  test('requires at least 6 points', () => {
    expect(getActivityPattern(makeHistory([1,2,3,4,5]))).toBeNull();
  });
  test('detects increasing, decreasing, stable, variable', () => {
    expect(getActivityPattern(makeHistory([1,2,3,4,5,6]))).toBe('Steadily increasing');
    expect(getActivityPattern(makeHistory([6,5,5,4,3,2]))).toBe('Gradually declining');
    expect(getActivityPattern(makeHistory([3,3,2,3,3,2]))).toBe('Consistent activity');
    expect(getActivityPattern(makeHistory([1,3,2,5,1,4]))).toBe('Variable activity');
  });
});

describe('analyzeActivityPatterns', () => {
  test('requires at least 12 points', () => {
    expect(analyzeActivityPatterns(makeHistory([1,2,3,4,5,6,7,8,9,10,11]))).toBeNull();
  });
  test('reports change and consistency', () => {
    const h = makeHistory([1,1,1,1,1,1,2,2,2,2,2,2]);
    const out = analyzeActivityPatterns(h);
    expect(out).toMatch(/Activity increasing|Stable activity/);
    expect(out).toMatch(/Consistency/);
  });
});
