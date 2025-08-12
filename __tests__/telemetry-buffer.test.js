const fs = require('fs');
const path = require('path');
const os = require('os');

// Simulate endpoint down and ensure buffer file accumulates; then start server and flush

describe('telemetry buffering', () => {
  test('persists to buffer when endpoint is down and flushes later', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-tele-'));
    const bufferPath = path.join(tmp, 'buf.jsonl');
    // Create a telemetry with unreachable endpoint
    {
      const { initTelemetry } = require('../lib/telemetry');
      const pjson = require('../package.json');
      const t = initTelemetry({ analytics: { enabled: true, endpoint: 'http://127.0.0.1:1/v1/event', bufferPath, flushIntervalMs: 999999999, batchSize: 2 } }, pjson, false);
      await t.send('t1', { n: 1 });
      await t.send('t2', { n: 2 });
      // Do not flush here; endpoint is down, we only want buffer file
    }
    // Give a bit of time for appends
    await new Promise(r => setTimeout(r, 50));
    const raw = fs.readFileSync(bufferPath, 'utf8');
    const lines = raw.trim().split(/\r?\n/);
    expect(lines.length).toBeGreaterThanOrEqual(2);

    // Now spin up a server to receive flush
    const http = require('http');
    let count = 0;
  let t2Ref;
  await new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        if (req.method !== 'POST' || !req.url.startsWith('/v1/event')) { res.writeHead(404).end(); return; }
        req.on('data', ()=>{});
        req.on('end', ()=>{ count++; res.writeHead(204).end(); if (count >= 2) { server.close(); resolve(); } });
      });
      server.listen(0, '127.0.0.1', async () => {
        const { port } = server.address();
        const endpoint = `http://127.0.0.1:${port}/v1/event`;
        const { initTelemetry } = require('../lib/telemetry');
        const pjson = require('../package.json');
    const t2 = initTelemetry({ analytics: { enabled: true, endpoint, bufferPath, flushIntervalMs: 999999999, batchSize: 5 } }, pjson, false);
    t2Ref = t2;
        // Force immediate flush
        await t2.flushNow();
      });
    });

    expect(count).toBeGreaterThanOrEqual(2);
    // After flush, buffer should be emptied
  if (t2Ref) { await t2Ref.flushNow(); }
  await new Promise(r => setTimeout(r, 25));
  const after = fs.existsSync(bufferPath) ? fs.readFileSync(bufferPath, 'utf8') : '';
  expect(after.trim()).toBe('');
  }, 10000);
});
