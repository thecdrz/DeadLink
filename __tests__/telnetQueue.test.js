const { TelnetQueue, friendlyError } = require('../lib/telnetQueue');

describe('TelnetQueue', () => {
  test('exec queues and resolves in order', async () => {
    const telnet = {
      exec: (cmd, opts, cb) => setTimeout(() => cb(null, `ok:${cmd}`), 10)
    };
    const q = new TelnetQueue(telnet, { minIntervalMs: 1, defaultTimeout: 100 });
    const p1 = q.exec('cmd1');
    const p2 = q.exec('cmd2');
    const r1 = await p1;
    const r2 = await p2;
    expect(r1.response).toContain('cmd1');
    expect(r2.response).toContain('cmd2');
  });

  test('friendlyError maps common telnet messages', () => {
    expect(friendlyError(new Error('response not received'))).toMatch(/Server not responding/);
    expect(friendlyError(new Error('socket not writable'))).toMatch(/not connected/);
    expect(friendlyError(new Error('timeout'))).toMatch(/too long/);
    expect(friendlyError(new Error('weird'))).toMatch(/Command failed/);
  });
});
