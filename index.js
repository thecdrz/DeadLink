// Load environment variables from .env as early as possible
try {
  require('dotenv').config();
  // console.log('Environment variables loaded from .env'); // keep quiet to avoid leaking sensitive info
} catch (_) { /* dotenv optional */ }

const minimist = require("minimist");
const fs = require("fs");
const pjson = require("./package.json");
const Discord = require("discord.js");
const createBloodMoonMonitor = require("./lib/bloodmoon.js");
const UpdatesService = require("./lib/updates.js");
var TelnetClient = require("telnet-client");
const DishordeInitializer = require("./lib/init.js");
const Logger = require("./lib/log.js");
const { TelnetQueue, friendlyError } = require("./lib/telnetQueue.js");
const { renderTrendPng } = require("./lib/charts.js");
const { validateConfig } = require("./lib/configSchema.js");
const c = require("./lib/colors.js");

const { Client, Intents } = Discord;
// Only require guilds intent; legacy text command handling is removed
const requestedIntents = [Intents.FLAGS.GUILDS];

// Fancy ASCII banner & unified logging helper
const banner = `
  ____               _ _ _ _       _
 |  _ \\ ___  ___ __| (_) | | __ _| |__
 | | | / _ \\/ __/ _ | | | |/ _ | '_ \\
 | |_| |  __/ (_| (_| | | | | (_| | | | |
 |____/ \\___|\\__\\__,_|_|_|_|\\__, |_| |_|
                               |___/`;

const log = (() => {
  const levelMap = { error:0, warn:1, info:2, debug:3 };
  const desired = (process.env.LOG_LEVEL || 'info').toLowerCase();
  const current = levelMap[desired] != null ? levelMap[desired] : 2;
  const ts = () => new Date().toISOString().split('T')[1].replace('Z','');
  const scopeColor = (s) => c.magenta(s);
  const fmt = (scope, msg) => `${c.dim(ts())} ${scopeColor(scope)} ${msg}`;
  // Minimal file logging with rotation
  const logDir = './logs';
  const maxSize = 512 * 1024; // 512KB per file
  const maxFiles = 5;
  function ensureDir() { try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir); } catch(_) {} }
  function activeFile() { return `${logDir}/deadlink.log`; }
  function rotateIfNeeded() {
    try {
      ensureDir();
      const f = activeFile();
      if (fs.existsSync(f)) {
        const stat = fs.statSync(f);
        if (stat.size >= maxSize) {
          // shift older files
          for (let i = maxFiles-1; i >=0; i--) {
            const src = i===0 ? f : `${f}.${i}`;
            const dest = `${f}.${i+1}`;
            if (fs.existsSync(src)) {
              if (i+1 >= maxFiles) { try { fs.unlinkSync(src); } catch(_) {} }
              else { try { fs.renameSync(src, dest); } catch(_) {} }
            }
          }
        }
      }
    } catch(_) {}
  }
  function writeFileLine(line) {
    try {
      rotateIfNeeded();
      fs.appendFileSync(activeFile(), line + '\n');
    } catch(_) {}
  }
  function out(scope,colorFn,msg,levelColorFn) {
    const line = fmt(scope, msg);
    const colored = levelColorFn ? levelColorFn(line) : line;
    console.log(colored);
    writeFileLine(line.replace(/\u001b\[[0-9;]*m/g,'')); // strip ANSI for file
  }
  return {
    error(scope,msg){ if(current>=0) out(scope,c.red,msg,c.red); },
    warn(scope,msg){ if(current>=1) out(scope,c.yellow,msg,c.yellow); },
    info(scope,msg){ if(current>=2) out(scope,c.white,msg); },
    debug(scope,msg){ if(current>=3) out(scope,c.gray,msg,c.gray); },
    success(scope,msg){ if(current>=2) out(scope,c.green,msg,c.green); }
  };
})();

console.log(banner + "\n" + c.bold(`DeadLink v${pjson.version}`));
log.warn('[SEC]', 'Remote connections to 7 Days to Die servers are not encrypted.');
log.info('[SEC]', 'Use only on trusted networks with a unique telnet password.');
log.info('[CREDITS]', 'Originally inspired by Dishorde (LakeYS) – thanks! DeadLink has since become a near full rewrite.');
// Summarize existing rotated logs
try {
  const dir = './logs';
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f=>f.startsWith('deadlink.log'));
    if (files.length) {
      const summary = files.sort().map(f=>{
        try { const s=fs.statSync(`${dir}/${f}`); return `${f}(${Math.round(s.size/1024)}KB)`; } catch(_) { return f; }
      }).join(', ');
      log.info('[LOG]', `Existing log files: ${summary}`);
    }
  }
} catch(_) {}

// Heartbeat (initialized after config load)
let HEARTBEAT_MINUTES = 15;
let heartbeatTimer = null;
function startHeartbeat() {
  try { HEARTBEAT_MINUTES = parseInt(process.env.HEARTBEAT_MINUTES || (config && config.heartbeatMinutes) || '15'); } catch(_) {}
  if (!HEARTBEAT_MINUTES || HEARTBEAT_MINUTES <= 0) { log.debug('[HB]', 'Heartbeat disabled'); return; }
  const intervalMs = HEARTBEAT_MINUTES * 60000;
  function beat() {
    try {
      const history = d7dtdState.playerTrends.history;
      const last = history[history.length-1];
      const count = last ? last.count : 0;
      log.info('[HB]', `Heartbeat: players=${count} dataPoints=${history.length}`);
    } catch(e){ log.warn('[HB]', 'Heartbeat error'); }
  }
  beat();
  heartbeatTimer = setInterval(beat, intervalMs);
}

const lineSplit = /\n|\r/g;

var channel = void 0;
var guild = void 0;

var d7dtdState = {
  doReconnect: 1,

  waitingForTime: 0,
  waitingForPlayers: 0,
  waitingForActivity: 0,
  waitingForTrends: 0,
  //waitingForPref: 0,
  receivedData: 0,

  skipVersionCheck: 0,

  // Connection initialized?
  connInitialized: 0,

  previousLine: null,
  dataCheck: null,

  // Activity data storage
  activityData: {
    players: [],
    time: null,
    hordeTime: null
  },

  // Player count tracking
  playerTrends: {
    history: [], // Array of {timestamp, count, players}
    maxHistory: 144, // Keep 24 hours of 10-minute intervals
    lastCheck: 0
  },

  // Connection status
  // -1 = Error, 0 = No connection/connecting, 1 = Online
  // -100 = Override or N/A (value is ignored)
  connStatus: -100
};
// Runtime session tracking for enhanced player stats (not persisted yet)
d7dtdState.playerSessions = {}; // name -> { start: ts, lastSeen: ts }
d7dtdState.playerBaselines = {}; // name -> { killsAtStart: number, deathsAtStart: number }
d7dtdState.playerStreaks = {}; // name -> { lastDeathAt: ts|null, longestMinutes: number }
d7dtdState.playerTravel = {}; // name -> { lastPos: {x,y,z}, sessionDistance: number, totalDistance: number }
d7dtdState.playerCraft = {}; // name -> { // future: track crafted counts by category or total }
////// # Arguments # //////
// We have to treat the channel ID as a string or the number will parse incorrectly.
var argv = minimist(process.argv.slice(2), {string: ["channel","port"]});

// This is a simple check to see if we're using arguments or the config file.
// If the user is using arguments, config.json is ignored.
var config;
var configFile;
if(Object.keys(argv).length > 2) {
  config = argv;
  console.log("********\nWARNING: Configuring the bot with arguments is no-longer supported and may not work correctly. Please consider using config.json instead.\nThe arguments must be removed from run.bat/run.sh in order for the config file to take effect.\n********");
}
else {
  configFile = "./config.json";

  if(typeof argv.configFile !== "undefined") {
    configFile = argv.configFile;
  }

  config = require(configFile);
  
  // Security: Use environment variables for sensitive data if available
  // This allows keeping secrets out of the config file
  if (process.env.DISCORD_TOKEN) {
    config.token = process.env.DISCORD_TOKEN;
  log.debug('[ENV]', 'Using Discord token from environment variable');
  }
  
  if (process.env.TELNET_PASSWORD) {
    config.password = process.env.TELNET_PASSWORD;
  log.debug('[ENV]', 'Using telnet password from environment variable');
  }
  
  if (process.env.TELNET_IP) {
    config.ip = process.env.TELNET_IP;
  log.debug('[ENV]', 'Using telnet IP from environment variable');
  }
  
  if (process.env.TELNET_PORT) {
    config.port = process.env.TELNET_PORT;
  log.debug('[ENV]', 'Using telnet port from environment variable');
  }
  
  if (process.env.DISCORD_CHANNEL) {
    config.channel = process.env.DISCORD_CHANNEL;
  log.debug('[ENV]', 'Using Discord channel from environment variable');
  }
  
  // Allow controlling dev mode via environment variables
  const parseBool = (s) => {
    if (typeof s !== 'string') return null;
    const v = s.trim().toLowerCase();
    if (['1','true','yes','on'].includes(v)) return true;
    if (['0','false','no','off',''].includes(v)) return false;
    return null;
  };
  const devFromDEV = parseBool(process.env.DEV_MODE);
  const devFromDEMO = parseBool(process.env.DEMO_MODE);
  if (devFromDEV !== null) {
    config["dev-mode"] = devFromDEV;
    console.log(devFromDEV ? c.green("Mode: 🧪 Dev (simulated telnet)") : c.green("Mode: Live (real telnet)"));
  } else if (devFromDEMO !== null) {
    config["dev-mode"] = devFromDEMO;
    console.log(devFromDEMO ? c.green("Mode: 🧪 Dev (simulated telnet)") : c.green("Mode: Live (real telnet)"));
  }
  
  // Validate required configuration
  if (!config.token || config.token === "yourbottoken") {
    console.error("ERROR: Discord token not configured. Set DISCORD_TOKEN environment variable or update config.json");
    process.exit(1);
  }
  
  if (!config.password || config.password === "yourtelnetpassword") {
    console.error("ERROR: Telnet password not configured. Set TELNET_PASSWORD environment variable or update config.json");
    process.exit(1);
  }
  
  if (!config.ip || config.ip === "yourserverip") {
    console.error("ERROR: Server IP not configured. Set TELNET_IP environment variable or update config.json");
    process.exit(1);
  }
  // Optional schema validation (only logs warnings when zod is present)
  try {
    const v = validateConfig(config);
    if (v && v.ok === false) {
      console.warn("Config validation warnings:", v.message);
    }
  } catch (_) { /* ignore */ }
}

