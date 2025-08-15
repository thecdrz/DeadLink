const path = require('path');
const { spawn } = require('child_process');

jest.setTimeout(30000);

test('demo-mode integration emits telnet startup lines', () => {
  return new Promise((resolve, reject) => {
    const cwd = path.resolve(__dirname, '..');
  // Ensure the spawned child is not treated as a Jest worker (inheritance of JEST_WORKER_ID
  // causes the app to think it's running under tests and skip startup paths). Remove it.
  const env = Object.assign({}, process.env);
  try { delete env.JEST_WORKER_ID; } catch(_) {}
  try { delete env.NODE_ENV; } catch(_) {}
  Object.assign(env, { DEV_MODE: 'true', LOG_LEVEL: 'debug' });

    // Spawn a separate node process running the app in demo mode
    const child = spawn(process.execPath, ['index.js'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });

    let out = '';
    const timeoutMs = 20000;
    const timeout = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
      return reject(new Error('Timed out waiting for demo startup log lines. Output:\n' + out));
    }, timeoutMs);

    const check = () => {
      // Accept either explicit console activation or demo client readiness
      const hasConnected = /Connected/.test(out);
      const hasConsoleActive = /Console stream active/.test(out);
      const hasDevReady = /Dev client ready/.test(out);
      const hasDay = /Day\s+\d+/.test(out);
      if (hasConnected && (hasConsoleActive || hasDevReady || hasDay)) {
        clearTimeout(timeout);
        try { child.kill('SIGKILL'); } catch (_) {}
        return resolve();
      }
    };

    child.stdout.on('data', (d) => { out += d.toString(); check(); });
    child.stderr.on('data', (d) => { out += d.toString(); check(); });

    child.on('error', (err) => {
      clearTimeout(timeout);
      try { child.kill('SIGKILL'); } catch (_) {}
      reject(err);
    });

    child.on('exit', (code) => {
      setTimeout(() => {
        const hasConnected = /Connected/.test(out);
        const hasConsoleActive = /Console stream active/.test(out);
        const hasDevReady = /Dev client ready/.test(out);
        const hasDay = /Day\s+\d+/.test(out);
        if (hasConnected && (hasConsoleActive || hasDevReady || hasDay)) return;
        clearTimeout(timeout);
        reject(new Error('Child exited early (code=' + code + '). Output:\n' + out));
      }, 20);
    });
  });
});
