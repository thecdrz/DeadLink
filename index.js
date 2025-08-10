const minimist = require("minimist");
const fs = require("fs");
const pjson = require("./package.json");
const Discord = require("discord.js");
const createBloodMoonMonitor = require("./lib/bloodmoon.js");
const UpdatesService = require("./lib/updates.js");
var TelnetClient = require("telnet-client");
const DishordeInitializer = require("./lib/init.js");
const Logger = require("./lib/log.js");

const { Client, Intents } = Discord;
var intents = ["GUILDS", "GUILD_MESSAGES"];

console.log("\x1b[7m# HordeComms v" + pjson.version + " (Based on Dishorde by LakeYS) #\x1b[0m");
console.log("NOTICE: Remote connections to 7 Days to Die servers are not encrypted. To keep your server secure, do not run this application on a public network, such as a public wi-fi hotspot. Be sure to use a unique telnet password.\n");

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
    console.log("Using Discord token from environment variable");
  }
  
  if (process.env.TELNET_PASSWORD) {
    config.password = process.env.TELNET_PASSWORD;
    console.log("Using telnet password from environment variable");
  }
  
  if (process.env.TELNET_IP) {
    config.ip = process.env.TELNET_IP;
    console.log("Using telnet IP from environment variable");
  }
  
  if (process.env.TELNET_PORT) {
    config.port = process.env.TELNET_PORT;
    console.log("Using telnet port from environment variable");
  }
  
  if (process.env.DISCORD_CHANNEL) {
    config.channel = process.env.DISCORD_CHANNEL;
    console.log("Using Discord channel from environment variable");
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
}

// Logging init
if(config["log-console"]) {
  d7dtdState.logger = new Logger();
}

var telnet = config["demo-mode"]?require("./lib/demoServer.js").client:new TelnetClient();

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
  console.warn("\x1b[33mWARNING: No Discord channel specified! You will need to set one with 'setchannel #channelname'\x1b[0m");
  skipChannelCheck = 1;
}
else {
  skipChannelCheck = 0;
}
var channelid = config.channel.toString();

// Prefix
var prefix;
if(typeof config.prefix !== "string") {
  prefix = "7d!";
}
else {
  prefix = config.prefix.toUpperCase();
}

// Load the Discord client
const client = new Client({
  intents: new Intents(intents),
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
      try { telnet.on && telnet.on('close', () => { d7dtdState.connStatus = -1; if (config["log-telnet"]) console.log('[TELNET] Closed'); scheduleReconnect(); }); } catch(_) {}
      try { telnet.on && telnet.on('end', () => { d7dtdState.connStatus = -1; if (config["log-telnet"]) console.log('[TELNET] End'); scheduleReconnect(); }); } catch(_) {}
      try { telnet.on && telnet.on('timeout', () => { d7dtdState.connStatus = -1; if (config["log-telnet"]) console.log('[TELNET] Timeout'); scheduleReconnect(); }); } catch(_) {}
      try { telnet.on && telnet.on('error', (e) => { d7dtdState.connStatus = -1; console.warn('[TELNET] Error:', e && e.message); }); } catch(_) {}
    }
    if (typeof telnet.connect === 'function') {
      telnet.connect(params).then(() => {
        d7dtdState.connStatus = 1;
        if (config["log-telnet"]) console.log('[TELNET] Connected');
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
        console.warn('[TELNET] Connect failed:', e && e.message);
        scheduleReconnect(8000);
      });
    }
  } catch (e) {
    d7dtdState.connStatus = -1;
    console.warn('[TELNET] Unexpected connect error:', e && e.message);
    scheduleReconnect(8000);
  }
}

// Start telnet connection on boot
startTelnet();

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

// 7d!exec command
if(config["allow-exec-command"] === true) {
  console.warn("\x1b[33mWARNING: Config option 'allow-exec-command' is enabled. This may pose a security risk for your server.\x1b[0m");
}