// Quick health-check mode: validate config and exit without starting services
if (argv.check) {
  try {
    const summary = {
      version: pjson.version,
      channel: config.channel ? String(config.channel) : '(unset)',
      ip: config.ip,
      port: config.port,
      updates: config.updates && config.updates.enabled === true ? 'on' : 'off'
    };
    console.log('CONFIG OK');
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('CONFIG CHECK FAILED:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

// Logging init
if(config["log-console"]) {
  d7dtdState.logger = new Logger();
}

var telnet = config["dev-mode"]?require("./lib/demoServer.js").client:new TelnetClient();
// Safer command execution queue with light rate limiting
const telnetQueue = new TelnetQueue(telnet, { minIntervalMs: 350, defaultTimeout: 6000 });

// IP
// This argument allows you to run the bot on a remote network.
var ip;
if(typeof config.ip === "undefined") {
  ip = "localhost";
}
else {
  ip = config.ip;
}

// Port
var port;
if(typeof config.port === "undefined") {
  port = 8081; // If no port, default to 8081
}
else {
  port = parseInt(config.port);
}

// Telnet Password
if(typeof config.password === "undefined") {
  console.error("\x1b[31mERROR: No telnet password specified!\x1b[0m");
  process.exit();
}
var pass = config.password;

// Discord token
if(typeof config.token === "undefined") {
  console.error("\x1b[31mERROR: No Discord token specified!\x1b[0m");
  process.exit();
}
var token = config.token;

// Discord channel
var skipChannelCheck;
if(typeof config.channel === "undefined" || config.channel === "channelid") {
  console.warn("\x1b[33mWARNING: No Discord channel specified! Set DISCORD_CHANNEL or 'channel' in config.json.\x1b[0m");
  skipChannelCheck = 1;
}
else {
  skipChannelCheck = 0;
}
var channelid = config.channel.toString();

// Legacy text command prefix removed — interactions and dashboard only

// Load the Discord client
const client = new Client({
  intents: requestedIntents,
  retryLimit: 3,
  messageCacheMaxSize: 50
});

// ---- Telnet connection lifecycle ----
function scheduleReconnect(delayMs = 5000) {
  if (!d7dtdState.doReconnect) return;
  setTimeout(() => {
    startTelnet();
  }, delayMs);
}

function startTelnet() {
  try {
    d7dtdState.connStatus = 0;
    const params = {
      host: ip,
      port: port,
      negotiationMandatory: false,
      // 7DTD has no interactive shell prompt; treat any newline as prompt end
      shellPrompt: /\r?\n/,
      stripShellPrompt: false,
      ors: '\n',
      irs: '\n',
      // Avoid frequent socket idle timeouts; use per-exec timeouts instead
      timeout: 60000,
      execTimeout: 5000,
      sendTimeout: 3000
    };
    if (!d7dtdState.telnetListenersAttached) {
      d7dtdState.telnetListenersAttached = 1;
  try { telnet.on && telnet.on('close', () => { d7dtdState.connStatus = -1; if (config["log-telnet"]) log.warn('[TELNET]', 'Closed'); scheduleReconnect(); }); } catch(_) {}
  try { telnet.on && telnet.on('end', () => { d7dtdState.connStatus = -1; if (config["log-telnet"]) log.warn('[TELNET]', 'End'); scheduleReconnect(); }); } catch(_) {}
  try { telnet.on && telnet.on('timeout', () => { d7dtdState.connStatus = -1; if (config["log-telnet"]) log.warn('[TELNET]', 'Timeout'); scheduleReconnect(); }); } catch(_) {}
  try { telnet.on && telnet.on('error', (e) => { d7dtdState.connStatus = -1; log.error('[TELNET]', `Error: ${e && e.message}`); }); } catch(_) {}
    }
    if (typeof telnet.connect === 'function') {
      telnet.connect(params).then(() => {
        d7dtdState.connStatus = 1;
  if (config["log-telnet"]) log.success('[TELNET]', 'Connected');
        // Best-effort authentication for 7DTD telnet
        try {
          if (pass) {
            // 7DTD usually accepts the raw password once after connect
            telnet.exec(pass, { timeout: 4000 }, () => {});
          }
          // quick health check to warm the session (non-fatal)
          telnet.exec('version', { timeout: 3000 }, () => {});
        } catch(_) {}
      }).catch((e) => {
        d7dtdState.connStatus = -1;
  log.error('[TELNET]', `Connect failed: ${e && e.message}`);
        scheduleReconnect(8000);
      });
    }
  } catch (e) {
    d7dtdState.connStatus = -1;
  log.error('[TELNET]', `Unexpected connect error: ${e && e.message}`);
    scheduleReconnect(8000);
  }
}

// Start telnet connection on boot
startTelnet();
// Delay heartbeat until after analytics load & telnet connection established
setTimeout(() => {
  if (d7dtdState.connStatus === 1) startHeartbeat();
  else ensureTelnetReady(10000).then(()=> startHeartbeat());
}, 2500);

async function ensureTelnetReady(timeoutMs = 8000) {
  if (d7dtdState.connStatus === 1) return true;
  startTelnet();
  const start = Date.now();
  return await new Promise((resolve) => {
    const tick = () => {
      if (d7dtdState.connStatus === 1) return resolve(true);
      if (Date.now() - start >= timeoutMs) return resolve(false);
      setTimeout(tick, 300);
    };
    tick();
  });
}
  // (ensurePlayerSession defined earlier with baseline & streak init)

function buildSinglePlayerEmbed(playerName, snapshot) {
  const now = Date.now();
  const sess = d7dtdState.playerSessions[playerName];
  const streakInfo = d7dtdState.playerStreaks[playerName] || { lastDeathAt: null, longestMinutes: 0 };
  const currentStreakMins = streakInfo.lastDeathAt ? Math.floor((now - streakInfo.lastDeathAt)/60000) : 0;
  let desc = '';
  if (snapshot) {
    const k = parseInt(snapshot.zombiesKilled||'0');
    const d = parseInt(snapshot.deaths||'0');
    const kd = d===0? k : (k/d).toFixed(1);
    const hp = snapshot.health ? `${snapshot.health}%` : '—';
    const hs = healthStatus(snapshot.health);
    const pq = pingQuality(snapshot.ping);
    const dur = sess ? formatDuration(now - sess.start) : '—';
    let loc = getLocationDescription(snapshot.pos);
    if (loc.length > 120) loc = loc.slice(0,117)+'…';
    const base = d7dtdState.playerBaselines[playerName] || { killsAtStart: k };
    const mins = sess ? Math.max(1, Math.floor((now - sess.start)/60000)) : 1;
    const kpm = ((k - base.killsAtStart)/mins).toFixed(2);
  const travel = d7dtdState.playerTravel[playerName] || { sessionDistance: 0, totalDistance: 0 };
  const sessionDist = Math.round(travel.sessionDistance||0);
  const totalDist = Math.round(travel.totalDistance||0);
  const minsPlayed = sess ? Math.max(1, Math.floor((now - sess.start)/60000)) : 1;
  const mpm = sessionDist && minsPlayed ? (sessionDist / minsPlayed).toFixed(1) : '0';
  desc += `**${playerName}**\n` +
      `Level: ${snapshot.level||'?'} | ❤️ ${hp} (${hs}) | Ping: ${pq} ${snapshot.ping||'?'}ms\n` +
      `Kills: ${k} | Deaths: ${d} | K/D: ${kd} | Kill Rate: ${kpm} kpm\n` +
      `Session: ${dur}\n` +
      `Distance: ${sessionDist}m (Lifetime ${totalDist}m) | Avg Speed: ${mpm} m/min\n` +
      `Deathless Streak: ${currentStreakMins}m (PB ${streakInfo.longestMinutes}m)\n` +
      `Location: ${loc}`;
  } else {
  const travel = d7dtdState.playerTravel[playerName] || { sessionDistance: 0, totalDistance: 0 };
  const sessionsTracked = Object.keys(d7dtdState.playerSessions).includes(playerName) ? 1 : 0; // simple count placeholder
  const sessData = d7dtdState.playerSessions[playerName];
  const lastSeen = sessData ? new Date(sessData.lastSeen).toLocaleString('en-US',{hour12:false}) : 'Unknown';
  const totalDist = Math.round(travel.totalDistance||0);
  desc = `No live snapshot for ${playerName} (offline).
Last Seen: ${lastSeen}
Sessions Tracked: ${sessionsTracked}
Lifetime Distance: ${totalDist}m
Deathless PB: ${streakInfo.longestMinutes}m`;
  }
  return {
    color: 0x5865f2,
    title: `🎯 Player Deep Dive`,
    description: desc.slice(0, 4000),
    footer: { text: `Generated at ${new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'})}` }
  };
}

////// # Init/Version Check # //////
const configPrivate = {
  githubAuthor: "thecdrz",
  githubName: "DeadLink",
  socketPort: 7383
};

new DishordeInitializer(pjson, config, configPrivate);

// Load analytics data on startup
loadAnalyticsData();

// Check for version updates and announce if needed
checkAndAnnounceVersion();

// Create Blood Moon monitor (lazy-start after Discord+channel ready)
const bloodMoon = createBloodMoonMonitor({
  telnet,
  config,
  getChannel: () => channel
});

// Prepare updates service (private by default; no auto-posts)
config.updates = config.updates || { enabled: false, intervalHours: 24, prerelease: false, notifyMode: 'off' };
const updates = new UpdatesService({
  repoAuthor: configPrivate.githubAuthor,
  repoName: configPrivate.githubName,
  currentVersion: pjson.version,
  storageDir: '.'
});

function buildUpdateEmbed(info, currentVersion, opts = {}) {
  const upToDate = !!opts.upToDate;
  const title = upToDate ? `Latest release (already installed): v${info.version}` : `Update available: v${info.version}`;
  const url = info.url;
  // Extract first few bullet points or a short excerpt
  let whatsNew = '';
  if (info.body) {
    const lines = info.body.split(/\r?\n/).filter(l => l.trim() !== '');
    const bullets = lines.filter(l => /^[-*•]/.test(l.trim())).slice(0, 6);
    if (bullets.length) {
      whatsNew = bullets.join('\n');
    } else {
      whatsNew = (info.body || '').slice(0, 600);
    }
  }
  const description = upToDate
    ? `You're running v${currentVersion}. This is the latest release.\n\n${url}`
    : `You're running v${currentVersion}. A new release is available.\n\n${url}`;
  const embed = {
    color: upToDate ? 0x2ecc71 : 0x7289da,
    title,
    description,
  fields: whatsNew ? [{ name: "What's new", value: whatsNew }] : [],
    timestamp: new Date().toISOString()
  };
  return embed;
}
if (config.updates.enabled === true) {
  updates.startSchedule({ intervalHours: config.updates.intervalHours || 24, includePrerelease: !!config.updates.prerelease }, (info) => {
    // Public announcement: post to the configured updates.notifyChannel, independent of the bound default channel
    try {
      if (config.updates.notifyMode === 'channel' && config.updates.notifyChannel && client && client.channels) {
        const embed = buildUpdateEmbed(info, pjson.version);
        const targetId = config.updates.notifyChannel.toString();
        const fetched = client.channels.fetch(targetId);
        if (fetched && typeof fetched.then === 'function') {
          fetched.then((ch) => {
            if (ch && typeof ch.isText === 'function' && ch.isText()) {
              ch.send({ embeds: [embed] }).catch(() => {});
            }
          }).catch(() => {});
        }
      }
    } catch (_) { /* ignore */ }
  });
}

////// # Functions # //////
function sanitizeMsgFromGame(msg) {
  // Replace @everyone and @here
  msg = msg.replace(/@everyone|@here|<@.*>/g, "`$&`");
  
  if(!config["allow-links-from-game"]) {
    // Filter links
    msg = msg.replace(/https:\/\//g, "https\\://");
    msg = msg.replace(/http:\/\//g, "http\\://");
  }

  return msg;
}

function sanitizeMsgToGame(msg) {
  msg = msg.replace(/"/g, "");
  return msg;
}

function handleMsgFromGame(line) {
  // Nothing to do with empty lines.
  if(line === "") {
    return;
  }

  var isLineDuplicate = false;
  // Line check
  if(d7dtdState.previousLine === line) {
    if(config["debug-mode"]) console.log(`[DEBUG] Duplicate console line. Line: ${line}`);
    d7dtdState.data = ""; // Clear the data cache

    return;
  }

  d7dtdState.previousLine = line;
  
  // Regex for identifying a chat message
  // Ex 1: 2021-09-14T18:14:40 433.266 INF Chat (from '-non-player-', entity id '-1', to 'Global'): 'Server': test
  // Ex 2: 2021-09-14T18:49:39 2532.719 INF GMSG: Player 'Lake' left the game
  // Ex 3: 2021-09-15T20:42:00 1103.462 INF Chat (from '12345678901234567', entity id '171', to 'Global'): 'Lake': the quick brown fox jumps over the lazy dog
  var dataRaw = line.match(/(.+)T(.+) (.+) INF (Chat|GMSG)(.*): (.*)/);
  var content = { name: null, text: null, from: null, to: null, entityId: null };

  if(dataRaw === null) {
    return;
  }

  // Evaluate the source info (i.e. " (from '-non-player-', entity id '-1', to 'Global'): 'Server'") separately because it may not exist.
  // Source info includes the sender name (i.e. 'Server')
  var sourceInfoRaw = dataRaw[5].match(/\(from '(.+)', entity id '(.+)', to '(.+)'\): '(.+)'/);
  if(sourceInfoRaw === null) {
    content.text = dataRaw[6];
  }
  else {
    // We have content info to derive from the source info match
    content.name = sourceInfoRaw[4];
    content.text = dataRaw[6];

    content.from = sourceInfoRaw[1];
    content.to = sourceInfoRaw[3];
    content.entityId = sourceInfoRaw[2];
  }

  var data = {
    date: dataRaw[1],
    time: dataRaw[2],
    type: dataRaw[4],
    content
  };

  if(config["disable-non-player-chatmsgs"] && data.content.from === "-non-player-") { 
    return;
  }

  if((!config["disable-chatmsgs"] && data.type === "Chat") || (!config["disable-misc-gmsgs"] && data.type === "GMSG")) {
    var msg;
    if(data.content.name === null) msg = data.content.text;
    else msg = `${data.content.name}: ${data.content.text}`;

    // Make sure the channel exists.
    if(typeof channel !== "undefined") {
      if(data.type === "Chat") {
        if(data.content.to !== "Global") {
          if(config["show-private-chat"] && data.content.name !== null) {
            msg = `*(Private)* ${data.content.name}: ${data.content.text}`;
          }
          else {
            return;
          }
        }
      }

      if(config["log-messages"] && data.content.name !== null) {
        console.log(msg);
      }

      if(data.type === "GMSG") {
        // Remove join and leave messages.
        if(data.content.text.endsWith("the game") && config["disable-join-leave-gmsgs"]) {
          return;
        }

        // Remove other global messages (player deaths, etc.)
        if(!data.content.text.endsWith("the game") && config["disable-misc-gmsgs"]) {
          return;
        }
      }

      if(config["hide-prefix"])
      {
        // Do nothing if the prefix "/" is in the message.
        if(data.content.text.startsWith("/")) {
          return;
        }
      }

      // If we're dealing with a duplicated message, we need to run a warning.
      if(isLineDuplicate) {
        console.warn(`WARNING: Caught attempting to send a duplicate line from the game. This line will be skipped. Line: ${line}`);
    
        return;
      }

      // Sanitize the resulting message, username included.
      msg = sanitizeMsgFromGame(msg);

      // If we didn't filter the message down to nothing, send it.
      if(msg !== "") {
        sendEnhancedGameMessage(msg);
      }
    }
  }
}

function sendEnhancedGameMessage(message) {
  // Check if this is a special game event that should get rich embed treatment
  if (message.includes("joined the game")) {
    const playerMatch = message.match(/Player '([^']+)' joined the game/);
    if (playerMatch) {
      const playerName = playerMatch[1];
      const embed = {
        color: 0x2ecc71, // Green for joins
        title: "🚪 Player Joined",
        description: `🎉 **${playerName}** has entered the wasteland!\n> Welcome to the apocalypse, survivor. Stay alert and stay alive.`,
        footer: {
          text: `Player joined on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}`,
        }
      };
      
      channel.send({ embeds: [embed] })
        .catch(() => {
          // Fallback to plain text if embed fails
          channel.send(message);
        });
      return;
    }
  }
  
  if (message.includes("left the game")) {
    const playerMatch = message.match(/Player '([^']+)' left the game/);
    if (playerMatch) {
      const playerName = playerMatch[1];
      const embed = {
        color: 0xe67e22, // Orange for leaves
        title: "🚪 Player Left",
        description: `👋 **${playerName}** has left the wasteland.\n> Another survivor returns to safety... or perhaps to face a different kind of danger.`,
        footer: {
          text: `Player left on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}`,
        }
      };
      
      channel.send({ embeds: [embed] })
        .catch(() => {
          // Fallback to plain text if embed fails
          channel.send(message);
        });
      return;
    }
  }
  
  if (message.includes("died")) {
    const deathMatch = message.match(/Player '([^']+)' died/);
    if (deathMatch) {
      const playerName = deathMatch[1];
  // Update deathless streak tracking
  try { recordPlayerDeath(playerName); } catch(_) {}
      
      // Extract cause of death if available
      let deathCause = "unknown circumstances";
      if (message.includes("zombie")) deathCause = "a zombie attack";
      else if (message.includes("fall")) deathCause = "fall damage";
      else if (message.includes("starv")) deathCause = "starvation";
      else if (message.includes("thirst")) deathCause = "dehydration";
      else if (message.includes("heat")) deathCause = "extreme heat";
      else if (message.includes("cold")) deathCause = "freezing temperatures";
      else if (message.includes("explosion")) deathCause = "an explosion";
      else if (message.includes("drown")) deathCause = "drowning";
      
      const embed = {
        color: 0xe74c3c, // Red for deaths
        title: "💀 Player Death",
        description: `⚰️ **${playerName}** has fallen to ${deathCause}.\n> The wasteland claims another victim. Will they return stronger?`,
        footer: {
          text: `Death occurred on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}`,
        }
      };
      
      channel.send({ embeds: [embed] })
        .catch(() => {
          // Fallback to plain text if embed fails
          channel.send(message);
        });
      return;
    }
  }
  
  // For all other messages (chat, etc.), send as plain text
  channel.send(message);
}

function handleMsgToGame(line) {
  if(!config["disable-chatmsgs"]) {
    var msg = sanitizeMsgToGame(line);
    const command = `say "${msg}"`;
    if (typeof telnet.send === 'function') {
      // Fire-and-forget to avoid waiting for a prompt that doesn't exist
      try { telnet.send(command + '\n'); } catch (e) { console.log("Error while attempting to send message: " + e.message); }
    } else {
      telnet.exec(command, { timeout: 5000, ors: '\n' }, (err, response) => {
        if(err && err.message !== 'response not received') {
          console.log("Error while attempting to send message: " + err.message);
        } else if (!err && response) {
          var lines = response.split(lineSplit);
          for(var i = 0; i <= lines.length-1; i++) {
            var lineResponse = lines[i];
            handleMsgFromGame(lineResponse);
          }
        }
      });
    }
  }
}

function handleCmdError(err) {
  if (!err) return;
  try {
    const msg = friendlyError(err);
    if (msg && channel) channel.send(msg).catch(() => {});
  } catch (_) {}
}

// Helper to process raw telnet response text into meaningful lines
function processTelnetResponse(response, onLine) {
  try {
    if (!response || typeof response !== 'string') return;
    const lines = response.split(lineSplit);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (typeof raw !== 'string') continue;
      const line = raw.trim();
      if (!line) continue; // skip blanks
      // skip common non-data noise/echoes if present
      if (/^(Executed command|Command|Login|Logon)/i.test(line)) continue;
      onLine(line);
    }
  } catch (_) { /* ignore parse errors */ }
}

function handleTime(line, msg) {
  let hordeFreq = 7;
  if(config["horde-frequency"] != null) {
    hordeFreq = parseInt(config["horde-frequency"]);
  }

  const messageValues = line.split(",");
  const day = parseInt(messageValues[0].replace("Day ", ""));
  const hour = parseInt(messageValues[1].split(":")[0]);
  const daysFromHorde = day % hordeFreq;
  let hordeMsg = "";

  const isFirstWeek = day === 1 || day === 2;
  const isHordeHour = (daysFromHorde === 0 && hour >= 22) || (daysFromHorde === 1 && hour < 4);

  const isHordeNow = !isFirstWeek && isHordeHour;

  if (daysFromHorde === 0 && hour < 22) {
    const hoursToHorde = 22 - hour;
    const hourStr = hour === 21 ? "less than an hour" : `${hoursToHorde} hour${hoursToHorde === 1 ? "" : "s"}`;

    hordeMsg = `The blood moon horde begins in ${hourStr}.`;
  } else if (isHordeNow) {
    hordeMsg = "The horde is rampaging now!";
  } else if (daysFromHorde !== 0) {
    const daysToHorde = parseInt(hordeFreq) - daysFromHorde;
    hordeMsg = `The blood moon horde begins on Day ${day+daysToHorde} (in ${daysToHorde} day${daysToHorde === 1 ? "" : "s"}).`;
  }

  // Create consistent embed format
  const embed = {
    color: 0x3498db, // Blue color
    title: "⏰ Current Game Time",
    description: `${line}\n${hordeMsg}`,
    footer: {
      text: `Data collected on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}`,
    }
  };

  msg.channel.send({ embeds: [embed] })
    .catch(() => {
      // Fallback to plain text if embed fails
      msg.channel.send(`${line}\n${hordeMsg}`);
    });
}

function handlePlayerCount(line, msg) {
  // Extract player count from line like "Total of 3 players online"
  const match = line.match(/Total of (\d+) players/);
  if (match) {
    const playerCount = parseInt(match[1]);
    trackPlayerCount(playerCount);
    
    // Create a proper embed for player count display
    let description = "";
    let color = 0x95a5a6; // Gray color for neutral
    
    if (playerCount === 0) {
      description = "🌙 **Server is Empty**\n> The wasteland stands silent... waiting for survivors to brave the darkness.";
      color = 0x34495e; // Darker gray for empty
    } else if (playerCount === 1) {
      description = `👤 **Lone Survivor**\n> One brave soul is currently fighting for survival in the apocalypse.`;
      color = 0xf39c12; // Orange for solo
    } else if (playerCount <= 5) {
      description = `👥 **Small Group**\n> ${playerCount} survivors are currently working together to stay alive.`;
      color = 0x3498db; // Blue for small group
    } else {
      description = `🏘️ **Active Community**\n> ${playerCount} players are currently online and building their fortress!`;
      color = 0x27ae60; // Green for active community
    }
    
    const embed = {
      color: color,
      title: "👥 Current Players Online",
      description: description,
      footer: {
        text: `Player count checked on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}`,
      }
    };
    
    msg.channel.send({ embeds: [embed] })
      .catch(() => {
        // Fallback to plain text if embed fails
        msg.channel.send(line);
      });
  } else {
    // Fallback for unexpected format
    msg.channel.send(line);
  }
}

function generateActivityMessage(players, time, hordeInfo) {
  let activityMsg = "";
  
  if (players.length === 0) {
    const timeOfDay = time ? getTimeOfDay(time) : "unknown time";
    const emptyMessages = [
      `🌙 Empty wasteland during the ${timeOfDay}\n> Even the zombies seem to have taken a break... or are they planning something?`,
      `👻 Eerie silence during the ${timeOfDay}\n> The absence of survivors might be more ominous than their presence.`,
      `🏜️ No survivors active during the ${timeOfDay}\n> Perhaps they're wisely hiding, or perhaps something scared them all away.`,
      `🌌 World lies dormant during the ${timeOfDay}\n> One can only wonder what horrors await the next survivor to log in.`
    ];
    
    activityMsg = getRandomElement(emptyMessages);
    if (hordeInfo) {
      activityMsg += `\n\n${hordeInfo}`;
    }
  } else if (players.length === 1) {
    const player = players[0];
    const location = getLocationDescription(player.pos);
    const timeOfDay = time ? getTimeOfDay(time) : "unknown time";
    const weather = getWeatherAtmosphere(timeOfDay);
    const healthCondition = getHealthCondition(player.health);
    const activity = getSoloActivity(player, timeOfDay);
    const suggestions = getSurvivalSuggestions(player, time, hordeInfo);
    
    // Build narrative-focused player stats (only key stats for storytelling)
    let playerStats = "";
    if (player.health) playerStats += `❤️ ${player.health}% HP`;
    if (player.level) playerStats += ` | 📊 Level ${player.level}`;
    if (player.zombiesKilled) playerStats += ` | 🧟 ${player.zombiesKilled} kills`;
    
    activityMsg = `**Solo Survivor Report**\n\n`;
    activityMsg += `**${player.name}** — ${playerStats ? `${playerStats}` : ""}\n`;
    activityMsg += `🌍 *${location.charAt(0).toUpperCase() + location.slice(1)}*\n`;
    activityMsg += `🌤️ *${weather}* | 🕒 ${time || "Unknown"}\n\n`;
    activityMsg += `"*${healthCondition} and ${activity} ${location}.*"\n\n`;
    
    // Add player achievements if available (narrative-focused)
    const achievements = getPlayerAchievements(player);
    if (achievements.length > 0) {
      activityMsg += `🏅 **Recognition**\n`;
      achievements.forEach(achievement => {
        activityMsg += `${achievement}\n`;
      });
      activityMsg += `\n`;
    }
    
    // Format suggestions as organized sections
    if (suggestions) {
      const suggestionLines = suggestions.split('\n');
      let currentSection = '';
      
      suggestionLines.forEach(line => {
        if (line.includes('🚨 CRITICAL') || line.includes('🩸 Blood Moon')) {
          if (currentSection) activityMsg += '\n';
          activityMsg += `⚠️ **${line.includes('CRITICAL') ? 'Critical Alert' : 'Blood Moon Preparation'}**\n`;
          activityMsg += `🔴 ${line.replace(/🚨 CRITICAL: |🩸 Blood Moon Prep: /, '')}\n`;
          currentSection = 'critical';
        } else if (line.includes('🌙 Night Ops') || line.includes('🛡️ Defense') || line.includes('💡 Lighting')) {
          if (currentSection !== 'tactical') {
            if (currentSection) activityMsg += '\n';
            activityMsg += `⚔️ **Immediate Action**\n`;
            currentSection = 'tactical';
          }
          activityMsg += `🛡️ ${line.replace(/🌙 Night Ops: |🛡️ Defense: |💡 Lighting: /, '')}\n`;
        } else if (line.includes('⚕️') || line.includes('🩹') || line.includes('🏥')) {
          if (currentSection !== 'medical') {
            if (currentSection) activityMsg += '\n';
            activityMsg += `🏥 **Medical Priority**\n`;
            currentSection = 'medical';
          }
          activityMsg += `⚕️ ${line.replace(/⚕️ |🩹 |🏥 /, '')}\n`;
        } else if (line.includes('🆕') || line.includes('🏆')) {
          if (currentSection !== 'advice') {
            if (currentSection) activityMsg += '\n';
            activityMsg += `💡 **Survival Advice**\n`;
            currentSection = 'advice';
          }
          activityMsg += `📋 ${line.replace(/🆕 Newbie: |🏆 Veteran: /, '')}\n`;
        } else if (line.includes('✅') || line.includes('👍') || line.includes('💪') || line.includes('🎯')) {
          if (currentSection !== 'status') {
            if (currentSection) activityMsg += '\n';
            activityMsg += `📊 **Status Check**\n`;
            currentSection = 'status';
          }
          activityMsg += `✅ ${line.replace(/✅ |👍 |💪 |🎯 /, '')}\n`;
        }
      });
    }
    
    // Add blood moon information if present
    if (hordeInfo) {
      if (hordeInfo.includes("begins in")) {
        activityMsg += `\n🔴 **Blood Moon Incoming**\n`;
        const timeMatch = hordeInfo.match(/begins in (.+)!/);
        if (timeMatch) {
          activityMsg += `🕒 ${timeMatch[1].charAt(0).toUpperCase() + timeMatch[1].slice(1)}!\n`;
          activityMsg += `💀 Prepare for maximum aggression.\n`;
        }
      } else if (hordeInfo.includes("rampaging now")) {
        activityMsg += `\n🔴 **Blood Moon Active**\n`;
        activityMsg += `💀 The horde is rampaging! Seek shelter immediately!\n`;
      } else {
        activityMsg += `\n${hordeInfo}\n`;
      }
    }
  } else {
    const timeOfDay = time ? getTimeOfDay(time) : "unknown time";
    const groupActivity = analyzeGroupActivity(players, timeOfDay, hordeInfo);
    
    // Build player names list
    const playerNames = players.map(player => player.name).join(", ");
    
    activityMsg = `👥 **Group Story** (${players.length} survivors)\n`;
    activityMsg += `**${playerNames}**\n`;
    activityMsg += `⏰ ${time || "Unknown"}\n\n`;
    activityMsg += `${groupActivity}`;
    
    if (hordeInfo && !groupActivity.includes("blood moon") && !groupActivity.includes("aftermath")) {
      activityMsg += `\n\n${hordeInfo}`;
    }
  }
  
  return activityMsg;
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getSoloActivity(player, timeOfDay) {
  const activities = {
    morning: [
      "starting their day with a careful survey of",
      "cautiously exploring", 
      "scavenging through",
      "methodically searching",
      "bravely venturing into"
    ],
    afternoon: [
      "battling the heat while exploring",
      "pushing through the sweltering conditions in",
      "making the most of daylight in",
      "working tirelessly in",
      "persevering through"
    ],
    evening: [
      "racing against the setting sun in",
      "preparing for nightfall while in",
      "making final preparations in",
      "seeking shelter in",
      "hurrying through"
    ],
    night: [
      "daringly moving through",
      "sneaking carefully through",
      "fighting for survival in",
      "desperately trying to escape",
      "courageously facing the darkness of"
    ]
  };

  let timeKey = "morning";
  if (timeOfDay.includes("afternoon")) timeKey = "afternoon";
  else if (timeOfDay.includes("evening")) timeKey = "evening"; 
  else if (timeOfDay.includes("night")) timeKey = "night";

  return getRandomElement(activities[timeKey]);
}

function getTimeOfDay(timeStr) {
  // Parse "Day X, HH:MM" format
  const match = timeStr.match(/Day\s+(\d+),\s+(\d+):(\d+)/);
  if (!match) return "mysterious hours";
  
  const hour = parseInt(match[2]);
  
  if (hour >= 6 && hour < 12) return "morning light";
  if (hour >= 12 && hour < 18) return "afternoon heat";
  if (hour >= 18 && hour < 22) return "evening twilight";
  return "dark of night";
}

function getLocationDescription(position) {
  if (!position) return "unknown territories";
  
  const coords = position.split(',');
  if (coords.length < 3) return "mysterious coordinates";
  
  const x = parseInt(coords[0].trim());
  const z = parseInt(coords[2].trim());
  
  // Enhanced biome detection with more variety
  const centerRange = 300;
  const midRange = 800;
  const farRange = 1500;
  
  if (Math.abs(x) < centerRange && Math.abs(z) < centerRange) {
    const centerLocations = [
      "the dangerous central wasteland",
      "the heart of the wasteland where zombies roam freely", 
      "the contested central zone",
      "the perilous core territories"
    ];
    return getRandomElement(centerLocations);
  }
  
  // Determine primary direction and distance
  const distance = Math.sqrt(x*x + z*z);
  let distanceDesc = "nearby";
  if (distance > farRange) distanceDesc = "distant";
  else if (distance > midRange) distanceDesc = "far";
  else if (distance > centerRange) distanceDesc = "outer";
  
  // Determine biome based on coordinates  
  if (Math.abs(x) > Math.abs(z)) {
    // East/West regions
    if (x > 0) {
      const eastLocations = [
        `the ${distanceDesc} eastern burned forest where fire once raged`,
        `the ${distanceDesc} scorched eastern territories`,
        `the ${distanceDesc} eastern ash lands`,
        `the ${distanceDesc} fire-ravaged eastern biome`
      ];
      return getRandomElement(eastLocations);
    } else {
      const westLocations = [
        `the ${distanceDesc} western snow biome where cold death awaits`,
        `the ${distanceDesc} frozen western territories`, 
        `the ${distanceDesc} icy western wasteland`,
        `the ${distanceDesc} snow-covered western regions`
      ];
      return getRandomElement(westLocations);
    }
  } else {
    // North/South regions
    if (z > 0) {
      const northLocations = [
        `the ${distanceDesc} northern forest biome full of lurking dangers`,
        `the ${distanceDesc} dense northern woodlands`,
        `the ${distanceDesc} northern pine forests`,
        `the ${distanceDesc} forest-covered northern territories`
      ];
      return getRandomElement(northLocations);
    } else {
      const southLocations = [
        `the ${distanceDesc} southern desert wasteland where heat kills`,
        `the ${distanceDesc} scorching southern desert`,
        `the ${distanceDesc} barren southern territories`,
        `the ${distanceDesc} sand-swept southern wastelands`
      ];
      return getRandomElement(southLocations);
    }
  }
}

function getHealthCondition(health) {
  if (!health) return "in unknown condition";
  
  const hp = parseInt(health);
  if (hp >= 80) return "in excellent health";
  if (hp >= 60) return "slightly wounded but determined";
  if (hp >= 40) return "nursing some serious injuries";
  if (hp >= 20) return "badly hurt and struggling";
  return "clinging to life by a thread";
}

function getSurvivalSuggestions(player, time, hordeInfo) {
  const suggestions = [];
  const priorities = [];
  
  // Critical health warnings (highest priority)
  if (player.health && parseInt(player.health) < 20) {
    priorities.push("🚨 CRITICAL: Emergency medical attention needed - find shelter and heal immediately!");
  } else if (player.health && parseInt(player.health) < 50) {
    const healingSuggestions = [
      "⚕️ Find bandages and painkillers - your health is dangerously low",
      "🩹 Seek first aid kits as priority - you're losing precious health",
      "🏥 Find a safe place to heal - your wounds need immediate attention"
    ];
    suggestions.push(getRandomElement(healingSuggestions));
  }
  
  // Time-based warnings
  if (time) {
    const match = time.match(/Day\s+(\d+),\s+(\d+):(\d+)/);
    if (match) {
      const hour = parseInt(match[2]);
      if (hour >= 22 || hour < 6) {
        const nightSuggestions = [
          "🌙 Night Ops: Extremely dangerous - seek fortified shelter or prepare for combat",
          "🛡️ Defense: Find secure position - zombies are most active in darkness",
          "💡 Lighting: Ensure good visibility and weapons ready for night encounters"
        ];
        suggestions.push(getRandomElement(nightSuggestions));
      } else if (hour >= 18 && hour < 22) {
        suggestions.push("🌅 Twilight: Secure your position before full darkness arrives");
      }
    }
  }
  
  // Horde-specific warnings
  if (hordeInfo && hordeInfo.includes("begins in")) {
    priorities.push("🩸 Blood Moon Prep: Fortify position and stockpile ammunition NOW!");
  } else if (hordeInfo && hordeInfo.includes("rampaging now")) {
    priorities.push("💀 HORDE ACTIVE: Find the strongest shelter available - survival mode engaged!");
  }
  
  // Level-based advice
  if (player.level) {
    const level = parseInt(player.level);
    if (level < 10) {
      suggestions.push("🆕 Newbie: Focus on basic crafting, building, and avoid dangerous areas");
    } else if (level > 50) {
      suggestions.push("🏆 Veteran: Consider helping others or tackling high-level challenges");
    }
  }
  
  // Combine all suggestions with proper formatting
  let result = "";
  if (priorities.length > 0) {
    result += priorities.join("\n");
  }
  
  if (suggestions.length > 0) {
    if (result) result += "\n";
    result += suggestions.join("\n");
  }
  
  if (!result) {
    const generalSuggestions = [
      "✅ Managing well - maintain vigilance in this dangerous world",
      "👍 Current survival strategy appears effective",
      "💪 Demonstrating solid survival instincts",
      "🎯 Holding strong against the apocalypse - well done!"
    ];
    result = getRandomElement(generalSuggestions);
  }
  
  return result;
}

function analyzeGroupActivity(players, timeOfDay, hordeInfo) {
  // Categorize players by health status for narrative purposes
  const healthy = [];
  const wounded = [];
  const critical = [];
  
  players.forEach(player => {
    if (player.health) {
      const hp = parseInt(player.health);
      if (hp >= 70) {
        healthy.push(player.name);
      } else if (hp >= 40) {
        wounded.push(player.name);
      } else {
        critical.push(player.name);
      }
    } else {
      healthy.push(player.name); // Assume healthy if unknown
    }
  });
  
  // Create narrative based on group composition and time
  let narrative = "";
  
  // Blood moon context integration
  let bloodMoonContext = "";
  if (hordeInfo) {
    if (hordeInfo.includes("begins in")) {
      bloodMoonContext = "with the blood moon approaching";
    } else if (hordeInfo.includes("rampaging now")) {
      bloodMoonContext = "during the blood moon chaos";
    } else if (hordeInfo.includes("day")) {
      bloodMoonContext = "in the aftermath of recent horrors";
    }
  }
  
  // Generate narrative based on group health status
  if (critical.length > 0) {
    if (critical.length === 1) {
      narrative = `💔 Crisis in Progress: ${critical[0]} is fighting for their life while `;
      if (healthy.length > 0) {
        narrative += `${formatPlayerList(healthy)} ${healthy.length === 1 ? 'desperately tries' : 'desperately try'} to provide aid`;
      }
      if (wounded.length > 0) {
        if (healthy.length > 0) narrative += " and ";
        narrative += `${formatPlayerList(wounded)} ${wounded.length === 1 ? 'pushes' : 'push'} through their own pain to help`;
      }
    } else {
      narrative = `🚨 Dire Situation: ${formatPlayerList(critical)} are barely clinging to life`;
      if (healthy.length > 0 || wounded.length > 0) {
        narrative += ` while the remaining survivors rally together`;
      }
    }
    narrative += ` ${bloodMoonContext}`;
  } else if (wounded.length > healthy.length) {
    narrative = `⚔️ Battle-Worn Group: ${formatPlayerList(wounded)} are nursing serious wounds`;
    if (healthy.length > 0) {
      narrative += ` while ${formatPlayerList(healthy)} ${healthy.length === 1 ? 'stands' : 'stand'} guard and ${healthy.length === 1 ? 'tends' : 'tend'} to the injured`;
    }
    narrative += ` ${bloodMoonContext}`;
  } else if (healthy.length === players.length) {
    const scenarios = [
      `💪 Elite Squad: ${formatPlayerList(healthy)} move as a well-coordinated unit`,
      `🎯 Perfect Formation: ${formatPlayerList(healthy)} demonstrate exceptional teamwork`,
      `⚡ Strike Team: ${formatPlayerList(healthy)} operate with military precision`,
      `🏆 Veteran Survivors: ${formatPlayerList(healthy)} show why they've lasted this long`
    ];
    narrative = getRandomElement(scenarios) + ` ${bloodMoonContext}`;
  } else {
    // Mixed group
    if (healthy.length > 0 && wounded.length > 0) {
      narrative = `🤝 Supporting Each Other: ${formatPlayerList(healthy)} ${healthy.length === 1 ? 'leads' : 'lead'} the group while ${formatPlayerList(wounded)} ${wounded.length === 1 ? 'follows' : 'follow'} courageously despite their injuries ${bloodMoonContext}`;
    }
  }
  
  // Add time-specific narrative elements
  const timeNarratives = {
    morning: [
      "- planning their next moves as dawn breaks over the wasteland",
      "- making the most of the early light to assess their situation", 
      "- preparing for whatever challenges the day might bring",
      "- coordinating their efforts as the world awakens around them"
    ],
    afternoon: [
      "- pushing through the heat and danger of midday operations",
      "- maximizing the precious daylight hours for critical tasks",
      "- working efficiently while visibility remains on their side",
      "- making decisive moves during the safest hours"
    ],
    evening: [
      "- racing against time as shadows grow longer",
      "- making final preparations before the darkness arrives",
      "- securing their position for the dangerous hours ahead", 
      "- hustling to complete objectives before nightfall"
    ],
    night: [
      "- moving through the darkness with either desperate courage or foolish bravery",
      "- defying the night terrors that would drive most to shelter",
      "- proving their mettle against the most dangerous hours",
      "- showing remarkable nerve in the face of nocturnal horrors"
    ]
  };

  let timeKey = "morning";
  if (timeOfDay.includes("afternoon")) timeKey = "afternoon";
  else if (timeOfDay.includes("evening")) timeKey = "evening"; 
  else if (timeOfDay.includes("night")) timeKey = "night";

  narrative += ` ${getRandomElement(timeNarratives[timeKey])}`;
  
  return narrative;
}

function formatPlayerList(players) {
  if (players.length === 0) return "";
  if (players.length === 1) return players[0];
  if (players.length === 2) return `${players[0]} and ${players[1]}`;
  return `${players.slice(0, -1).join(", ")}, and ${players[players.length - 1]}`;
}

// ---- Analytics persistence (player trends, sessions, baselines, streaks) ----
let saveTimer = null;
function scheduleAnalyticsSave(delayMs = 4000) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveAnalyticsData();
  }, delayMs);
}

