// Telemetry smoke test: buffer offline -> flush to local receiver -> PASS/FAIL summary
// Usage (PowerShell):
//   node scripts/telemetry-smoke.js --offline http://127.0.0.1:1/v1/event --flush http://127.0.0.1:8787/v1/event --bufferPath ./logs/telemetry-buffer.jsonl
// or simply:
//   npm run telemetry:smoke

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const minimist = require('minimist');
const { initTelemetry } = require('../lib/telemetry');
const pjson = require('../package.json');

function countLines(file) {
  try {
    if (!fs.existsSync(file)) return 0;
    const raw = fs.readFileSync(file, 'utf8');
    return raw.split(/\r?\n/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function isServerUp(healthUrl) {
  return new Promise((resolve) => {
    try {
      const u = new URL(healthUrl);
      const req = http.request({ hostname: u.hostname, port: u.port || 80, path: u.pathname, method: 'GET', timeout: 800 }, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { try { req.destroy(); } catch {} resolve(false); });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

(async () => {
  const argv = minimist(process.argv.slice(2));
  const bufferPath = argv.bufferPath || argv.b || path.join('.', 'logs', 'telemetry-buffer.jsonl');
  const offlineEndpoint = argv.offline || argv.o || 'http://127.0.0.1:1/v1/event';
  const flushEndpoint = argv.flush || argv.f || 'http://127.0.0.1:8787/v1/event';
  const autoServe = argv.autoServe !== false; // default true

  const before0 = countLines(bufferPath);

  // Step 1: send offline event to force buffering
  const tOffline = initTelemetry({ analytics: { enabled: true, endpoint: offlineEndpoint, bufferPath, bufferEnabled: true, flushIntervalMs: 999999999, batchSize: 50 } }, pjson, false);
  await tOffline.send('smoke_offline', { at: new Date().toISOString() });
  await sleep(40); // give append time
  const afterOffline = countLines(bufferPath);

  // Step 2: ensure receiver is up (auto-start for localhost:8787)
  let serverProc = null;
  const flushURL = new URL(flushEndpoint);
  const isLocal8787 = (flushURL.hostname === '127.0.0.1' || flushURL.hostname === 'localhost') && String(flushURL.port || '') === '8787';
  if (autoServe && isLocal8787) {
    const ok = await isServerUp('http://127.0.0.1:8787/health');
    if (!ok) {
      serverProc = spawn(process.execPath, ['scripts/telemetry-server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
      // Wait briefly for server to bind
      await sleep(200);
    }
  }

  // Step 3: flush
  const tFlush = initTelemetry({ analytics: { enabled: true, endpoint: flushEndpoint, bufferPath, bufferEnabled: true, flushIntervalMs: 999999999, batchSize: 100 } }, pjson, false);
  await tFlush.flushNow();
  await sleep(40);
  const afterFlush = countLines(bufferPath);

  if (serverProc) {
    try { serverProc.kill(); } catch {}
  }

  const buffered = afterOffline - before0;
  const emptied = (afterFlush === 0);

  console.log(`[telemetry-smoke] bufferPath=${bufferPath}`);
  console.log(`[telemetry-smoke] buffered=${buffered} (offline)`);
  console.log(`[telemetry-smoke] afterFlush=${afterFlush}`);
  if (buffered > 0 && emptied) {
    console.log('[telemetry-smoke] PASS: buffered then flushed successfully');
    process.exit(0);
  } else {
    console.error('[telemetry-smoke] FAIL: expected buffer to increase offline and empty after flush');
    process.exit(1);
  }
})();
