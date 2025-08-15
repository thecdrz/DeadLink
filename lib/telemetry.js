const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { postJson } = require('./http-utils');

// Privacy-first anonymous analytics: opt-out via config.analytics.enabled=false or env DEADLINK_ANALYTICS=0/false/off
// No PII, no Discord IDs, no IPs. Only coarse environment and feature flags.

const { safeReadJson, safeWriteJson, safeReadLines, safeWriteFile, ensureDir } = require('./fs-utils');

function readInstanceId(filePath) {
  try {
    const json = safeReadJson(filePath, null);
    if (json && typeof json.instanceId === 'string' && json.instanceId.length > 0) return json.instanceId;
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

// postJson provided by lib/http-utils.js

class Telemetry {
  constructor(config, pjson, chartsAvailable) {
    this.enabled = isEnabled(config);
    this.endpoint = (config && config.analytics && config.analytics.endpoint) || process.env.DEADLINK_ANALYTICS_ENDPOINT || 'https://telemetry.deadlink.lol/v1/event';
    this.storagePath = (config && config.analytics && config.analytics.storagePath) || './telemetry.json';
  // During tests (Jest) use a transient buffer path to avoid reading leftover local buffers
  const isTest = typeof process.env.JEST_WORKER_ID !== 'undefined' || process.env.NODE_ENV === 'test';
  this.bufferPath = (config && config.analytics && config.analytics.bufferPath) || (isTest ? require('path').join(require('os').tmpdir(), `deadlink-telemetry-${process.pid}.jsonl`) : './logs/telemetry-buffer.jsonl');
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
        const lines = safeReadLines(this.bufferPath);
    // debug logging removed in cleanup
        lines.forEach(line => { try { this.queue.push(JSON.parse(line)); } catch(_) {} });
      } catch(_) {}
    // Start flusher
    if (this.enabled) {
      this._timer = setInterval(() => this._flushLoop().catch(()=>{}), this.flushIntervalMs);
      // Register with lifecycle manager for clean test shutdown
      try { require('./lifecycle').registerInterval(this._timer); } catch(_) {}
    }
  // telemetry debug logs removed for CI cleanliness
  }

  async send(eventType, details = {}) {
    if (!this.enabled) return;
    const payload = {
      instance: { id: this.instanceId },
      event: { type: eventType, ts: Date.now() },
      ...this.base,
      details
    };
  // send debug log removed
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
  // _flushLoop debug logging removed
      // Send up to batchSize events sequentially (endpoint expects single events)
      const toSend = this.queue.slice(0, this.batchSize);
      const remain = this.queue.slice(this.batchSize);
      const failed = [];
      for (const ev of toSend) {
  // posting event debug log removed
        const res = await postJson(this.endpoint, ev);
  // post result debug log removed
        if (!res || !res.ok) failed.push(ev);
      }
      // Rebuild queue: failed + remaining unsent
      this.queue = failed.concat(remain);
      // Rewrite buffer file to reflect current queue contents
      if (this.bufferEnabled) {
        try {
          safeWriteFile(this.bufferPath, this.queue.map(j => JSON.stringify(j)).join('\n') + (this.queue.length ? '\n' : ''), { ensureDirectory: true });
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
