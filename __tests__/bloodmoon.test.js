const createBloodMoonMonitor = require('../lib/bloodmoon');

function makeChannelMock() {
  const send = jest.fn(() => Promise.resolve());
  return { send };
}

describe('bloodmoon monitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('emits imminent at Day 7 21:00 and then active around 22:00', () => {
    // Telnet mock will return 21:00 on first gettime poll and 22:05 on second poll
    const gettimeResponses = ['Day 7, 21:00\n', 'Day 7, 22:05\n'];
    const telnet = {
      socket: { writable: true },
      exec: jest.fn((cmd, opts, cb) => {
        if (cmd === 'gettime') {
          const resp = gettimeResponses.shift() || 'Day 7, 22:05\n';
          cb(null, resp);
        } else {
          // say or other commands
          cb(null, '');
        }
      })
    };
    const ch = makeChannelMock();
    // Note: module enforces a minimum 30s interval regardless of config
    const monitor = createBloodMoonMonitor({ telnet, getChannel: () => ch, config: { bloodMoon: { intervalSeconds: 1 } } });

    monitor.start();
    // First scheduled poll after 30s
    jest.advanceTimersByTime(30_000);
    // Second scheduled poll after another 30s
    jest.advanceTimersByTime(30_000);

    const titles = ch.send.mock.calls.map(c => (c[0].embeds && c[0].embeds[0] && c[0].embeds[0].title) || '');
    expect(titles.some(t => /Imminent/i.test(t))).toBe(true);
    expect(titles.some(t => /Active/i.test(t))).toBe(true);
    monitor.stop();
  });

  test('makeTestEmbed returns structured embed', () => {
    const monitor = createBloodMoonMonitor({ telnet: {}, getChannel: () => null, config: {} });
    const e = monitor.makeTestEmbed('ended', 'note');
    expect(e).toHaveProperty('title');
    expect(e).toHaveProperty('description');
    expect(e).toHaveProperty('footer');
  });
});
