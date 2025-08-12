const { buildTrendsPayload } = require('../lib/trendsHarness');
const { isChartPngAvailable } = require('../lib/charts');

describe('trends harness', () => {
  test('builds payload with attachment URL when PNG available', async () => {
    const history = [
      { timestamp: Date.now() - 60_000, count: 1 },
      { timestamp: Date.now(), count: 2 }
    ];
    const payload = await buildTrendsPayload(history, 'line1\nline2');
    expect(payload).toHaveProperty('embeds');
    if (isChartPngAvailable()) {
      expect(payload.files && payload.files[0] && payload.files[0].name).toBe('trends.png');
      expect(payload.embeds[0].image && payload.embeds[0].image.url).toBe('attachment://trends.png');
    } else {
      expect(payload.files.length).toBe(0);
      expect(payload.embeds[0].image).toBeUndefined();
    }
  });
});
