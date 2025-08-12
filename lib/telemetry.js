const fs = require('fs');
const os = require('os');
const https = require('https');

// Privacy-first anonymous analytics: opt-out via config.analytics.enabled=false or env DEADLINK_ANALYTICS=0/false/off
// No PII, no Discord IDs, no IPs. Only coarse environment and feature flags.

function readInstanceId(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (json && typeof json.instanceId === 'string' && json.instanceId.length > 0) {
        return json.instanceId;
      }
    }
  } catch (_) {}
  // Minimal UUIDv4-ish generator (not cryptographically strong, but sufficient for anon analytics)
  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
  try {
    fs.writeFileSync(filePath, JSON.stringify({ instanceId: id }, null, 2));
  } catch (_) {}
  return id;
}

function parseBoolEnv(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (['0','false','no','off','disabled'].includes(s)) return false;
  if (['1','true','yes','on','enabled'].includes(s)) return true;
  return null;
}

function isEnabled(config) {
  const env = parseBoolEnv(process.env.DEADLINK_ANALYTICS);
  if (env === false) return false;
  if (env === true) return true;
  if (config && config.analytics && typeof config.analytics.enabled === 'boolean') {
    return config.analytics.enabled;
  }
  return true; // default on
}

function buildBasePayload({ pjson, config, chartsAvailable }) {
  return {
    eventVersion: 1,
    app: {
      name: 'deadlink',
      version: pjson && pjson.version || '0.0.0'
    },
    runtime: {
      node: process.versions && process.versions.node,
      platform: require('os').platform(),
      arch: require('os').arch()
    },
    features: {
      devMode: !!(config && config['dev-mode']),
      updates: !!(config && config.updates && config.updates.enabled),
      bloodMoon: !!(config && config.bloodMoon && config.bloodMoon.enabled),
      chartsPng: !!chartsAvailable,
      logEngine: String(process.env.LOG_ENGINE || '').toLowerCase() || 'console'
    },
    // No PII: no guild IDs, no tokens, no IPs
  };
}

function postJson(url, payload, { timeoutMs = 2500 } = {}) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const data = Buffer.from(JSON.stringify(payload));
      const req = https.request({
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + (u.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        },
        timeout: timeoutMs
      }, (res) => {
        // Consume but ignore body
        res.on('data', () => {});
        res.on('end', () => resolve());
      });
      req.on('timeout', () => { try { req.destroy(new Error('timeout')); } catch(_) {} });
      req.on('error', () => resolve()); // swallow errors (fire-and-forget)
      req.write(data);
      req.end();
    } catch (e) {
      resolve();
    }
  });
}

class Telemetry {
  constructor(config, pjson, chartsAvailable) {
    this.enabled = isEnabled(config);
    this.endpoint = (config && config.analytics && config.analytics.endpoint) || process.env.DEADLINK_ANALYTICS_ENDPOINT || 'https://telemetry.deadlink.lol/v1/event';
    this.storagePath = (config && config.analytics && config.analytics.storagePath) || './telemetry.json';
    this.instanceId = readInstanceId(this.storagePath);
    this.base = buildBasePayload({ pjson, config, chartsAvailable });
  }

  async send(eventType, details = {}) {
    if (!this.enabled) return;
    const payload = {
      instance: { id: this.instanceId },
      event: { type: eventType, ts: Date.now() },
      ...this.base,
      details
    };
    await postJson(this.endpoint, payload);
  }
}

function initTelemetry(config, pjson, chartsAvailable) {
  try {
    const t = new Telemetry(config, pjson, chartsAvailable);
    return t;
  } catch (_) {
    return { send: async () => {} };
  }
}

module.exports = { initTelemetry };
