describe('project smoke', () => {
  test('package.json loads and has version', () => {
    const pkg = require('../package.json');
    expect(pkg.version).toMatch(/\d+\.\d+\.\d+/);
  });
});
