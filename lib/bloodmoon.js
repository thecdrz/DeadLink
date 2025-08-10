// Minimal Blood Moon monitor for 7DTD via telnet
// Exports a factory that returns { start, stop, makeTestEmbed }

function parseTime(line) {
  // Expected: "Day X, HH:MM"
  if (!line || typeof line !== 'string') return null;
  const m = line.match(/Day\s+(\d+),\s+(\d+):(\d+)/);
  if (!m) return null;
  return { day: parseInt(m[1]), hour: parseInt(m[2]), minute: parseInt(m[3]) };
}

function getHordeState(time, hordeFreq) {
  if (!time) return { state: 'idle' };
  const daysFromHorde = time.day % hordeFreq;
  const isFirstWeek = time.day === 1 || time.day === 2;
  const isHordeHour = (daysFromHorde === 0 && time.hour >= 22) || (daysFromHorde === 1 && time.hour < 4);
  const isActive = !isFirstWeek && isHordeHour;
  if (isActive) return { state: 'active' };
  if (daysFromHorde === 0 && time.hour === 21) return { state: 'imminent' };
  return { state: 'idle' };
}

function buildEmbed(kind, line) {
  const base = {
    footer: { text: `HordeComms • ${new Date().toLocaleString('en-US')}` }
  };
  if (kind === 'imminent') {
    return {
      color: 0xf39c12,
      title: '🩸 Blood Moon Imminent',
      description: `Horde begins in less than an hour.\n${line || ''}`,
      ...base
    };
  }
  if (kind === 'active') {
    return {
      color: 0xe74c3c,
      title: '🔴 Blood Moon Active',
      description: `The horde is rampaging! Seek shelter immediately!\n${line || ''}`,
      ...base
    };
  }
  if (kind === 'ended') {
    return {
      color: 0x2ecc71,
      title: '✅ Blood Moon Ended',
      description: `The blood moon has passed. Regroup and rebuild.\n${line || ''}`,
      ...base
    };
  }
  return null;
}

module.exports = function createBloodMoonMonitor(opts) {
  const telnet = opts.telnet;
  const getChannel = opts.getChannel;
  const config = opts.config || {};
  let timer = null;
  let lastState = 'idle';

  function sayInGame(text) {
    try {
      if (!text) return;
  // Require active telnet socket
  const hasSocket = telnet && ((telnet.socket && telnet.socket.writable) || (typeof telnet.exec === 'function' && !telnet.socket));
  if (!hasSocket) return;
      const cleaned = String(text).replace(/"/g, '');
  telnet.exec(`say "${cleaned}"`, { timeout: 5000 }, (err) => { /* ignore missing response */ });
    } catch (_) { /* ignore */ }
  }

  function poll() {
    const bmCfg = (config.bloodMoon || {});
  const intervalMs = Math.max(30, parseInt(bmCfg.intervalSeconds || 60)) * 1000;
    const enabled = bmCfg.enabled !== false; // default on
    const hordeFreq = parseInt(bmCfg.frequency || config['horde-frequency'] || 7) || 7;
  const broadcastInGame = bmCfg.broadcastInGame !== false; // default on
    if (!enabled) return; // passive if disabled

    try {
      telnet.exec('gettime', { timeout: 5000 }, (err, response) => {
        if ((err && err.message !== 'response not received') || !response) return; // silently skip on errors
        // Find the first line that starts with Day
        const line = (response.split(/\r?\n/).find(l => l.startsWith('Day')) || '').trim();
        const time = parseTime(line);
        const { state } = getHordeState(time, hordeFreq);

        const ch = getChannel && getChannel();
        if (!ch) return;

        if (state === 'imminent' && lastState !== 'imminent') {
          const embed = buildEmbed('imminent', line);
          ch.send({ embeds: [embed] }).catch(() => {});
          if (broadcastInGame) {
            sayInGame('Blood Moon imminent! Horde begins in less than an hour.');
          }
        }
        if (state === 'active' && lastState !== 'active') {
          const embed = buildEmbed('active', line);
          ch.send({ embeds: [embed] }).catch(() => {});
          if (broadcastInGame) {
            sayInGame('The Blood Moon is active! Seek shelter immediately!');
          }
        }
        if (state === 'idle' && (lastState === 'imminent' || lastState === 'active')) {
          const embed = buildEmbed('ended', line);
          ch.send({ embeds: [embed] }).catch(() => {});
          if (broadcastInGame) {
            sayInGame('The Blood Moon has ended. Regroup and rebuild.');
          }
        }

        lastState = state;
      });
    } catch (_) {
      // ignore
    } finally {
      // reschedule
      timer = setTimeout(poll, intervalMs);
    }
  }

  return {
    start() {
      if (timer) return;
      const bmCfg = (config.bloodMoon || {});
      const intervalMs = Math.max(30, parseInt(bmCfg.intervalSeconds || 60)) * 1000;
      timer = setTimeout(poll, intervalMs);
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      lastState = 'idle';
    },
    makeTestEmbed(kind, note) {
      return buildEmbed(kind, note || '');
    }
  };
};