function saveAnalyticsData() {
  try {
    const analyticsData = {
      playerTrends: d7dtdState.playerTrends,
      playerSessions: d7dtdState.playerSessions,
      playerBaselines: d7dtdState.playerBaselines,
      playerStreaks: d7dtdState.playerStreaks,
  playerTravel: d7dtdState.playerTravel,
  playerCraft: d7dtdState.playerCraft,
      lastSaved: Date.now()
    };
    fs.writeFileSync('./analytics.json', JSON.stringify(analyticsData, null, 2), 'utf8');
  } catch (error) {
    console.warn('Warning: Failed to save analytics data:', error.message);
  }
}

function loadAnalyticsData() {
  try {
    if (!fs.existsSync('./analytics.json')) return;
    const data = fs.readFileSync('./analytics.json', 'utf8');
    const analyticsData = JSON.parse(data);
    if (analyticsData.playerTrends) {
      d7dtdState.playerTrends = analyticsData.playerTrends;
      console.log(c.gray(`Analytics data loaded: ${d7dtdState.playerTrends.history.length} data points restored`));
    }
    if (analyticsData.playerSessions) {
      d7dtdState.playerSessions = analyticsData.playerSessions;
    }
    if (analyticsData.playerBaselines) {
      d7dtdState.playerBaselines = analyticsData.playerBaselines;
    }
    if (analyticsData.playerStreaks) {
      d7dtdState.playerStreaks = analyticsData.playerStreaks;
    }
    if (analyticsData.playerTravel) {
      d7dtdState.playerTravel = analyticsData.playerTravel;
    }
    if (analyticsData.playerCraft) {
      d7dtdState.playerCraft = analyticsData.playerCraft;
    }
  } catch (error) {
    console.warn('Warning: Failed to load analytics data:', error.message);
    console.log('Starting with fresh analytics data');
  }
}

