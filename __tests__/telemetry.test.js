const http = require('http');

describe('telemetry client', () => {
  test('posts event payload to HTTP endpoint', async () => {
    const received = await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (req.method !== 'POST' || !req.url.startsWith('/v1/event')) {
          res.writeHead(404).end();
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const json = JSON.parse(body || '{}');
            res.writeHead(204).end();
            resolve({ json });
            server.close();
          } catch (e) {
            reject(e);
            try { server.close(); } catch (_) {}
          }
        });
      });
      server.listen(0, '127.0.0.1', async () => {
        const { port } = server.address();
        const endpoint = `http://127.0.0.1:${port}/v1/event`;
        jest.isolateModules(async () => {
          const { initTelemetry } = require('../lib/telemetry');
          const pjson = require('../package.json');
          const t = initTelemetry({ analytics: { enabled: true, endpoint } }, pjson, false);
          try {
            await t.send('unit_test', { ping: true });
          } catch (e) {
            // fire-and-forget; swallow
          }
        });
      });
    });

    expect(received.json).toBeTruthy();
    expect(received.json.event).toMatchObject({ type: 'unit_test' });
    expect(received.json.app).toBeTruthy();
    expect(received.json.instance).toBeTruthy();
  });
});
