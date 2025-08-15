// Small lifecycle tracker to register timers/servers so tests/CI can shutdown cleanly.
const timers = new Set();
const intervals = new Set();
const servers = new Set();

function tryUnref(obj) {
  try { if (obj && typeof obj.unref === 'function') obj.unref(); } catch(_) {}
}

function registerTimeout(t) {
  if (!t) return;
  timers.add(t);
  tryUnref(t);
}

function registerInterval(i) {
  if (!i) return;
  intervals.add(i);
  tryUnref(i);
}

function registerServer(s) {
  if (!s) return;
  servers.add(s);
  tryUnref(s);
}

function shutdown() {
  try {
    for (const t of timers) { try { clearTimeout(t); } catch(_) {} }
    for (const i of intervals) { try { clearInterval(i); } catch(_) {} }
    for (const s of servers) { try { s.close(); } catch(_) {} }
  } catch(_) {}
  timers.clear(); intervals.clear(); servers.clear();
}

module.exports = { registerTimeout, registerInterval, registerServer, shutdown };