// Version announcement functions
function checkAndAnnounceVersion() {
  try {
    let versionData = { lastAnnouncedVersion: null };
    
    // Load previous version data
    if (fs.existsSync('./version.json')) {
      const data = fs.readFileSync('./version.json', 'utf8');
      versionData = JSON.parse(data);
    }
    
    // Check if this is a new version
    const currentVersion = pjson.version;
    if (versionData.lastAnnouncedVersion !== currentVersion) {
      console.log(`New version detected: ${currentVersion} (was: ${versionData.lastAnnouncedVersion || 'none'})`);
      
      // Save the new version
      versionData.lastAnnouncedVersion = currentVersion;
      fs.writeFileSync('./version.json', JSON.stringify(versionData, null, 2), 'utf8');
      
      // Schedule announcement after Discord is ready
      setTimeout(() => {
        announceNewVersion(currentVersion);
      }, 5000); // Wait 5 seconds for Discord to be fully ready
    }
  } catch (error) {
    console.warn('Warning: Failed to check version:', error.message);
  }
}

function announceNewVersion(version) {
  if (!channel && config.channel && client && client.channels) {
    try {
      const tryFetch = client.channels.fetch(config.channel.toString());
      if (tryFetch && typeof tryFetch.then === 'function') {
        tryFetch.then((ch) => { if (ch && ch.isText()) channel = ch; }).catch(() => {});
      }
    } catch (_) {}
  }
  if (!channel) {
    console.log('Channel not ready for version announcement');
    return;
  }
  
  const releaseNotes = {
    "2.4.0": {
  title: "🎉 DeadLink v2.4.0 Released!",
      description: "Major update with persistent analytics and UI improvements",
      features: [
        "💾 **Persistent Analytics** - Your server trends now survive bot restarts!",
        "🎯 **UI Polish** - Cleaner visual experience with reduced clutter",
        "📊 **Data Reliability** - Analytics automatically save every 10 minutes",
        "🧹 **Code Cleanup** - Streamlined interface and improved performance"
      ],
      color: 0x00ff00 // Green for new release
    }
  };
  
  const notes = releaseNotes[version];
  if (!notes) {
    // Generic announcement for versions without specific release notes
    const embed = {
      color: 0x7289da,
  title: `🚀 DeadLink v${version} Released!`,
      description: "The bot has been updated with new features and improvements!",
      footer: {
  text: `DeadLink v${version}`,
      },
      timestamp: new Date().toISOString()
    };
    
    channel.send({ embeds: [embed] }).catch(console.error);
    return;
  }
  
  // Detailed announcement with release notes
  const embed = {
    color: notes.color,
    title: notes.title,
    description: notes.description,
    fields: [
      {
        name: "✨ What's New",
        value: notes.features.join('\n'),
        inline: false
      },
      {
        name: "📋 Commands",
        value: "`/info` - View all features and changelog\n`/dashboard` - Interactive control panel",
        inline: false
      }
    ],
    footer: {
  text: `DeadLink v${version}`,
    },
    timestamp: new Date().toISOString()
  };
  
  channel.send({ embeds: [embed] })
    .then(() => console.log(`Version ${version} announcement sent to Discord`))
    .catch(error => console.error('Failed to send version announcement:', error));
}

