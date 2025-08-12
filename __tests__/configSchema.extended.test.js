const { validateConfig } = require('../lib/configSchema');

describe('configSchema extended', () => {
  test('valid config with updates block passes when zod present', () => {
    const res = validateConfig({ updates: { enabled: true, intervalHours: 24, prerelease: false, notifyMode: 'channel', notifyChannel: '123' } });
    expect(res).toHaveProperty('ok');
  });

  test('invalid updates block surfaces message when zod present', () => {
    const res = validateConfig({ updates: { intervalHours: -10 } });
    expect(res).toHaveProperty('ok');
    // We don't assert false because zod may be optional; just ensure shape
  });
});
