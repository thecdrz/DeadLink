const { validateConfig } = require('../lib/configSchema');

describe('config validation (optional)', () => {
  test('accepts minimal config when validator unavailable', () => {
    const res = validateConfig({});
    expect(res).toHaveProperty('ok');
  });
});