function trackPlayerCount(playerCount, playerNames = []) {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000; // 10 minutes in milliseconds
  
  // Only track if it's been at least 10 minutes since last check
  if (now - d7dtdState.playerTrends.lastCheck < tenMinutes) {
    return;
  }
  
  d7dtdState.playerTrends.lastCheck = now;
  
  // Add new data point
  d7dtdState.playerTrends.history.push({
    timestamp: now,
    count: playerCount,
    players: [...playerNames],
    time: new Date().toLocaleTimeString('en-US', { hour12: false })
  });
  
  // Keep only the last maxHistory entries
  if (d7dtdState.playerTrends.history.length > d7dtdState.playerTrends.maxHistory) {
    d7dtdState.playerTrends.history.shift();
  }
  
  // Save analytics data after each update
  saveAnalyticsData();
  
  log.debug('[TRENDS]', `Tracked ${playerCount} players @ ${new Date().toLocaleTimeString()}`);
}

function generateTrendsReport() {
  const history = d7dtdState.playerTrends.history;
  if (history.length < 2) {
    return "📊 **Player Trends**\n\n❌ Not enough data yet. Trends will be available after a few hours of monitoring.\n\n*Check back later for detailed analytics!*";
  }
  
  // Calculate statistics
  const counts = history.map(h => h.count);
  const currentCount = counts[counts.length - 1];
  const avgCount = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length * 10) / 10;
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  
  // Find peak times
  const hourlyStats = {};
  history.forEach(entry => {
    const hour = new Date(entry.timestamp).getHours();
    if (!hourlyStats[hour]) hourlyStats[hour] = [];
    hourlyStats[hour].push(entry.count);
  });
  
  const hourlyAvgs = Object.keys(hourlyStats).map(hour => ({
    hour: parseInt(hour),
    avg: hourlyStats[hour].reduce((a, b) => a + b, 0) / hourlyStats[hour].length
  })).sort((a, b) => b.avg - a.avg);
  
  const peakHour = hourlyAvgs[0];
  const lowHour = hourlyAvgs[hourlyAvgs.length - 1];
  
  // Recent trend (last 6 data points)
  const recentData = history.slice(-6);
  const recentTrend = recentData.length > 1 ? 
    recentData[recentData.length - 1].count - recentData[0].count : 0;
  
  // Enhanced analytics
  const enhancedAnalytics = generateEnhancedAnalytics(history);
  
  // Build report
  let report = ``;
  
  // Current status with trend indicator
  const trendEmoji = recentTrend > 0 ? "📈" : recentTrend < 0 ? "📉" : "➡️";
  report += `${trendEmoji} **Current**: ${currentCount} player${currentCount === 1 ? '' : 's'}\n`;
  report += `📋 **24h Average**: ${avgCount} players\n`;
  report += `🔝 **Peak**: ${maxCount} players | 🔽 **Low**: ${minCount} players\n\n`;
  report += `\n`;
  
  // Enhanced activity insights
  report += `🎯 **Activity Insights**\n`;
  report += enhancedAnalytics;
  report += `\n`;
  

  
  // Peak times analysis
  if (peakHour && lowHour) {
    const peakTime = formatHour(peakHour.hour);
    const lowTime = formatHour(lowHour.hour);
    report += `⏰ **Peak Time**: ${peakTime} (${Math.round(peakHour.avg * 10) / 10} avg)\n`;
    report += `🌙 **Quiet Time**: ${lowTime} (${Math.round(lowHour.avg * 10) / 10} avg)\n\n`;
  }
  
  // Trend analysis
  if (recentTrend > 0) {
    report += `🚀 **Trending Up**: +${recentTrend} player${Math.abs(recentTrend) === 1 ? '' : 's'} in recent activity\n`;
  } else if (recentTrend < 0) {
    report += `📉 **Trending Down**: ${recentTrend} player${Math.abs(recentTrend) === 1 ? '' : 's'} in recent activity\n`;
  } else {
    report += `🔄 **Stable**: Consistent player count recently\n`;
  }
  
  // Data collection info
  const dataAge = Math.round((Date.now() - history[0].timestamp) / (1000 * 60 * 60) * 10) / 10;
  // Retention: unique players in last 24h
  const twentyFourAgo = Date.now() - 24*60*60*1000;
  const recentEntries = history.filter(h => h.timestamp >= twentyFourAgo);
  const uniqueRecent = new Set();
  recentEntries.forEach(e => (e.players||[]).forEach(p => uniqueRecent.add(p)));
  const currentPlayersList = history[history.length-1].players || [];
  const retention = uniqueRecent.size ? Math.round((currentPlayersList.length/uniqueRecent.size)*100) : 0;
  report += `👥 **24h Unique**: ${uniqueRecent.size} | 🔄 **Retention**: ${retention}%\n`;
  report += `\n📡 *Tracking ${history.length} data points over ${dataAge}h*`;
  
  return report;
}

function generateEnhancedAnalytics(history) {
  if (history.length < 3) return "📊 *Insufficient data for detailed analysis*";
  
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  const threeHoursAgo = now - (3 * 60 * 60 * 1000);
  const sixHoursAgo = now - (6 * 60 * 60 * 1000);
  
  // Filter recent data
  const lastHour = history.filter(h => h.timestamp >= oneHourAgo);
  const last3Hours = history.filter(h => h.timestamp >= threeHoursAgo);
  const last6Hours = history.filter(h => h.timestamp >= sixHoursAgo);
  
  // Calculate activity metrics
  const currentActivity = calculateActivityLevel(lastHour);
  const recentActivity = calculateActivityLevel(last3Hours);
  const extendedActivity = calculateActivityLevel(last6Hours);
  
  // Player session analysis
  const sessionInsights = analyzePlayerSessions(history);
  
  // Activity patterns
  const activityPatterns = analyzeActivityPatterns(history);
  
  let analytics = "";
  
  // Activity levels
  analytics += `🕐 **Last Hour**: ${currentActivity.level} (${currentActivity.avg} avg)\n`;
  analytics += `⏰ **Last 3 Hours**: ${recentActivity.level} (${recentActivity.avg} avg)\n`;
  analytics += `📅 **Last 6 Hours**: ${extendedActivity.level} (${extendedActivity.avg} avg)\n`;
  
  // Session insights
  if (sessionInsights) {
    analytics += `\n👥 **Session Insights**\n`;
    analytics += sessionInsights;
  }
  
  // Activity patterns
  if (activityPatterns) {
    analytics += `\n📊 **Activity Patterns**\n`;
    analytics += activityPatterns;
  }
  
  return analytics;
}

function calculateActivityLevel(dataPoints) {
  if (dataPoints.length === 0) return { level: "No Data", avg: 0 };
  
  const counts = dataPoints.map(d => d.count);
  const avg = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length * 10) / 10;
  const max = Math.max(...counts);
  
  let level = "Low";
  if (avg >= 5) level = "High";
  else if (avg >= 2) level = "Moderate";
  
  return { level, avg, max };
}

function analyzePlayerSessions(history) {
  if (history.length < 6) return null;
  
  // Find unique players across recent data
  const recentPlayers = new Set();
  const last24Hours = history.filter(h => h.timestamp >= Date.now() - (24 * 60 * 60 * 1000));
  
  last24Hours.forEach(entry => {
    if (entry.players && Array.isArray(entry.players)) {
      entry.players.forEach(player => recentPlayers.add(player));
    }
  });
  
  const uniquePlayers = recentPlayers.size;
  const currentPlayers = history[history.length - 1].players || [];
  
  let insights = "";
  
  // Player retention
  if (uniquePlayers > 0) {
    const retentionRate = Math.round((currentPlayers.length / uniquePlayers) * 100);
    insights += `🎯 **Retention**: ${retentionRate}% of recent players still online\n`;
  }
  
  // Session duration estimate
  if (currentPlayers.length > 0) {
    const avgSessionLength = estimateSessionLength(history, currentPlayers);
    if (avgSessionLength) {
      insights += `⏱️ **Avg Session**: ~${avgSessionLength} hours\n`;
    }
  }
  
  // Player activity patterns
  const activityPattern = getActivityPattern(history);
  if (activityPattern) {
    insights += `📈 **Pattern**: ${activityPattern}\n`;
  }
  
  return insights || null;
}

function analyzeActivityPatterns(history) {
  if (history.length < 12) return null;
  
  const recent = history.slice(-6);
  const previous = history.slice(-12, -6);
  
  const recentAvg = recent.reduce((sum, h) => sum + h.count, 0) / recent.length;
  const previousAvg = previous.reduce((sum, h) => sum + h.count, 0) / previous.length;
  
  const change = recentAvg - previousAvg;
  const changePercent = Math.round((change / (previousAvg || 1)) * 100);
  
  let patterns = "";
  
  // Activity change
  if (Math.abs(changePercent) > 10) {
    const direction = changePercent > 0 ? "increasing" : "decreasing";
    patterns += `📊 **Activity ${direction}** by ${Math.abs(changePercent)}%\n`;
  } else {
    patterns += `📊 **Stable activity** (±${Math.abs(changePercent)}%)\n`;
  }
  
  // Consistency
  const consistency = calculateConsistency(history);
  patterns += `🎯 **Consistency**: ${consistency}\n`;
  
  return patterns;
}