////// # Init/Version Check # //////
const configPrivate = {
  githubAuthor: "thecdrz",
  githubName: "HordeComms",
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
    // Private-only: do not post publicly unless notifyMode configured
    if (config.updates.notifyMode === 'channel' && config.updates.notifyChannel && channel && channel.id === config.updates.notifyChannel) {
  const embed = buildUpdateEmbed(info, pjson.version);
  channel.send({ embeds: [embed] }).catch(() => {});
    }
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

  if((!config["disable-chatmsgs"] && data.type === "Chat") || (!config["disable-gmsgs"] && data.type === "GMSG")) {
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
  if(err) {
    if(err.message === "response not received") {
      channel.send("Command failed because the server is not responding. It may be frozen or loading.");
    }
    else if(err.message === "socket not writable") {
      channel.send("Command failed because the bot is not connected to the server. Type 7d!info to see the current status.");
    }
    else {
      channel.send(`Command failed with error "${err.message}"`);
    }
  }
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

// Analytics persistence functions
function saveAnalyticsData() {
  try {
    const analyticsData = {
      playerTrends: d7dtdState.playerTrends,
      lastSaved: Date.now()
    };
    fs.writeFileSync('./analytics.json', JSON.stringify(analyticsData, null, 2), 'utf8');
  } catch (error) {
    console.warn('Warning: Failed to save analytics data:', error.message);
  }
}

function loadAnalyticsData() {
  try {
    if (fs.existsSync('./analytics.json')) {
      const data = fs.readFileSync('./analytics.json', 'utf8');
      const analyticsData = JSON.parse(data);
      
      // Restore player trends data
      if (analyticsData.playerTrends) {
        d7dtdState.playerTrends = analyticsData.playerTrends;
        console.log(`Analytics data loaded: ${d7dtdState.playerTrends.history.length} data points restored`);
      }
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
  if (!channel) {
    console.log('Channel not ready for version announcement');
    return;
  }
  
  const releaseNotes = {
    "2.4.0": {
      title: "🎉 HordeComms v2.4.0 Released!",
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
      title: `🚀 HordeComms v${version} Released!`,
      description: "The bot has been updated with new features and improvements!",
      footer: {
        text: `HordeComms v${version} • Original: LakeYS • Expanded: CDRZ`,
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
        value: "`7d!info` - View all features and changelog\n`7d!dashboard` - Interactive control panel",
        inline: false
      }
    ],
    footer: {
      text: `HordeComms v${version} • Original: LakeYS • Expanded: CDRZ`,
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
  
  console.log(`[TRENDS] Tracked ${playerCount} players at ${new Date().toLocaleTimeString()}`);
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
  const trendsReport = generateTrendsReport();
  
  // Create enhanced embed for trends
  const embed = {
    color: 0x3498db, // Blue color
    title: "📊 Server Analytics Dashboard",
    description: trendsReport,
    footer: {
      text: `Report generated on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}`,
    }
  };
  
  msg.channel.send({ embeds: [embed] })
    .catch(() => {
      // Fallback to plain text if embed fails
      msg.channel.send(trendsReport);
    });
}

function generateChangesReport() {
  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const v = pjson.version;

  return (
    `**ℹ️ HordeComms v${v}** *(${currentDate})*\n` +
    `Built on Dishorde by LakeYS • CDRZ enhancements\n\n` +

    `**🆕 New in v2.8.0**\n` +
    `🩸 **Blood Moon Monitor** — Imminent/Start/End alerts with rich embeds\n` +
    `🧪 **Admin Test** — \`7d!bloodmoon test imminent|start|end\` (optional in-game broadcast)\n` +
    `🔌 **Telnet Robustness** — Auto-reconnect, per-command timeouts, safe handling of prompt-less servers\n` +
    `�️ **Security/Config** — Prefer environment variables for secrets\n\n` +

    `**🛠️ Admin Utilities (private)**\n` +
    `🔎 \`7d!update check\` — Check latest release\n` +
    `� \`7d!update notes\` — View release notes\n` +
    `⬇️ \`7d!update guide [windows|linux]\` — Step-by-step upgrade\n` +
    `📣 \`7d!update announce\` — Post the update embed on demand\n\n` +

    `**🎮 Core Commands**\n` +
    `🎮 \`7d!dashboard\` — Interactive control panel\n` +
    `📊 \`7d!trends\` — Player count analytics & trends\n` +
    `🎯 \`7d!activity\` — Narrative activity with survival tips\n` +
    `� \`7d!players\` — Who’s online\n` +
    `⏰ \`7d!time\` — Current game time & horde context\n` +
    `ℹ️ \`7d!info\` — This overview\n\n` +

    `**🤖 Intelligent Features**\n` +
    `🧠 Context-aware survival guidance\n` +
    `� Location intelligence & player status parsing\n` +
    `� Trend visualization and session insights\n\n` +

    `**⚙️ Reliability & Security**\n` +
    `� Telnet connect/reconnect lifecycle with basic auth\n` +
    `⏱️ Per-command timeouts; soft-success when servers don’t echo\n` +
    `🔒 Secrets via environment variables; single-instance protection\n\n` +

    `**🧩 Optional Config Snippets**\n` +
    `bloodMoon: { enabled, intervalSeconds, frequency, broadcastInGame }\n` +
    `updates: { enabled, intervalHours, prerelease, notifyMode, notifyChannel }`
  );
}

function createDashboardEmbed() {
  const statusEmoji = d7dtdState.connStatus === 1 ? "🟢" : d7dtdState.connStatus === 0 ? "🟡" : "🔴";
  const statusText = d7dtdState.connStatus === 1 ? "Online" : d7dtdState.connStatus === 0 ? "Connecting..." : "Error";
  
  return {
    color: 0x7289da, // Discord blurple
    title: "🎮 7 Days to Die Server Dashboard",
    description: `${statusEmoji} **Server Status**: ${statusText}\n\n` +
                 `Welcome to the interactive server control panel! Use the buttons below to quickly access server information and analytics.\n\n` +
                 `🎯 **Activity** - Get detailed player activity reports\n` +
                 `📊 **Trends** - View player count analytics and trends\n` +
                 `👥 **Players** - See current online players\n` +
                 `⏰ **Time** - Check current game time\n` +
                 `ℹ️ **Info** - Server version and details`,
    footer: {
      text: `HordeComms v${pjson.version} • Original: LakeYS • Expanded: CDRZ`,
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

  telnet.exec("lp", { timeout: 7000 }, (err, response) => {
      if (!err) {
        processTelnetResponse(response, (line) => {
          if (line.includes("id=") && line.includes("pos=")) {
            const playerData = parsePlayerData(line);
            if (playerData) {
              d7dtdState.activityData.players.push(playerData);
            }
          }
        });

  telnet.exec("gettime", { timeout: 5000 }, (timeErr, timeResponse) => {
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
  telnet.exec("lp", { timeout: 7000 }, (err, response) => {
      if (!err) {
        let playerData = "";
        processTelnetResponse(response, (line) => {
          if (line.startsWith("Total of ")) {
            playerData = line;
            
            const match = line.match(/Total of (\d+) players/);
            if (match) {
              const playerCount = parseInt(match[1]);
              trackPlayerCount(playerCount);
            }
          }
        });
        
        if (playerData) {
          const embed = {
            color: 0x2ecc71,
            title: "👥 Online Players",
            description: playerData,
            footer: {
              text: `Data collected on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}`,
            }
          };
          
          const navigationButtons = createNavigationButtons('dashboard_players');
          interaction.editReply({ 
            embeds: [embed],
            components: [navigationButtons]
          }).catch(console.error);
        } else {
          interaction.editReply("❌ No player data received.").catch(console.error);
        }
      } else {
        interaction.editReply("❌ Failed to get player list.").catch(console.error);
      }
    });
  }).catch(console.error);
}

function handleTimeFromButton(interaction) {
  interaction.deferReply().then(() => {
  telnet.exec("gettime", { timeout: 5000 }, (err, response) => {
      if (!err) {
        let timeData = "";
        processTelnetResponse(response, (line) => {
          if (line.startsWith("Day")) {
            timeData = line;
          }
        });
        
        if (timeData) {
          const embed = {
            color: 0x3498db,
            title: "⏰ Current Game Time",
            description: timeData,
            footer: {
              text: `Data collected on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}`,
            }
          };
          
          const navigationButtons = createNavigationButtons('dashboard_time');
          interaction.editReply({ 
            embeds: [embed],
            components: [navigationButtons]
          }).catch(console.error);
        } else {
          interaction.editReply("❌ No time data received.").catch(console.error);
        }
      } else {
        interaction.editReply("❌ Failed to get server time.").catch(console.error);
      }
    });
  }).catch(console.error);
}

function handleInfoFromButton(interaction) {
  interaction.deferReply().then(async () => {
    const statusMsg = d7dtdState.connStatus === 1 ? ":green_circle: Online" : 
                     d7dtdState.connStatus === 0 ? ":white_circle: Connecting..." : 
                     ":red_circle: Error";
    
    // Use the comprehensive changes content for info (same as main info command)
    const changesReport = generateChangesReport();
    let latestLine = '';
    try {
      const info = await updates.fetchLatest({ includePrerelease: !!(config.updates && config.updates.prerelease) });
      if (info && info.tag && info.url) {
        latestLine = `\n\n**Updates**\nLatest release: ${info.tag} • ${info.url}`;
      }
    } catch (_) { /* ignore fetch errors */ }
    const infoContent = `Server connection: ${statusMsg}\n\n${changesReport}${latestLine}`;
    
    const embed = {
      color: 0x7289da, // Discord blurple for info
      title: "🎮 HordeComms Information & Features",
      description: infoContent,
      footer: {
        text: `HordeComms v${pjson.version} • Original: LakeYS • Expanded: CDRZ`,
      }
    };
    
    const navigationButtons = createNavigationButtons('dashboard_info');
    interaction.editReply({ 
      embeds: [embed],
      components: [navigationButtons]
    }).catch(console.error);
  }).catch(console.error);
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
  telnet.exec("lp", { timeout: 7000 }, (err, response) => {
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
  telnet.exec("gettime", { timeout: 5000 }, (timeErr, timeResponse) => {
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
      return {
        name: nameMatch[1].trim(),
        pos: posMatch[1],
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
    console.log(`Discord logged in as ${client.user.tag}`);
  } catch (_) {}
});

client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.bot) return;
    // Bind channel by ID if configured and not yet bound
    if (!channel && config.channel) {
      try {
        const ch = await msg.client.channels.fetch(config.channel.toString());
        if (ch && ch.isText()) {
          channel = ch;
          guild = msg.guild || guild;
          // Start Blood Moon monitor when channel is available
          bloodMoon.start();
        }
      } catch (_) {}
    }

    const content = msg.content || '';
    const p = (config.prefix ? config.prefix : '7d!');
    if (!content.startsWith(p)) return;
    const args = content.slice(p.length).trim().split(/\s+/);
    const cmd = (args.shift() || '').toLowerCase();

    // Hidden admin command: 7d!bloodmoon test <imminent|start|end>
    if (cmd === 'bloodmoon' && args[0] === 'test') {
      // Restrict: require MANAGE_GUILD permission
      if (!msg.member || !msg.member.permissions || !msg.member.permissions.has('MANAGE_GUILD')) {
        return; // silent
      }
      const kindMap = { imminent: 'imminent', start: 'active', end: 'ended' };
      const kind = kindMap[(args[1] || '').toLowerCase()];
      if (!kind) return;
      const embed = bloodMoon.makeTestEmbed(kind, 'Admin test');
      if (embed) {
        msg.channel.send({ embeds: [embed] }).catch(() => {});
      }
      // Also broadcast in-game if enabled (attempt telnet connect on-demand)
      try {
        const bmCfg = (config.bloodMoon || {});
        const broadcastInGame = bmCfg.broadcastInGame !== false;
        if (broadcastInGame) {
          const textMap = {
            imminent: 'Blood Moon imminent! Horde begins in less than an hour.',
            active: 'The Blood Moon is active! Seek shelter immediately!',
            ended: 'The Blood Moon has ended. Regroup and rebuild.'
          };
          const msgText = textMap[kind];
          if (msgText) {
            const ready = await ensureTelnetReady(8000);
            if (!ready && !(config["demo-mode"])) {
              msg.reply('In-game broadcast skipped: telnet not connected.').catch(() => {});
              return;
            }
            const cleaned = msgText.replace(/\"/g, '');
            telnet.exec(`say "${cleaned}"`, { timeout: 5000 }, (err, resp) => {
              if (err && err.message !== 'response not received') {
                msg.reply(`In-game broadcast failed: ${err.message || 'unknown error'}`).catch(() => {});
              } else {
                msg.reply('In-game broadcast sent.').catch(() => {});
              }
            });
          }
        }
      } catch (_) { /* ignore */ }
      return;
    }

    // Admin-only update helpers (private)
    if (cmd === 'update') {
      if (!msg.member || !msg.member.permissions || !msg.member.permissions.has('MANAGE_GUILD')) {
        return; // silent for non-admins
      }
      const sub = (args.shift() || '').toLowerCase();
      if (sub === 'check') {
        try {
          const info = await updates.fetchLatest({ includePrerelease: !!(config.updates && config.updates.prerelease) });
          if (!info) return msg.reply('No release info.').catch(() => {});
          const newer = updates.isNewer(info.version);
          return msg.reply(newer ? `New version available: v${info.version}\n${info.url}` : `You are on the latest: v${pjson.version}`).catch(() => {});
        } catch (e) {
          return msg.reply('Update check failed.').catch(() => {});
        }
      }
      if (sub === 'notes') {
        try {
          const info = await updates.fetchLatest({ includePrerelease: !!(config.updates && config.updates.prerelease) });
          if (!info) return msg.reply('No release info.').catch(() => {});
          const body = (info.body || '').slice(0, 1500) || '(no notes)';
          return msg.reply(`Latest: ${info.name}\n${info.url}\n\n${body}`).catch(() => {});
        } catch (_) { return msg.reply('Could not fetch notes.').catch(() => {}); }
      }
      if (sub === 'announce') {
        try {
          const info = await updates.fetchLatest({ includePrerelease: !!(config.updates && config.updates.prerelease) });
          if (!info) return msg.reply('No release info.').catch(() => {});
          const upToDate = !updates.isNewer(info.version);
          const embed = buildUpdateEmbed(info, pjson.version, { upToDate });
          return msg.channel.send({ embeds: [embed] }).catch(() => {});
        } catch (_) { return msg.reply('Announce failed.').catch(() => {}); }
      }
      if (sub === 'guide') {
        const osArg = (args.shift() || '').toLowerCase();
        const os = osArg.includes('lin') ? 'linux' : 'windows';
        try {
          const info = await updates.fetchLatest({ includePrerelease: !!(config.updates && config.updates.prerelease) });
          const tag = info && info.tag ? info.tag : ('v' + pjson.version);
          const guide = updates.getGuide(os, tag);
          return msg.reply(`Upgrade guide (${os}) for ${tag}:\n\n${guide}`).catch(() => {});
        } catch (_) {
          const guide = updates.getGuide(os, 'v' + pjson.version);
          return msg.reply(`Upgrade guide (${os}):\n\n${guide}`).catch(() => {});
        }
      }
  return msg.reply('Usage: 7d!update check|notes|guide [windows|linux]|announce').catch(() => {});
    }
  } catch (err) {
    // ignore
  }
});

// Ensure login uses token from config/env earlier
try { client.login(token); } catch (_) {}