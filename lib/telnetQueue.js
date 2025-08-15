/**
 * Telnet execution queue with per-command rate limiting and friendly errors.
 * Works with telnet-client's exec() and send() APIs.
 */
class TelnetQueue {
  constructor(telnet, opts = {}) {
    this.telnet = telnet;
    this.queue = [];
    this.running = false;
    this.minIntervalMs = opts.minIntervalMs || 350; // throttle between commands
    this.defaultTimeout = opts.defaultTimeout || 5000;
    this.lastRunAt = 0;
  }

  /**
   * Enqueue a command. Returns a promise that resolves with { err, response }.
   */
  exec(cmd, options = {}) {
    return new Promise((resolve) => {
      this.queue.push({ cmd, options, resolve });
      this._drain();
    });
  }

  async _drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const { cmd, options, resolve } = this.queue.shift();
      try {
        if (global && global.deadlinkLog && typeof global.deadlinkLog.info === 'function') {
          global.deadlinkLog.info('[TELNET-QUEUE]', `exec -> ${cmd}`);
        } else {
          console.log(`[TELNET-QUEUE] exec -> ${cmd}`);
        }
      } catch(_) {}
      const wait = Math.max(0, this.minIntervalMs - (Date.now() - this.lastRunAt));
      if (wait) await new Promise(r => setTimeout(r, wait));

      try {
        const opts = Object.assign({ timeout: this.defaultTimeout }, options);
        this.lastRunAt = Date.now();
        if (typeof this.telnet.exec === 'function') {
          this.telnet.exec(cmd, opts, (err, response) => {
            resolve({ err, response });
          });
        } else if (typeof this.telnet.send === 'function') {
          try {
            this.telnet.send(cmd + '\n');
            resolve({ err: null, response: '' });
          } catch (e) {
            resolve({ err: e, response: '' });
          }
        } else {
          resolve({ err: new Error('telnet not available'), response: '' });
        }
      } catch (e) {
        resolve({ err: e, response: '' });
      }
    }
    this.running = false;
  }
}

function friendlyError(err) {
  if (!err) return null;
  const msg = String(err.message || err);
  if (/response not received/i.test(msg)) return 'Server not responding. It may be loading or frozen. Try again in a moment.';
  if (/socket not writable|not connected|ECONN/i.test(msg)) return 'Bot is not connected to the game server yet. Try again shortly.';
  if (/timeout/i.test(msg)) return 'The server took too long to respond. Please retry.';
  return `Command failed: ${msg}`;
}

module.exports = { TelnetQueue, friendlyError };