function estimateSessionLength(history, currentPlayers) {
  if (currentPlayers.length === 0 || history.length < 2) return null;
  
  // Simple estimation based on how long players have been consistently online
  let sessionStart = Date.now();
  
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    const entryPlayers = entry.players || [];
    
    // Check if any current players were present
    const hasCurrentPlayers = currentPlayers.some(player => 
      entryPlayers.includes(player)
    );
    
    if (hasCurrentPlayers) {
      sessionStart = entry.timestamp;
    } else {
      break;
    }
  }
  
  const sessionHours = Math.round((Date.now() - sessionStart) / (1000 * 60 * 60) * 10) / 10;
  return sessionHours > 0 ? sessionHours : null;
}

function getActivityPattern(history) {
  if (history.length < 6) return null;
  
  const recent = history.slice(-6);
  const counts = recent.map(h => h.count);
  
  // Check for patterns
  const increasing = counts.every((count, i) => i === 0 || count >= counts[i - 1]);
  const decreasing = counts.every((count, i) => i === 0 || count <= counts[i - 1]);
  const stable = counts.every((count, i) => i === 0 || Math.abs(count - counts[i - 1]) <= 1);
  
  if (increasing) return "Steadily increasing";
  if (decreasing) return "Gradually declining";
  if (stable) return "Consistent activity";
  
  return "Variable activity";
}

function findPeakActivityTime(history) {
  if (history.length < 6) return null;
  
  const hourlyActivity = {};
  history.forEach(entry => {
    const hour = new Date(entry.timestamp).getHours();
    if (!hourlyActivity[hour]) hourlyActivity[hour] = [];
    hourlyActivity[hour].push(entry.count);
  });
  
  const hourlyAvgs = Object.keys(hourlyActivity).map(hour => ({
    hour: parseInt(hour),
    avg: hourlyActivity[hour].reduce((a, b) => a + b, 0) / hourlyActivity[hour].length
  })).sort((a, b) => b.avg - a.avg);
  
  if (hourlyAvgs.length > 0) {
    return formatHour(hourlyAvgs[0].hour);
  }
  
  return null;
}

