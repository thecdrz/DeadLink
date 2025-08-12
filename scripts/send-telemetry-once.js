// Send a single telemetry event, then exit.
// Usage:
//   node scripts/send-telemetry-once.js --endpoint http://localhost:8787/v1/event --type manual_test
// or set env:
//   $env:DEADLINK_ANALYTICS_ENDPOINT = "http://localhost:8787/v1/event"; node scripts/send-telemetry-once.js

const minimist = require('minimist');
const { initTelemetry } = require('../lib/telemetry');
const pjson = require('../package.json');

(async () => {
	const argv = minimist(process.argv.slice(2));
	const endpoint = argv.endpoint || process.env.DEADLINK_ANALYTICS_ENDPOINT;
	const eventType = String(argv.type || 'manual_test');

	if (!endpoint) {
		console.error('[telemetry-once] No endpoint provided. Set --endpoint or DEADLINK_ANALYTICS_ENDPOINT.');
		process.exit(2);
	}

	const config = {
		analytics: {
			enabled: true,
			endpoint,
			// Prevent background timer from interfering; we flush explicitly
			flushIntervalMs: 999999999,
			batchSize: 25,
			bufferEnabled: true,
		},
	};

	try {
		const t = initTelemetry(config, pjson, false);
		await t.send(eventType, { ping: true, at: new Date().toISOString() });
		await t.flushNow();
		console.log(`[telemetry-once] Sent event "${eventType}" to ${endpoint}`);
		process.exit(0);
	} catch (err) {
		console.error('[telemetry-once] Failed to send telemetry:', err);
		process.exit(1);
	}
})();