// Minimal telemetry receiver for local/dev or self-hosting
// Accepts POST /v1/event with JSON body and appends to logs/telemetry-events.jsonl
// Env: PORT (default 8787), TELEMETRY_STORAGE (default logs/telemetry-events.jsonl)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8787', 10);
const STORAGE = process.env.TELEMETRY_STORAGE || path.join(__dirname, '..', 'logs', 'telemetry-events.jsonl');

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(STORAGE);

const server = http.createServer((req, res) => {
  // eslint-disable-next-line no-console
  console.log(`[telemetry] ${req.method} ${req.url}`);
  // Health and simple info
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'deadlink-telemetry', ts: Date.now() }));
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/v1/event')) {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 512 * 1024) {
        // prevent abuse; cap body size
        req.destroy();
      }
    });
  req.on('end', () => {
      try {
        const json = JSON.parse(body || '{}');
        // minimal validation, keep privacy-first behavior
        const hasEvent = json && json.event && typeof json.event.type === 'string';
        if (!hasEvent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid_event' }));
          return;
        }
        const line = JSON.stringify({ ts: Date.now(), ...json });
        try {
          // eslint-disable-next-line no-console
          console.log(`[telemetry] rx event: ${json.event.type}`);
        } catch (_) {}
        fs.appendFile(STORAGE, line + '\n', () => {});
        // Return 204 No Content like many collectors
        res.writeHead(204);
        res.end();
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[telemetry] listening on http://localhost:${PORT} -> ${STORAGE}`);
});