function calculateConsistency(history) {
  if (history.length < 6) return "Insufficient data";
  
  const counts = history.map(h => h.count);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((sum, count) => sum + Math.pow(count - avg, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const coefficient = (stdDev / avg) * 100;
  
  if (coefficient < 20) return "Very consistent";
  if (coefficient < 40) return "Moderately consistent";
  if (coefficient < 60) return "Variable";
  return "Highly variable";
}

function generateMiniChart(data) {
  if (data.length === 0) return "No data";
  
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  
  let chart = "";
  data.forEach((value, index) => {
    const normalized = (value - min) / range;
    const barIndex = Math.floor(normalized * (bars.length - 1));
    chart += bars[barIndex];
    
    // Add spacing every 4 characters for readability
    if ((index + 1) % 4 === 0 && index < data.length - 1) {
      chart += " ";
    }
  });
  
  return chart;
}

function formatHour(hour) {
  if (hour === 0) return "12:00 AM";
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return "12:00 PM";
  return `${hour - 12}:00 PM`;
}

function handleTrends(msg) {
  try {
    const trendsReport = generateTrendsReport();
    const sendAscii = () => msg.channel.send({ embeds: [{
      color: 0x3498db,
      title: "📊 Server Analytics Dashboard",
      description: trendsReport,
      footer: { text: `Report generated on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}` }
    }] }).catch(() => msg.channel.send(trendsReport).catch(()=>{}));

    (async () => {
      try {
        const png = await renderTrendPng(d7dtdState.playerTrends.history);
        if (!png) return sendAscii();
        await msg.channel.send({ files: [{ attachment: png, name: 'trends.png' }], embeds: [{
          color: 0x3498db,
          title: "📊 Server Analytics Dashboard",
          description: trendsReport.split('\n').slice(0, 12).join('\n')
        }] });
      } catch (_) { sendAscii(); }
    })();
  } catch (_) { /* ignore */ }
}

function generateChangesReport() {
  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const v = pjson.version;

  return (
  `**🆕 Updates & Releases**\n` +
  `⬆️ **Update checks** — Private checks for new releases with admin helpers\n` +
  `📢 **Public announcements** — Auto-post to a configured channel (updates.notifyMode/channel)\n\n` +
    `**🎮 Core Actions**\n` +
  `🎮 \`/dashboard\` — Interactive control panel (buttons for Activity, Players, Time)\n` +
  `🎯 \`/activity\` — Narrative activity with survival tips\n` +
  `👥 \`/players\` — Show current players online\n` +
  `⏰ \`/time\` — Show current in-game time\n` +
    `📊 \`/trends\` — Player count analytics & trends\n` +
    `ℹ️ \`/info\` — This overview\n\n` +

  `**🤖 Intelligent Features**\n` +
  `🧠 Context-aware survival guidance\n` +
  `📍 Location intelligence & player status parsing\n` +
  `📈 Trend visualization and session insights\n\n` +

  `**⚙️ Reliability & Security**\n` +
  `🔌 Telnet connect/reconnect lifecycle with basic auth\n` +
  `⏱️ Per-command timeouts; soft-success when servers don’t echo\n` +
  `🔒 Secrets via environment variables; single-instance protection`
  );
}

function createDashboardEmbed() {
  const statusEmoji = d7dtdState.connStatus === 1 ? "🟢" : d7dtdState.connStatus === 0 ? "🟡" : "🔴";
  const statusText = d7dtdState.connStatus === 1 ? "Online" : d7dtdState.connStatus === 0 ? "Connecting..." : "Error";
  const modeMsg = config["dev-mode"] ? "🧪 Dev" : "Live";
  
  return {
    color: 0x7289da, // Discord blurple
    title: "🎮 7 Days to Die Server Dashboard",
  description: `${statusEmoji} **Server Status**: ${statusText}\n🛠️ **Mode**: ${modeMsg}\n\n` +
                 `Welcome to the interactive server control panel! Use the buttons below to quickly access server information and analytics.\n\n` +
                 `🎯 **Activity** - Get detailed player activity reports\n` +
                 `📊 **Trends** - View player count analytics and trends\n` +
                 `👥 **Players** - See current online players\n` +
                 `⏰ **Time** - Check current game time\n` +
                 `ℹ️ **Info** - Server version and details`,
    footer: {
  text: `DeadLink v${pjson.version}`,
    }
  };
}

function createDashboardButtons() {
  return {
    type: 1, // Action Row
    components: [
      {
        type: 2, // Button
        style: 1, // Blue (Primary)
        label: "🎯 Activity",
        custom_id: "dashboard_activity",
        disabled: d7dtdState.connStatus !== 1
      },
      {
        type: 2, // Button
        style: 1, // Blue (Primary)
        label: "📊 Trends",
        custom_id: "dashboard_trends",
        disabled: false
      },
      {
        type: 2, // Button
        style: 3, // Green (Success)
        label: "👥 Players",
        custom_id: "dashboard_players",
        disabled: d7dtdState.connStatus !== 1
      },
      {
        type: 2, // Button
        style: 1, // Blue (Primary)
        label: "⏰ Time",
        custom_id: "dashboard_time",
        disabled: d7dtdState.connStatus !== 1
      },
      {
        type: 2, // Button
        style: 4, // Red (Danger) - High contrast for Info
        label: "ℹ️ Info",
        custom_id: "dashboard_info",
        disabled: false
      }
    ]
  };
}

// Create navigation buttons for feature screens
function createNavigationButtons(currentFeature) {
  const buttons = [];
  
  // Define all features with consistent styling and fixed positions
  const features = [
    { id: 'dashboard_activity', label: '🎯 Activity', style: 1, position: 0 }, // Blue (Primary)
    { id: 'dashboard_trends', label: '📊 Trends', style: 1, position: 1 }, // Blue (Primary)
    { id: 'dashboard_players', label: '👥 Players', style: 3, position: 2 }, // Green (Success)
    { id: 'dashboard_time', label: '⏰ Time', style: 1, position: 3 }, // Blue (Primary)
    { id: 'dashboard_info', label: 'ℹ️ Info', style: 4, position: 4 } // Red (Danger)
  ];
  
  // Create buttons maintaining original positions, but skip current feature
  features.forEach(feature => {
    if (feature.id !== currentFeature) {
      buttons.push({
        type: 2, // Button
        style: feature.style,
        label: feature.label,
        custom_id: feature.id,
        disabled: feature.id.includes('activity') || feature.id.includes('players') || feature.id.includes('time') ? d7dtdState.connStatus !== 1 : false,
        position: feature.position // Keep track of original position for consistency
      });
    } else {
      // Add a "Back to Dashboard" button in place of current feature
      buttons.push({
        type: 2, // Button
        style: 1, // Primary (blue)
        label: '🏠 Dashboard',
        custom_id: 'back_to_dashboard',
        disabled: false,
        position: feature.position
      });
    }
  });
  
  // Sort buttons by position to maintain consistent layout
  buttons.sort((a, b) => a.position - b.position);
  
  // Remove position property before returning (Discord doesn't need it)
  buttons.forEach(button => delete button.position);
  
  return {
    type: 1, // Action Row
    components: buttons.slice(0, 5) // Discord limit of 5 buttons per row
  };
}

// Build a select menu (string select) for choosing a player to deep dive from the Players screen
function createPlayerSelect(players, selectedName) {
  try {
    if (!Array.isArray(players) || players.length === 0) return null;
    // Deduplicate by name & sort alphabetically
    const uniq = Array.from(new Set(players.map(p => p.name))).sort((a,b)=>a.localeCompare(b));
    const options = [];
    if (uniq.length > 1) {
      options.push({
        label: 'All Players (List View)',
        value: '__ALL__',
        description: 'Return to full list view',
        default: !selectedName || selectedName === '__ALL__'
      });
    }
    uniq.slice(0, 24).forEach(name => { // 25 options max; reserve 1 for ALL
      options.push({
        label: name.length > 25 ? name.slice(0,22) + '…' : name,
        value: name,
        description: 'Deep dive analytics',
        default: !!selectedName && selectedName.toLowerCase() === name.toLowerCase()
      });
    });
    if (!options.length) return null;
    return {
      type: 1, // action row
      components: [
        {
          type: 3, // string select
          custom_id: 'player_select',
          placeholder: 'Select player for deep dive',
          min_values: 1,
            max_values: 1,
          options
        }
      ]
    };
  } catch(_) { return null; }
}

function handleDashboard(msg) {
  const embed = createDashboardEmbed();
  const buttons = createDashboardButtons();
  
  msg.channel.send({
    embeds: [embed],
    components: [buttons]
  }).catch((err) => {
    console.log("Dashboard embed failed, sending fallback:", err);
    // Fallback without buttons
    msg.channel.send({ embeds: [embed] });
  });
}

function handleButtonInteraction(interaction) {
  const customId = interaction.customId;
  
  switch(customId) {
    case 'dashboard_activity':
      console.log(`User ${interaction.user.tag} (${interaction.user.id}) clicked Activity button`);
      handleActivityFromButton(interaction);
      break;
      
    case 'dashboard_trends':
      console.log(`User ${interaction.user.tag} (${interaction.user.id}) clicked Trends button`);
      handleTrendsFromButton(interaction);
      break;
      
    case 'dashboard_players':
      console.log(`User ${interaction.user.tag} (${interaction.user.id}) clicked Players button`);
      handlePlayersFromButton(interaction);
      break;
      
    case 'dashboard_time':
      console.log(`User ${interaction.user.tag} (${interaction.user.id}) clicked Time button`);
      handleTimeFromButton(interaction);
      break;
      
    case 'dashboard_info':
      console.log(`User ${interaction.user.tag} (${interaction.user.id}) clicked Info button`);
      handleInfoFromButton(interaction);
      break;
      
    case 'back_to_dashboard':
      console.log(`User ${interaction.user.tag} (${interaction.user.id}) clicked Back to Dashboard button`);
      handleBackToDashboard(interaction);
      break;
      
    default:
      interaction.reply("❌ Unknown button interaction.").catch(console.error);
  }
}

function handleBackToDashboard(interaction) {
  const embed = createDashboardEmbed();
  const buttons = createDashboardButtons();
  
  interaction.update({
    embeds: [embed],
    components: [buttons]
  }).catch(console.error);
}

function handleActivityFromButton(interaction) {
  // Defer the reply immediately
  interaction.deferReply().then(() => {
    // Reuse existing activity logic but with interaction response
    d7dtdState.activityData = {
      players: [],
      time: null,
      hordeTime: null
    };

  telnetQueue.exec("lp", { timeout: 7000 }).then(({err, response}) => {
      if (!err) {
        processTelnetResponse(response, (line) => {
          if (line.includes("id=") && line.includes("pos=")) {
            const playerData = parsePlayerData(line);
            if (playerData) {
              d7dtdState.activityData.players.push(playerData);
            }
          }
        });

  telnetQueue.exec("gettime", { timeout: 5000 }).then(({err: timeErr, response: timeResponse}) => {
          if (!timeErr) {
            processTelnetResponse(timeResponse, (timeLine) => {
              if (timeLine.startsWith("Day")) {
                d7dtdState.activityData.time = timeLine;
                const hordeMsg = calculateHordeStatus(timeLine);
                d7dtdState.activityData.hordeTime = hordeMsg;
                
                const playerNames = d7dtdState.activityData.players.map(p => p.name);
                trackPlayerCount(d7dtdState.activityData.players.length, playerNames);
                
                const activityMessage = generateActivityMessage(
                  d7dtdState.activityData.players,
                  d7dtdState.activityData.time,
                  d7dtdState.activityData.hordeTime
                );
                
                const embed = {
                  color: 0x2ecc71,
                  title: "🎯 Server Activity Report",
                  description: activityMessage,
                  footer: {
                    text: `Data collected on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}`,
                  }
                };
                
                const navigationButtons = createNavigationButtons('dashboard_activity');
                interaction.editReply({ 
                  embeds: [embed],
                  components: [navigationButtons]
                }).catch(console.error);
              }
            });
          } else {
            interaction.editReply("❌ Failed to get server time.").catch(console.error);
          }
        });
      } else {
        interaction.editReply("❌ Failed to connect to server.").catch(console.error);
      }
    });
  }).catch(console.error);
}

function handleTrendsFromButton(interaction) {
  interaction.deferReply().then(() => {
    const trendsReport = generateTrendsReport();
    
    const embed = {
      color: 0x3498db,
      title: "📊 Server Analytics Dashboard",
      description: trendsReport,
      footer: {
        text: `Report generated on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}`,
      }
    };
    
    const navigationButtons = createNavigationButtons('dashboard_trends');
    interaction.editReply({ 
      embeds: [embed],
      components: [navigationButtons]
    }).catch(console.error);
  }).catch(console.error);
}

function handlePlayersFromButton(interaction) {
  interaction.deferReply().then(() => {
  telnetQueue.exec("lp", { timeout: 7000 }).then(({err, response}) => {
      if (err) return handleCmdError(err);
      const players = [];
      let totalLine = '';
      processTelnetResponse(response, (line) => {
        if (line.includes('id=') && line.includes('pos=')) {
          const p = parsePlayerData(line);
          if (p) players.push(p);
        } else if (line.startsWith('Total of ')) {
          totalLine = line;
          const match = line.match(/Total of (\d+) players/);
          if (match) trackPlayerCount(parseInt(match[1]));
        }
      });
      const embed = buildPlayersEmbed(players, totalLine);
      const navigationButtons = createNavigationButtons('dashboard_players');
  const select = createPlayerSelect(players);
  const components = [navigationButtons];
  if (select) components.push(select);
  interaction.editReply({ embeds: [embed], components }).catch(console.error);
  });
  }).catch(console.error);
}

function handleTimeFromButton(interaction) {
  interaction.deferReply().then(() => {
  telnetQueue.exec("gettime", { timeout: 5000 }).then(({err, response}) => {
      if (err) return handleCmdError(err);
      let timeData = "";
      processTelnetResponse(response, (line) => { if (line.startsWith("Day")) timeData = line; });
      if (timeData) {
        const embed = {
          color: 0x3498db,
          title: "⏰ Current Game Time",
          description: timeData,
          footer: { text: `Data collected on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}` }
        };
        const navigationButtons = createNavigationButtons('dashboard_time');
        interaction.editReply({ 
          embeds: [embed],
          components: [navigationButtons]
        }).catch(console.error);
      } else {
        interaction.editReply("❌ No time data received.").catch(console.error);
      }
    });
  }).catch(console.error);
}

function handleInfoFromButton(interaction) {
  interaction.deferReply().then(async () => {
    const statusMsg = d7dtdState.connStatus === 1 ? ":green_circle: Online" : 
                     d7dtdState.connStatus === 0 ? ":white_circle: Connecting..." : 
                     ":red_circle: Error";
  const modeMsg = config["dev-mode"] ? "🧪 Dev" : "Live";
    
    // Use the comprehensive changes content for info (same as main info command)
    const changesReport = generateChangesReport();
    const latestLine = `\n\n**Updates**\nLatest release: https://DeadLink.lol`;
  const infoContent = `Server connection: ${statusMsg}\nMode: ${modeMsg}\n\n${changesReport}${latestLine}`;
    
    const embed = {
      color: 0x7289da, // Discord blurple for info
  title: "🎮 DeadLink Information & Features",
      description: infoContent,
      footer: {
  text: `DeadLink by CDRZ`,
      }
    };
    
    const navigationButtons = createNavigationButtons('dashboard_info');
    interaction.editReply({ 
      embeds: [embed],
      components: [navigationButtons]
    }).catch(console.error);
  }).catch(console.error);
}

// Slash: /update with options { action: check|notes|announce }
async function handleUpdateFromSlash(interaction) {
  try {
    // Defer to allow API calls
    await interaction.deferReply({ ephemeral: false });
    const action = (interaction.options && interaction.options.getString ? (interaction.options.getString('action') || 'check') : 'check').toLowerCase();
    const info = await updates.fetchLatest({ includePrerelease: !!(config.updates && config.updates.prerelease) });
    if (!info) {
      return interaction.editReply('❌ Could not fetch release info.').catch(() => {});
    }
    const upToDate = !updates.isNewer(info.version);
    const embed = buildUpdateEmbed(info, pjson.version, { upToDate });

    // Always post publicly to the main channel (the interaction channel), per request
    if (action === 'check') {
      return interaction.editReply({ embeds: [embed] }).catch(() => {});
    }
    if (action === 'notes') {
      const body = info.body && info.body.trim() ? info.body.slice(0, 3900) : 'No release notes available.';
      const content = `Release notes for ${info.tag}:\n\n${body}\n\n${info.url}`;
      return interaction.editReply({ content }).catch(() => {});
    }
    if (action === 'announce') {
      // Announce to the channel where the command was used
      try {
        await interaction.editReply({ embeds: [embed] });
      } catch (_) {}
      return; // nothing else needed; this is the public announce
    }
    // Fallback
    return interaction.editReply({ embeds: [embed] }).catch(() => {});
  } catch (e) {
    try { await interaction.editReply('❌ Update command failed.'); } catch(_) {}
  }
}

function handleActivity(msg) {
  // Clear previous activity data
  d7dtdState.activityData = {
    players: [],
    time: null,
    hordeTime: null
  };

  // Set up the waiting state
  d7dtdState.waitingForActivity = 1;
  d7dtdState.waitingForActivityMsg = msg;

  // Execute multiple commands to gather data
  telnetQueue.exec("lp", { timeout: 7000 }).then(({err, response}) => {
    if (!err) {
      processTelnetResponse(response, (line) => {
        if (line.includes("id=") && line.includes("pos=")) {
          // Parse player data from listplayers output
          const playerData = parsePlayerData(line);
          if (playerData) {
            d7dtdState.activityData.players.push(playerData);
          }
        } else if (line.startsWith("Total of ")) {
          d7dtdState.receivedData = 1;
        }
      });

    // Get current time
  telnetQueue.exec("gettime", { timeout: 5000 }).then(({err: timeErr, response: timeResponse}) => {
        if (!timeErr) {
          processTelnetResponse(timeResponse, (timeLine) => {
            if (timeLine.startsWith("Day")) {
              d7dtdState.activityData.time = timeLine;
              
              // Calculate horde information
              const hordeMsg = calculateHordeStatus(timeLine);
              d7dtdState.activityData.hordeTime = hordeMsg;
              
              // Track player count for trends (before generating message)
              const playerNames = d7dtdState.activityData.players.map(p => p.name);
              trackPlayerCount(d7dtdState.activityData.players.length, playerNames);
              
              // Generate and send the activity message
              const activityMessage = generateActivityMessage(
                d7dtdState.activityData.players,
                d7dtdState.activityData.time,
                d7dtdState.activityData.hordeTime
              );
              
              // Create enhanced embed for activity
              const embed = {
                color: 0x2ecc71, // Green color for activity
                title: "🎯 Server Activity Report",
                description: activityMessage,
                footer: {
                  text: `Data collected on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}`,
                }
              };
              
              msg.channel.send({ embeds: [embed] })
                .catch(() => {
                  // Fallback to plain text if embed fails
                  msg.channel.send(activityMessage);
                });
                
              d7dtdState.waitingForActivity = 0;
            }
          });
        }
      });
    } else {
      handleCmdError(err);
      d7dtdState.waitingForActivity = 0;
    }
  });
}

function handleTrends(msg) {
  try {
    const trendsReport = generateTrendsReport();
    const sendAscii = () => msg.channel.send({ embeds: [{
      color: 0x3498db,
      title: "📊 Server Analytics Dashboard",
      description: trendsReport,
      footer: { text: `Report generated on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}` }
    }] }).catch(() => msg.channel.send(trendsReport).catch(()=>{}));

    (async () => {
      try {
        const png = await renderTrendPng(d7dtdState.playerTrends.history);
        if (!png) return sendAscii();
        await msg.channel.send({ files: [{ attachment: png, name: 'trends.png' }], embeds: [{
          color: 0x3498db,
          title: "📊 Server Analytics Dashboard",
          description: trendsReport.split('\n').slice(0, 12).join('\n')
        }] });
      } catch (_) { sendAscii(); }
    })();
  } catch (_) { /* ignore */ }
}

function handlePlayers(msg) {
  try {
  telnetQueue.exec("lp", { timeout: 7000 }).then(({err, response}) => {
      if (err) return handleCmdError(err);
      const players = [];
      let totalLine = '';
      processTelnetResponse(response, (line) => {
        if (line.includes('id=') && line.includes('pos=')) {
          const p = parsePlayerData(line);
          if (p) players.push(p);
        } else if (line.startsWith('Total of ')) {
          totalLine = line;
          const match = line.match(/Total of (\d+) players/);
          if (match) trackPlayerCount(parseInt(match[1]));
        }
      });
      const embed = buildPlayersEmbed(players, totalLine);
      msg.channel.send({ embeds: [embed] }).catch(() => msg.channel.send(totalLine || 'No data'));
  });
  } catch (_) {}
}

function handleTime(msg) {
  try {
  telnetQueue.exec("gettime", { timeout: 5000 }).then(({err, response}) => {
      if (err) return handleCmdError(err);
      let timeData = "";
      processTelnetResponse(response, (line) => { if (line.startsWith("Day")) timeData = line; });
      if (timeData) {
        const embed = {
          color: 0x3498db,
          title: "⏰ Current Game Time",
          description: timeData,
          footer: { text: `Data collected on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}` }
        };
        msg.channel.send({ embeds: [embed] }).catch(() => msg.channel.send(timeData));
      } else {
        msg.channel.send("❌ No time data received.").catch(() => {});
      }
    });
  } catch (_) {}
}

function parsePlayerData(line) {
  try {
    // Parse player data from lines like:
    // "1. id=171, PlayerName, pos=(100.5, 67.0, 200.3), rot=(0.0, 45.0, 0.0), remote=True, health=100, deaths=2, zombies=15, players=0, score=150, level=10, steamid=76561198123456789, ip=192.168.1.100, ping=50"
    
    const nameMatch = line.match(/id=\d+,\s*([^,]+),/);
    const posMatch = line.match(/pos=\(([^)]+)\)/);
    const healthMatch = line.match(/health=(\d+)/);
    const levelMatch = line.match(/level=(\d+)/);
    const zombiesMatch = line.match(/zombies=(\d+)/);
    const deathsMatch = line.match(/deaths=(\d+)/);
    const scoreMatch = line.match(/score=(\d+)/);
    const pingMatch = line.match(/ping=(\d+)/);
    
    if (nameMatch && posMatch) {
      const name = nameMatch[1].trim();
      const posStr = posMatch[1];
      // Distance tracking (planar x,z)
      try {
        const parts = posStr.split(',').map(s=>s.trim());
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);
        if (!isNaN(x) && !isNaN(z)) {
          let travel = d7dtdState.playerTravel[name];
          if (!travel) {
            travel = { lastPos: {x,y,z}, sessionDistance: 0, totalDistance: 0 };
            d7dtdState.playerTravel[name] = travel;
          } else {
            const dx = x - (travel.lastPos.x||x);
            const dz = z - (travel.lastPos.z||z);
            const dist = Math.sqrt(dx*dx + dz*dz);
            // Teleport / large jump filter ( > 800m in one snapshot )
            if (dist > 0.5 && dist < 8000) {
              travel.sessionDistance += dist;
              travel.totalDistance += dist;
              travel.lastPos = {x,y,z};
              scheduleAnalyticsSave(8000);
            } else {
              travel.lastPos = {x,y,z};
            }
          }
        }
      } catch(_) {}
      return {
        name,
        pos: posStr,
        health: healthMatch ? healthMatch[1] : null,
        level: levelMatch ? levelMatch[1] : null,
        zombiesKilled: zombiesMatch ? zombiesMatch[1] : null,
        deaths: deathsMatch ? deathsMatch[1] : null,
        score: scoreMatch ? scoreMatch[1] : null,
        ping: pingMatch ? pingMatch[1] : null
      };
    }
  } catch (error) {
    console.log("Error parsing player data:", error);
  }
  
  return null;
}

function calculateHordeStatus(timeStr) {
  let hordeFreq = 7;
  if (config["horde-frequency"] != null) {
    hordeFreq = parseInt(config["horde-frequency"]);
  }

  const messageValues = timeStr.split(",");
  const day = parseInt(messageValues[0].replace("Day ", ""));
  const hour = parseInt(messageValues[1].split(":")[0]);
  const daysFromHorde = day % hordeFreq;

  const isFirstWeek = day === 1 || day === 2;
  const isHordeHour = (daysFromHorde === 0 && hour >= 22) || (daysFromHorde === 1 && hour < 4);
  const isHordeNow = !isFirstWeek && isHordeHour;

  if (daysFromHorde === 0 && hour < 22) {
    const hoursToHorde = 22 - hour;
    const hourStr = hour === 21 ? "less than an hour" : `${hoursToHorde} hour${hoursToHorde === 1 ? "" : "s"}`;
    return `🩸 Blood Moon Warning\n> Horde begins in ${hourStr}!`;
  } else if (isHordeNow) {
    return `🔴 Blood Moon Active\n> The horde is rampaging! Seek shelter immediately!`;
  } else if (daysFromHorde !== 0) {
    const daysToHorde = parseInt(hordeFreq) - daysFromHorde;
    return `🗓️ Next Blood Moon\n> ${daysToHorde} day${daysToHorde === 1 ? "" : "s"} remaining until the horde arrives`;
  }

  return "";
}

