// Flush any buffered telemetry events to the specified endpoint, then report before/after.
// Usage examples (PowerShell):
//   $env:DEADLINK_ANALYTICS_ENDPOINT = "http://localhost:8787/v1/event"; node scripts/telemetry-flush-buffer.js
//   node scripts/telemetry-flush-buffer.js --endpoint http://localhost:8787/v1/event --bufferPath ./logs/telemetry-buffer.jsonl

const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const { initTelemetry } = require('../lib/telemetry');
const pjson = require('../package.json');

(async () => {
  const argv = minimist(process.argv.slice(2));
  // Accept flags or positional args: [endpoint] [bufferPath]
  const endpoint = argv.endpoint || argv.e || argv._[0] || process.env.DEADLINK_ANALYTICS_ENDPOINT;
  const bufferPath = argv.bufferPath || argv.b || argv._[1] || path.join('.', 'logs', 'telemetry-buffer.jsonl');

  if (!endpoint) {
    console.error('[telemetry-flush] No endpoint provided. Set --endpoint or DEADLINK_ANALYTICS_ENDPOINT.');
    process.exit(2);
  }

  const before = fs.existsSync(bufferPath)
    ? fs.readFileSync(bufferPath, 'utf8').split(/\r?\n/).filter(Boolean).length
    : 0;

  const t = initTelemetry({
    analytics: {
      enabled: true,
      endpoint,
      bufferEnabled: true,
      bufferPath,
      flushIntervalMs: 999999999,
      batchSize: 100,
    },
  }, pjson, false);

  try {
    await t.flushNow();
    // tiny delay to ensure file rewrite settles on Windows
    await new Promise(r => setTimeout(r, 25));
  } catch (e) {
    console.error('[telemetry-flush] Error during flush:', e);
  }

  const after = fs.existsSync(bufferPath)
    ? fs.readFileSync(bufferPath, 'utf8').split(/\r?\n/).filter(Boolean).length
    : 0;

  console.log(`[telemetry-flush] endpoint=${endpoint}`);
  console.log(`[telemetry-flush] bufferPath=${bufferPath}`);
  console.log(`[telemetry-flush] before=${before} after=${after}`);
  process.exit(0);
})();
