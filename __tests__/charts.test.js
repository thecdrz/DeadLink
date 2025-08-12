const { renderTrendPng, isChartPngAvailable } = require('../lib/charts');

describe('charts (optional PNG)', () => {
  test('availability flag reflects whether optional deps are installed', () => {
    expect(typeof isChartPngAvailable).toBe('function');
    const available = isChartPngAvailable();
    expect(typeof available).toBe('boolean');
  });

  test('renderTrendPng returns Buffer when available, else null', async () => {
    const history = [
      { timestamp: Date.now() - 60_000, count: 1 },
      { timestamp: Date.now(), count: 2 }
    ];
    const png = await renderTrendPng(history);
    if (isChartPngAvailable()) {
      expect(Buffer.isBuffer(png)).toBe(true);
      expect(png.length).toBeGreaterThan(0);
    } else {
      expect(png).toBeNull();
    }
  });
});