// ---- Discord wiring (minimal to enable hidden command and channel binding) ----
client.on('ready', async () => {
  try {
  log.success('[DISCORD]', `Logged in as ${client.user.tag}`);
  // Bind channel immediately on ready (no text command binding)
  if (config.channel) {
    try {
      const ch = await client.channels.fetch(config.channel.toString());
      if (ch && ch.isText()) {
        channel = ch;
        guild = ch.guild || guild;
        bloodMoon.start();
  log.info('[DISCORD]', `Bound to channel ${ch.id}`);
      }
    } catch (_) { /* ignore */ }
  }
  } catch (_) {}
});

// Handle button interactions from the dashboard UI
client.on('interactionCreate', async (interaction) => {
  try {
    // Player select menu (discord.js v13) detection
    if (typeof interaction.isSelectMenu === 'function' && interaction.isSelectMenu()) {
      if (interaction.customId === 'player_select') {
        log.debug('[UI]', `Select menu chosen values=${JSON.stringify(interaction.values||[])} by ${interaction.user.tag}`);
        const chosen = interaction.values && interaction.values[0];
        try {
          await interaction.deferUpdate();
        } catch(_) {}
        // Re-query live data for freshness
        telnetQueue.exec('lp', { timeout: 7000 }).then(({err, response}) => {
          try {
            const players = [];
            if (!err && response) {
              processTelnetResponse(response, (line) => {
                if (line.includes('id=') && line.includes('pos=')) {
                  const p = parsePlayerData(line);
                  if (p) players.push(p);
                }
              });
            }
            let embed;
            if (!chosen || chosen === '__ALL__') {
              const totalLine = `Total of ${players.length} players online`;
              embed = buildPlayersEmbed(players, totalLine);
            } else {
              const snapshot = players.find(p => p.name.toLowerCase() === chosen.toLowerCase()) || null;
              if (snapshot) ensurePlayerSession(snapshot.name);
              embed = buildSinglePlayerEmbed(chosen, snapshot);
            }
            const nav = createNavigationButtons('dashboard_players');
            const select = createPlayerSelect(players, chosen || '__ALL__');
            const components = [nav];
            if (select) components.push(select);
            interaction.editReply({ embeds: [embed], components }).catch(()=>{});
          } catch(inner) {
            log.warn('[UI]', 'Failed building select update', inner.message||inner);
            interaction.followUp({ content: '❌ Failed to update player view', ephemeral: true }).catch(()=>{});
          }
        });
      }
      return;
    }
    if (interaction.isButton()) {
      handleButtonInteraction(interaction);
      return;
    }
    if (interaction.isCommand && interaction.isCommand()) {
      const name = interaction.commandName;
      if (name === 'dashboard') {
        const embed = createDashboardEmbed();
        const buttons = createDashboardButtons();
        return interaction.reply({ embeds: [embed], components: [buttons] }).catch(console.error);
      }
      if (name === 'activity') {
        return handleActivityFromButton(interaction);
      }
      if (name === 'players') {
        return handlePlayersFromButton(interaction);
      }
      if (name === 'player') {
        // If name option provided, deep dive; else list players
        try {
          const opt = interaction.options.getString('name');
          if (opt) return handlePlayerDeepDive(interaction);
        } catch(_) {}
        return handlePlayersFromButton(interaction);
      }
      if (name === 'time') {
        return handleTimeFromButton(interaction);
      }
      if (name === 'trends') {
        return handleTrendsFromButton({ deferReply: () => interaction.deferReply(), editReply: (p) => interaction.editReply(p), user: interaction.user });
      }
      if (name === 'info') {
        return handleInfoFromButton(interaction);
      }
      if (name === 'update') {
        return handleUpdateFromSlash(interaction);
      }
      if (name === 'bloodmoon') {
        return handleBloodMoonTest(interaction);
      }
    }
  } catch (err) {
    console.error('interaction handling failed:', err.message || err);
  }
});

// Legacy message-based commands removed — use slash commands and dashboard

// Ensure login uses token from config/env earlier
try { client.login(token); } catch (_) {}

// Slash: /update with options { action: check|notes|announce }
async function handleUpdateFromSlash(interaction) {
  try {
    await interaction.deferReply({ ephemeral: false });
    const action = (interaction.options && interaction.options.getString ? (interaction.options.getString('action') || 'check') : 'check').toLowerCase();
    const info = await updates.fetchLatest({ includePrerelease: !!(config.updates && config.updates.prerelease) });
    if (!info) {
      return interaction.editReply('❌ Could not fetch release info.').catch(() => {});
    }
    const upToDate = !updates.isNewer(info.version);
    const embed = buildUpdateEmbed(info, pjson.version, { upToDate });
    if (action === 'check') {
      return interaction.editReply({ embeds: [embed] }).catch(() => {});
    }
    if (action === 'notes') {
      const body = info.body && info.body.trim() ? info.body.slice(0, 3900) : 'No release notes available.';
      const content = `Release notes for ${info.tag}:\n\n${body}\n\n${info.url}`;
      return interaction.editReply({ content }).catch(() => {});
    }
    if (action === 'announce') {
      try { await interaction.editReply({ embeds: [embed] }); } catch (_) {}
      return;
    }
    return interaction.editReply({ embeds: [embed] }).catch(() => {});
  } catch (e) {
    try { await interaction.editReply('❌ Update command failed.'); } catch(_) {}
  }
}

// Slash: /bloodmoon state:(imminent|active|ended) — admin only
async function handleBloodMoonTest(interaction) {
  try {
    const member = interaction.member;
    const perms = member && member.permissions;
    if (!perms || !perms.has || !perms.has('MANAGE_GUILD')) {
      return interaction.reply({ content: '❌ Admin only', ephemeral: true }).catch(() => {});
    }
    const state = interaction.options.getString('state');
    const embed = bloodMoon.makeTestEmbed(state, `Test at ${new Date().toLocaleString('en-US')}`);
    return interaction.reply({ embeds: [embed] }).catch(() => {});
  } catch (_) {
    try { await interaction.reply({ content: '❌ Blood Moon test failed', ephemeral: true }); } catch {}
  }
}

function ensurePlayerSession(name) {
  const now = Date.now();
  let s = d7dtdState.playerSessions[name];
  if (!s) {
    s = { start: now, lastSeen: now };
    d7dtdState.playerSessions[name] = s;
  } else {
    s.lastSeen = now;
  }
  return s;
}

function formatDuration(ms) {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function healthStatus(health) {
  const hp = parseInt(health || '0');
  if (isNaN(hp)) return 'Unknown';
  if (hp >= 80) return 'Excellent';
  if (hp >= 60) return 'Good';
  if (hp >= 40) return 'Wounded';
  if (hp >= 20) return 'Critical';
  return 'Near-Death';
}

function pingQuality(ping) {
  const p = parseInt(ping || '0');
  if (isNaN(p)) return '❓';
  if (p < 60) return '🟢';
  if (p < 120) return '🟡';
  if (p < 200) return '🟠';
  return '🔴';
}

function clusterPlayers(players, threshold = 150) {
  // Simple union-find clustering on x,z distance
  const coords = players.map(p => {
    if (!p.pos) return { x: 0, z: 0 };
    const parts = p.pos.split(',');
    return { x: parseFloat(parts[0]) || 0, z: parseFloat(parts[2]) || 0 };
  });
  const parent = players.map((_, i) => i);
  const find = (i) => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const unite = (a,b) => { a=find(a); b=find(b); if(a!==b) parent[b]=a; };
  for (let i=0;i<players.length;i++) {
    for (let j=i+1;j<players.length;j++) {
      const dx = coords[i].x - coords[j].x;
      const dz = coords[i].z - coords[j].z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist <= threshold) unite(i,j);
    }
  }
  const groups = {};
  players.forEach((_, i) => {
    const r = find(i);
    groups[r] = groups[r] || [];
    groups[r].push(players[i]);
  });
  return Object.values(groups).sort((a,b)=>b.length-a.length);
}

function buildPlayersEmbed(players, totalLine) {
  const now = Date.now();
  if (!players.length) {
    return {
      color: 0x2ecc71,
      title: '👥 Current Players Online',
      description: totalLine || 'No players online',
      footer: { text: `Data collected on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12:false, hour:'2-digit', minute:'2-digit' })}` }
    };
  }
  // Sessions & per-player lines
  const lines = [];
  players.forEach(p => {
    ensurePlayerSession(p.name);
    const sess = d7dtdState.playerSessions[p.name];
    const dur = formatDuration(now - sess.start);
    const k = parseInt(p.zombiesKilled || '0');
    const d = parseInt(p.deaths || '0');
    const kd = d === 0 ? k : (k/d).toFixed(1);
    // Baseline for KPM
    if (!d7dtdState.playerBaselines[p.name]) {
      d7dtdState.playerBaselines[p.name] = { killsAtStart: k, deathsAtStart: d };
    }
    const base = d7dtdState.playerBaselines[p.name];
    const minsPlayed = Math.max(1, Math.floor((now - sess.start)/60000));
    const kpm = ((k - base.killsAtStart)/minsPlayed).toFixed(2);
    const hp = p.health ? `${p.health}%` : '—';
    const hs = healthStatus(p.health);
    const pq = pingQuality(p.ping);
    let loc = getLocationDescription(p.pos);
    if (loc.length > 50) loc = loc.slice(0,47) + '…';
  const streakInfo = d7dtdState.playerStreaks[p.name] || { lastDeathAt: null, longestMinutes: 0 };
  const currentStreakMins = streakInfo.lastDeathAt ? Math.floor((now - streakInfo.lastDeathAt)/60000) : 0;
  const streakDisplay = streakInfo.longestMinutes > 0 ? `🔥 ${Math.max(currentStreakMins,0)}m (PB ${streakInfo.longestMinutes}m)` : `🔥 ${currentStreakMins}m`;
  const travel = d7dtdState.playerTravel[p.name] || { sessionDistance: 0 };
  const distDisplay = travel.sessionDistance ? `📏 ${Math.round(travel.sessionDistance)}m` : '📏 0m';
  lines.push(`**${p.name}** L${p.level||'?'} | ❤️ ${hp} (${hs}) | K/D ${kd} | 🧟 ${k} | ⚔️ ${kpm}kpm | ☠️ ${d} | ${pq} ${p.ping||'?'}ms | ${distDisplay} | ⏱️ ${dur} | ${streakDisplay}\n↳ ${loc}`);
  });
  // MVP (highest kpm)
  let mvp = null; let best = -1;
  players.forEach(p => {
    const k = parseInt(p.zombiesKilled||'0');
    const base = d7dtdState.playerBaselines[p.name] || { killsAtStart: k };
    const sess = d7dtdState.playerSessions[p.name];
    const mins = Math.max(1, Math.floor((now - sess.start)/60000));
    const rate = (k - base.killsAtStart)/mins;
    if (rate > best) { best = rate; mvp = p.name; }
  });
  // Clusters
  const clusters = clusterPlayers(players);
  const largest = clusters[0] || [];
  const isolated = clusters.filter(c=>c.length===1).length;
  const clusterSummary = `Clusters: ${clusters.length} | Largest: ${largest.length} | Isolated: ${isolated}`;
  const mvpLine = mvp ? `🏅 **MVP**: ${mvp} (top kill rate)` : '';
  const description = `${totalLine}\n\n${lines.join('\n\n')}\n\n${clusterSummary}${mvpLine?`\n${mvpLine}`:''}`;
  return {
    color: 0x2ecc71,
    title: '👥 Current Players Online',
    description: description.slice(0, 4000),
    footer: { text: `Data collected on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12:false, hour:'2-digit', minute:'2-digit' })}` }
  };
}

async function handlePlayerDeepDive(interaction) {
  try {
    const target = interaction.options.getString('name');
    if (!target) {
      return interaction.reply({ content: '❌ Provide a player name', ephemeral: true }).catch(()=>{});
    }
    await interaction.deferReply();
    // Query live list players
    telnetQueue.exec('lp', { timeout: 7000 }).then(({err, response}) => {
      if (err) return interaction.editReply('❌ Failed to query server.');
      const players = [];
      processTelnetResponse(response, (line) => {
        if (line.includes('id=') && line.includes('pos=')) {
          const p = parsePlayerData(line);
          if (p) players.push(p);
        }
      });
      const snapshot = players.find(p => p.name.toLowerCase() === target.toLowerCase());
      if (snapshot) {
        ensurePlayerSession(snapshot.name);
      }
      const embed = buildSinglePlayerEmbed(target, snapshot);
      interaction.editReply({ embeds: [embed] }).catch(()=>{});
    });
  } catch (e) {
    try { interaction.editReply('❌ Deep dive failed'); } catch(_) {}
  }
}