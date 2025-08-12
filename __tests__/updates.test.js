const UpdatesService = require('../lib/updates');

jest.mock('https', () => ({
  request: (options, cb) => {
    const res = {
      on: (event, handler) => {
        if (event === 'data') {
          const body = options.path.includes('/latest')
            ? JSON.stringify({ tag_name: 'v9.9.9', html_url: 'http://example/release', name: 'R', body: 'B' })
            : JSON.stringify([{ tag_name: 'v1.2.3', draft: false }]);
          setImmediate(() => handler(body));
        }
        if (event === 'end') setImmediate(handler);
      }
    };
    setImmediate(() => cb(res));
    return { on: () => {}, end: () => {} };
  }
}));

describe('UpdatesService', () => {
  test('normalize and compare versions', async () => {
    const svc = new UpdatesService({ repoAuthor: 'a', repoName: 'r', currentVersion: '1.0.0', storageDir: __dirname });
    const latest = await svc.fetchLatest();
    expect(latest).toMatchObject({ tag: 'v9.9.9', version: '9.9.9' });
    expect(svc.isNewer(latest.version)).toBe(true);
  });

  test('getGuide returns OS-specific steps', () => {
    const svc = new UpdatesService({ repoAuthor: 'a', repoName: 'r', currentVersion: '1.2.3' });
    const win = svc.getGuide('windows');
    const lin = svc.getGuide('linux');
    expect(win).toMatch(/Invoke-WebRequest/);
    expect(lin).toMatch(/curl -L/);
  });
});
