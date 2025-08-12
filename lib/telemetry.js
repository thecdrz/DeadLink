const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

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
      const isHttps = (u.protocol === 'https:');
      const client = isHttps ? https : http;
      const req = client.request({
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
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
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode }));
      });
      req.on('timeout', () => { try { req.destroy(new Error('timeout')); } catch(_) {} });
      req.on('error', () => resolve({ ok: false })); // swallow errors (fire-and-forget)
      req.write(data);
      req.end();
    } catch (e) {
      resolve({ ok: false });
    }
  });
}

class Telemetry {
  constructor(config, pjson, chartsAvailable) {
    this.enabled = isEnabled(config);
    this.endpoint = (config && config.analytics && config.analytics.endpoint) || process.env.DEADLINK_ANALYTICS_ENDPOINT || 'https://telemetry.deadlink.lol/v1/event';
    this.storagePath = (config && config.analytics && config.analytics.storagePath) || './telemetry.json';
    this.bufferPath = (config && config.analytics && config.analytics.bufferPath) || './logs/telemetry-buffer.jsonl';
    this.flushIntervalMs = ((config && config.analytics && Number(config.analytics.flushIntervalMs)) || Number(process.env.DEADLINK_TELEMETRY_FLUSH_MS) || 10000);
    this.batchSize = ((config && config.analytics && Number(config.analytics.batchSize)) || Number(process.env.DEADLINK_TELEMETRY_BATCH) || 25);
    this.bufferEnabled = (config && config.analytics && typeof config.analytics.bufferEnabled === 'boolean') ? config.analytics.bufferEnabled : true;
    this.instanceId = readInstanceId(this.storagePath);
    this.base = buildBasePayload({ pjson, config, chartsAvailable });
    this.debug = parseBoolEnv(process.env.DEADLINK_TELEMETRY_DEBUG) !== false && String(process.env.DEADLINK_TELEMETRY_DEBUG || '').trim() !== '';
    this.queue = [];
    this.sending = false;
    // Load any buffered events from previous runs
    try {
      if (fs.existsSync(this.bufferPath)) {
        const raw = fs.readFileSync(this.bufferPath, 'utf8');
        raw.split(/\r?\n/).filter(Boolean).forEach(line => {
          try { this.queue.push(JSON.parse(line)); } catch(_) {}
        });
      }
    } catch(_) {}
    // Start flusher
    if (this.enabled) {
      this._timer = setInterval(() => this._flushLoop().catch(()=>{}), this.flushIntervalMs);
      // Don't keep process alive for telemetry
      if (this._timer && this._timer.unref) this._timer.unref();
    }
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(`[telemetry] debug on -> endpoint: ${this.endpoint}`);
    }
  }

  async send(eventType, details = {}) {
    if (!this.enabled) return;
    const payload = {
      instance: { id: this.instanceId },
      event: { type: eventType, ts: Date.now() },
      ...this.base,
      details
    };
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(`[telemetry] send ${eventType}`);
    }
    // Enqueue and persist to buffer file for durability
    this.queue.push(payload);
    if (this.bufferEnabled) {
      try {
        const dir = require('path').dirname(this.bufferPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(this.bufferPath, JSON.stringify(payload) + '\n');
      } catch(_) {}
    }
    // Trigger immediate flush for important events or on batch size
    if (eventType === 'startup' || this.queue.length >= this.batchSize) {
      // Fire and forget
      this._flushLoop().catch(()=>{});
    }
  }

  async _flushLoop() {
    if (!this.enabled || this.sending) return;
    if (this.queue.length === 0) return;
    this.sending = true;
    try {
      // Send up to batchSize events sequentially (endpoint expects single events)
      const toSend = this.queue.slice(0, this.batchSize);
      const remain = this.queue.slice(this.batchSize);
      const failed = [];
      for (const ev of toSend) {
        const res = await postJson(this.endpoint, ev);
        if (!res || !res.ok) failed.push(ev);
      }
      // Rebuild queue: failed + remaining unsent
      this.queue = failed.concat(remain);
      // Rewrite buffer file to reflect current queue contents
      if (this.bufferEnabled) {
        try {
          const dir = require('path').dirname(this.bufferPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(this.bufferPath, this.queue.map(j => JSON.stringify(j)).join('\n') + (this.queue.length ? '\n' : ''));
        } catch(_) {}
      }
    } finally {
      this.sending = false;
    }
  }

  // Exposed for tests/ops to force flushing now
  async flushNow() {
    await this._flushLoop();
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
