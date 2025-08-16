const https = require('https');
const http = require('http');

function httpGetJson(options) {
  return new Promise((resolve, reject) => {
    // Ensure headers object exists
    options.headers = options.headers || {};
    if (!options.headers.accept) options.headers.accept = 'application/vnd.github.v3+json';

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // clear any fallback timer and disable socket timeout to avoid lingering handles
        try { if (abortTimer) { clearTimeout(abortTimer); abortTimer = null; } } catch(_) {}
        try { if (typeof req.setTimeout === 'function') req.setTimeout(0); } catch(_) {}
        try {
          const status = (typeof res.statusCode === 'number') ? res.statusCode : 0;
          if (status === 0 || (status >= 200 && status < 300)) {
            if (!data || data.trim() === '') return resolve({});
            try { return resolve(JSON.parse(data)); } catch (e) { return reject(new Error('Invalid JSON from remote')); }
          }
          try {
            const parsed = data && data.trim() ? JSON.parse(data) : null;
            const msg = parsed && parsed.message ? parsed.message : `HTTP ${status}`;
            return reject(new Error(msg));
          } catch (e) {
            return reject(new Error(`HTTP ${status}: ${String(data).slice(0,200)}`));
          }
        } catch (e) { return reject(e); }
      });
    });
    req.on('error', (err) => {
      if (abortTimer) try { clearTimeout(abortTimer); } catch(_) {}
      reject(err);
    });
    let abortTimer = null;
    if (typeof req.setTimeout === 'function') {
      req.setTimeout(8000, () => {
        try { req.abort && req.abort(); } catch(_) {}
        reject(new Error('Request timed out'));
      });
    } else {
      abortTimer = setTimeout(() => {
        try { req.abort && req.abort(); } catch(_) {}
        reject(new Error('Request timed out'));
      }, 8000);
    }
    const originalEmit = req.emit;
    try {
      req.emit = function (name, ...args) {
        if (name === 'close' && abortTimer) {
          try { clearTimeout(abortTimer); } catch(_) {}
        }
        return originalEmit.apply(this, [name, ...args]);
      };
    } catch (_) {}
    req.end();
  });
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
        res.on('data', () => {});
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode }));
      });
      req.on('timeout', () => { try { req.destroy(new Error('timeout')); } catch(_) {} });
      req.on('error', () => resolve({ ok: false }));
      req.write(data);
      req.end();
    } catch (e) {
      resolve({ ok: false });
    }
  });
}

module.exports = { httpGetJson, postJson };
