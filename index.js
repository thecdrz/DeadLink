const minimist = require("minimist");
const fs = require("fs");
const pjson = require("./package.json");
const Discord = require("discord.js");
var TelnetClient = require("telnet-client");
const DishordeInitializer = require("./lib/init.js");
const Logger = require("./lib/log.js");

const { Client, Intents } = Discord;
var intents = ["GUILDS", "GUILD_MESSAGES"];

console.log("\x1b[7m# HordeComms v" + pjson.version + " (Based on Dishorde by LakeYS) #\x1b[0m");
console.log("NOTICE: Remote connections to 7 Days to Die servers are not encrypted. To keep your server secure, do not run this application on a public network, such as a public wi-fi hotspot. Be sure to use a unique telnet password.\n");

const lineSplit = /\n|\r/g;

var channel = void 0;

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
    telnet.exec("say \"" + msg + "\"", (err, response) => {
      if(err) {
        console.log("Error while attempting to send message: " + err.message);
      }
      else {
        var lines = response.split(lineSplit);
        for(var i = 0; i <= lines.length-1; i++) {
          var lineResponse = lines[i];
          handleMsgFromGame(lineResponse);
        }
      }
    });
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
    const weather = getCurrentWeather(time);
    
    const emptyMessages = [
      `${weather.icon} Empty wasteland during the ${timeOfDay} with ${weather.description}\n> Even the zombies seem to have taken shelter from the ${weather.description}... or are they planning something?`,
      `👻 Eerie silence during the ${timeOfDay} ${weather.narrative}\n> The absence of survivors becomes more ominous when combined with ${weather.description}.`,
      `🏜️ No survivors active during the ${timeOfDay}\n> Perhaps they're wisely avoiding the ${weather.description}, or perhaps the weather has driven something else to hunt.`,
      `🌌 World lies dormant during the ${timeOfDay}\n> The ${weather.description} adds an extra layer of danger for any survivor brave enough to venture out.`
    ];
    
    activityMsg = getRandomElement(emptyMessages);
    if (hordeInfo) {
      activityMsg += `\n\n${hordeInfo}`;
    }
  } else if (players.length === 1) {
    const player = players[0];
    const timeOfDay = time ? getTimeOfDay(time) : "unknown time";
    const healthCondition = getHealthCondition(player.health);
    
    // 🌦️ Get current weather conditions
    const weather = getCurrentWeather(time);
    
    // 🗺️ Enhanced location with biome and POI detection
    let locationContext = "";
    let locationDisplay = "unknown location";
    if (player.pos) {
      const coords = player.pos.split(',');
      const x = parseInt(coords[0]);
      const z = parseInt(coords[2]);
      
      // Check for POI first
      const nearbyPOI = identifyPOI(x, z);
      if (nearbyPOI) {
        locationContext = getPOINarrative(nearbyPOI, weather);
        locationDisplay = `${nearbyPOI.name} (${nearbyPOI.type.charAt(0).toUpperCase() + nearbyPOI.type.slice(1)})`;
      } else {
        locationContext = getBiomeSpecificNarrative(x, z, weather);
        const biomeData = getBiomeData(x, z);
        locationDisplay = biomeData.name;
      }
    } else {
      locationContext = `surviving somewhere in the wasteland ${weather.narrative}`;
      locationDisplay = "Unknown Wasteland";
    }
    
    const activity = getSoloActivity(player, timeOfDay);
    const suggestions = getSurvivalSuggestions(player, time, hordeInfo);
    
    // Build player stats
    let playerStats = "";
    if (player.health) playerStats += `❤️ ${player.health}% HP`;
    if (player.level) playerStats += ` | 📊 Level ${player.level}`;
    if (player.zombiesKilled) playerStats += ` | 🧟 ${player.zombiesKilled} kills`;
    
    activityMsg = `**Solo Survivor Report**\n\n`;
    activityMsg += `**${player.name}** — ${playerStats ? `${playerStats}` : ""}\n`;
    activityMsg += `🌍 *${locationDisplay}*\n`;
    activityMsg += `${weather.icon} *${weather.description}* | 🕒 ${time || "Unknown"}\n\n`;
    activityMsg += `"*${healthCondition} and ${activity} while ${locationContext}.*"\n\n`;
    
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

// 🌦️ Weather Integration System
function getCurrentWeather(time) {
  if (!time) return getRandomWeather();
  
  const hour = parseInt(time.split(',')[1]?.split(':')[0] || 12);
  const day = parseInt(time.split(',')[0]?.replace('Day ', '') || 1);
  
  // Simulate weather patterns based on time and seed
  const weatherSeed = (day + hour) % 24;
  
  const weatherPatterns = [
    { type: "clear", icon: "☀️", description: "clear skies", danger: "low", narrative: "under brilliant sunshine" },
    { type: "cloudy", icon: "☁️", description: "overcast skies", danger: "low", narrative: "beneath heavy cloud cover" },
    { type: "rain", icon: "🌧️", description: "steady rainfall", danger: "medium", narrative: "through driving rain" },
    { type: "storm", icon: "⛈️", description: "thunderstorm", danger: "high", narrative: "amid a raging thunderstorm" },
    { type: "fog", icon: "🌫️", description: "thick fog", danger: "high", narrative: "through vision-obscuring fog" },
    { type: "hot", icon: "🔥", description: "scorching heat", danger: "medium", narrative: "under the blazing desert sun" },
    { type: "cold", icon: "❄️", description: "bitter cold", danger: "medium", narrative: "in bone-chilling cold" },
    { type: "sandstorm", icon: "🌪️", description: "sandstorm", danger: "extreme", narrative: "fighting through a blinding sandstorm" }
  ];
  
  return weatherPatterns[weatherSeed % weatherPatterns.length];
}

function getRandomWeather() {
  const commonWeather = [
    { type: "clear", icon: "☀️", description: "clear skies", danger: "low", narrative: "under clear skies" },
    { type: "cloudy", icon: "☁️", description: "overcast conditions", danger: "low", narrative: "beneath cloudy skies" },
    { type: "rain", icon: "🌧️", description: "light rain", danger: "medium", narrative: "through gentle rainfall" }
  ];
  return getRandomElement(commonWeather);
}

// 🗺️ Enhanced Biome-Specific Stories  
function getBiomeSpecificNarrative(x, z, weather) {
  const biomeData = getBiomeData(x, z);
  const weatherContext = weather ? ` ${weather.narrative}` : "";
  
  const biomeStories = {
    desert: [
      `braving the scorching desert wastes${weatherContext}`,
      `navigating the sun-bleached dunes${weatherContext}`,
      `surviving the harsh desert landscape${weatherContext}`,
      `enduring the merciless desert heat${weatherContext}`
    ],
    snow: [
      `traversing the frozen tundra${weatherContext}`,
      `surviving the icy northern wastes${weatherContext}`,
      `battling through snow-covered terrain${weatherContext}`,
      `enduring the bitter cold wilderness${weatherContext}`
    ],
    forest: [
      `moving through dense woodland${weatherContext}`,
      `navigating the shadowy forest paths${weatherContext}`,
      `surviving among the towering pines${weatherContext}`,
      `threading through the dangerous woods${weatherContext}`
    ],
    burned: [
      `crossing the fire-ravaged wasteland${weatherContext}`,
      `navigating the ash-covered ruins${weatherContext}`,
      `surviving the scorched eastern territories${weatherContext}`,
      `traversing the burned-out landscape${weatherContext}`
    ],
    plains: [
      `moving across the open grasslands${weatherContext}`,
      `traversing the exposed plains${weatherContext}`,
      `surviving the windswept prairies${weatherContext}`,
      `crossing the dangerous open ground${weatherContext}`
    ]
  };
  
  return getRandomElement(biomeStories[biomeData.type] || biomeStories.plains);
}

function getBiomeData(x, z) {
  const absX = Math.abs(x);
  const absZ = Math.abs(z);
  
  if (absX > absZ) {
    if (x > 0) return { type: "burned", name: "Burned Forest", dangers: ["radiation", "ash storms", "mutated zombies"] };
    else return { type: "snow", name: "Snow Biome", dangers: ["freezing", "hypothermia", "ice zombies"] };
  } else {
    if (z > 0) return { type: "forest", name: "Forest", dangers: ["wild animals", "thick vegetation", "hidden zombies"] };
    else return { type: "desert", name: "Desert", dangers: ["dehydration", "heat stroke", "sand zombies"] };
  }
}

// 🏭 POI Recognition System
function identifyPOI(x, z) {
  // Common 7DTD POI patterns based on coordinates
  const pois = [
    { name: "Shotgun Messiah Factory", coords: [0, 0], radius: 50, type: "industrial", danger: "extreme" },
    { name: "Crackabook Factory", coords: [200, 200], radius: 40, type: "industrial", danger: "high" },
    { name: "Hospital", coords: [-200, 100], radius: 30, type: "medical", danger: "extreme" },
    { name: "Police Station", coords: [100, -150], radius: 25, type: "military", danger: "high" },
    { name: "Trader Joe's", coords: [0, 250], radius: 20, type: "trader", danger: "safe" },
    { name: "Pharmacy", coords: [-100, -100], radius: 15, type: "medical", danger: "medium" },
    { name: "Gun Shop", coords: [150, 50], radius: 20, type: "military", danger: "medium" },
    { name: "Grocery Store", coords: [-50, 200], radius: 25, type: "supply", danger: "medium" }
  ];
  
  for (const poi of pois) {
    const distance = Math.sqrt(Math.pow(x - poi.coords[0], 2) + Math.pow(z - poi.coords[1], 2));
    if (distance <= poi.radius) {
      return poi;
    }
  }
  
  return null;
}

function getPOINarrative(poi, weather) {
  if (!poi) return null;
  
  const weatherContext = weather && weather.danger !== "low" ? ` during ${weather.description}` : "";
  
  const narratives = {
    industrial: [
      `exploring the dangerous ${poi.name}${weatherContext}`,
      `scavenging through the ${poi.name} complex${weatherContext}`,
      `risking the industrial zones of ${poi.name}${weatherContext}`
    ],
    medical: [
      `searching the zombie-infested ${poi.name}${weatherContext}`,
      `raiding the dangerous ${poi.name} for supplies${weatherContext}`,
      `braving the overrun ${poi.name}${weatherContext}`
    ],
    military: [
      `infiltrating the fortified ${poi.name}${weatherContext}`,
      `assaulting the well-defended ${poi.name}${weatherContext}`,
      `attempting to breach ${poi.name}${weatherContext}`
    ],
    trader: [
      `seeking refuge at ${poi.name}${weatherContext}`,
      `trading safely at ${poi.name}${weatherContext}`,
      `resupplying at the protected ${poi.name}${weatherContext}`
    ],
    supply: [
      `looting the abandoned ${poi.name}${weatherContext}`,
      `scavenging through ${poi.name}${weatherContext}`,
      `searching for supplies at ${poi.name}${weatherContext}`
    ]
  };
  
  return getRandomElement(narratives[poi.type] || narratives.supply);
}

// ⏰ Enhanced Blood Moon Prediction System
function getAdvancedHordeInfo(timeStr) {
  if (!timeStr) return null;
  
  let hordeFreq = 7;
  if (config["horde-frequency"] != null) {
    hordeFreq = parseInt(config["horde-frequency"]);
  }

  const messageValues = timeStr.split(",");
  const day = parseInt(messageValues[0].replace("Day ", ""));
  const hour = parseInt(messageValues[1].split(":")[0]);
  const minute = parseInt(messageValues[1].split(":")[1]);
  const daysFromHorde = day % hordeFreq;

  const isFirstWeek = day === 1 || day === 2;
  const isHordeDay = daysFromHorde === 0;
  const hordeStartHour = 22;
  const hordeEndHour = 4;
  
  const totalMinutesToHorde = isHordeDay ? 
    (hordeStartHour - hour) * 60 - minute : 
    ((hordeFreq - daysFromHorde) * 24 - hour) * 60 - minute;

  // Enhanced predictions with specific timing
  if (isHordeDay && hour < hordeStartHour) {
    const hoursToHorde = hordeStartHour - hour;
    const minutesToHorde = 60 - minute;
    
    if (hoursToHorde === 1 && minutesToHorde <= 60) {
      return {
        type: "imminent",
        icon: "🚨",
        title: "BLOOD MOON IMMINENT",
        message: `Blood moon begins in ${minutesToHorde} minutes - FINAL PREPARATIONS NOW!`,
        urgency: "critical"
      };
    } else if (hoursToHorde <= 3) {
      return {
        type: "warning",
        icon: "🩸",
        title: "Blood Moon Approaching",
        message: `Blood moon begins in ${hoursToHorde} hour${hoursToHorde === 1 ? '' : 's'} - fortify and stockpile!`,
        urgency: "high"
      };
    } else {
      return {
        type: "preparation",
        icon: "⚠️",
        title: "Blood Moon Today",
        message: `Blood moon tonight at ${hordeStartHour}:00 - prepare defenses and ammunition`,
        urgency: "medium"
      };
    }
  } else if (!isFirstWeek && isHordeDay && hour >= hordeStartHour) {
    return {
      type: "active",
      icon: "💀",
      title: "BLOOD MOON ACTIVE",
      message: "The horde is rampaging! Maximum zombie aggression in effect!",
      urgency: "extreme"
    };
  } else if (!isFirstWeek && daysFromHorde === 1 && hour < hordeEndHour) {
    return {
      type: "active",
      icon: "💀", 
      title: "BLOOD MOON ACTIVE",
      message: "The horde continues! Zombies remain highly aggressive!",
      urgency: "extreme"
    };
  } else {
    const daysToHorde = hordeFreq - daysFromHorde;
    return {
      type: "countdown",
      icon: "🗓️",
      title: "Next Blood Moon",
      message: `${daysToHorde} day${daysToHorde === 1 ? '' : 's'} until the next horde arrives`,
      urgency: "low"
    };
  }
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
    "2.6.0": {
      title: "🌍 HordeComms v2.6.0 - Environmental Intelligence System!",
      description: "Revolutionary update bringing complete world-aware storytelling to 7 Days to Die monitoring",
      features: [
        "🌦️ **Weather Integration** - Dynamic weather system with 8 weather types affecting all narratives",
        "🗺️ **Biome-Specific Stories** - Desert survival vs Forest dangers vs Snow biome challenges",
        "🏭 **POI Recognition** - Smart landmark detection (Shotgun Messiah Factory, Hospital, etc.)",
        "⏰ **Enhanced Blood Moon Predictions** - Multi-tier alert system with precise timing",
        "🌟 **Immersive Combinations** - Weather + biome + POI create unique environmental storytelling",
        "🎮 **World-Aware Narratives** - Every report includes rich atmospheric context"
      ],
      color: 0x00d4aa // Teal for environmental theme
    },
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
  
  // Generate visual chart
  const chartData = history.slice(-12); // Last 12 data points (2 hours)
  const chart = generateMiniChart(chartData.map(d => d.count));
  
  // Build report
  let report = ``;
  
  // Current status with trend indicator
  const trendEmoji = recentTrend > 0 ? "📈" : recentTrend < 0 ? "📉" : "➡️";
  report += `${trendEmoji} **Current**: ${currentCount} player${currentCount === 1 ? '' : 's'}\n`;
  report += `📋 **24h Average**: ${avgCount} players\n`;
  report += `🔝 **Peak**: ${maxCount} players | 🔽 **Low**: ${minCount} players\n\n`;
  
  // Visual chart with current status
  const maxInChart = Math.max(...chartData.map(d => d.count));
  const trendIcon = recentTrend > 0 ? "📈" : recentTrend < 0 ? "📉" : "➡️";
  const trendText = recentTrend > 0 ? "Growing" : recentTrend < 0 ? "Declining" : "Steady";
  report += `📈 **Activity Chart** (last 2 hours, 10-min intervals)\n\`\`\`\n${chart} (${currentCount}/${maxInChart > 0 ? maxInChart : currentCount}) ${trendIcon} ${trendText}\n\`\`\`\n`;
  
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
  
  return `**🆕 Latest Features & Updates** *(${currentDate})*\n` +
         `� **Environmental Intelligence System v2.6.0** - Complete world-aware storytelling\n` +
         `🌦️ **Weather Integration** - Dynamic weather conditions affect all narratives\n` +
         `🗺️ **Biome-Specific Stories** - Desert, forest, and snow environment storytelling\n` +
         `� **POI Recognition** - Smart landmark detection and location-specific narratives\n` +
         `⏰ **Enhanced Blood Moon Predictions** - Multi-tier horde warning system\n\n` +
         
         `**⚡ Enhanced Commands**\n` +
         `🎯 \`7d!activity\` - Environmental narratives with weather, biome, and POI context\n` +
         `📊 \`7d!trends\` - Player analytics with environmental trend visualization\n` +
         `🎮 \`7d!dashboard\` - Interactive control panel with environmental insights\n` +
         `ℹ️ \`7d!info\` - Complete feature overview and server information\n\n` +
         
         `**🌟 Environmental Intelligence Features**\n` +
         `🌦️ **Weather System** - 8 dynamic weather types from clear skies to sandstorms\n` +
         `🗺️ **Biome Detection** - Coordinate-based environment recognition\n` +
         `�️ **POI Awareness** - Shotgun Messiah Factory, Hospital landmark detection\n` +
         `📍 **Location Context** - Area-specific survival recommendations\n` +
         `🩸 **Advanced Horde Warnings** - Precise timing with environmental context\n\n` +
         
         `**🎨 Immersive Storytelling**\n` +
         `� **Dynamic Narratives** - Every message includes rich environmental context\n` +
         `� **Atmospheric Descriptions** - Weather and biome-specific storytelling\n` +
         `🏞️ **World-Aware Content** - Stories that respond to player locations\n` +
         `⚡ **Real-time Context** - Environmental conditions update dynamically\n\n` +
         
         `**🔧 Technical Excellence**\n` +
         `🔒 **Security Hardened** - Environment variables and credential protection\n` +
         `⚡ **Performance Optimized** - Efficient environmental data processing\n` +
         `🌐 **Cross-Platform** - Works seamlessly across all Discord platforms\n` +
         `🔄 **Real-time Intelligence** - Live environmental analysis and storytelling`;
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

    telnet.exec("lp", (err, response) => {
      if (!err) {
        processTelnetResponse(response, (line) => {
          if (line.includes("id=") && line.includes("pos=")) {
            const playerData = parsePlayerData(line);
            if (playerData) {
              d7dtdState.activityData.players.push(playerData);
            }
          }
        });

        telnet.exec("gettime", (timeErr, timeResponse) => {
          if (!timeErr) {
            processTelnetResponse(timeResponse, (timeLine) => {
              if (timeLine.startsWith("Day")) {
                d7dtdState.activityData.time = timeLine;
                const hordeInfo = getAdvancedHordeInfo(timeLine);
                d7dtdState.activityData.hordeTime = hordeInfo ? 
                  `${hordeInfo.icon} **${hordeInfo.title}**: ${hordeInfo.message}` : null;
                
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
    telnet.exec("lp", (err, response) => {
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
    telnet.exec("gettime", (err, response) => {
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
  interaction.deferReply().then(() => {
    const statusMsg = d7dtdState.connStatus === 1 ? ":green_circle: Online" : 
                     d7dtdState.connStatus === 0 ? ":white_circle: Connecting..." : 
                     ":red_circle: Error";
    
    // Use the comprehensive changes content for info (same as main info command)
    const changesReport = generateChangesReport();
    const infoContent = `Server connection: ${statusMsg}\n\n${changesReport}`;
    
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
  telnet.exec("lp", (err, response) => {
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
      telnet.exec("gettime", (timeErr, timeResponse) => {
        if (!timeErr) {
          processTelnetResponse(timeResponse, (timeLine) => {
            if (timeLine.startsWith("Day")) {
              d7dtdState.activityData.time = timeLine;
              
              // Calculate enhanced horde information
              const hordeInfo = getAdvancedHordeInfo(timeLine);
              d7dtdState.activityData.hordeTime = hordeInfo ? 
                `${hordeInfo.icon} **${hordeInfo.title}**: ${hordeInfo.message}` : null;
              
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
    
    if (nameMatch && posMatch) {
      return {
        name: nameMatch[1].trim(),
        pos: posMatch[1],
        health: healthMatch ? healthMatch[1] : null,
        level: levelMatch ? levelMatch[1] : null,
        zombiesKilled: zombiesMatch ? zombiesMatch[1] : null
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

////// # Discord # //////

// updateStatus
// NOTE: This function will 'cache' the current status to avoid re-sending it.
// If you want to forcibly re-send the same status to Discord, set 'd7dtdState.connStatus' to -100 first.
function updateStatus(status) {
  if(!config["disable-status-updates"]) {
    if(status === 0 && d7dtdState.connStatus !== 0) {
      client.user.setPresence({ 
        activities: [{ name: `Connecting... | Type ${prefix}info` }],
        status: "dnd"
      });
    } else if(status === -1 && d7dtdState.connStatus !== -1) {
      client.user.setPresence({ 
        activities: [{ name: `Error | Type ${prefix}help` }],
        status: "dnd"
      });
    } else if(status === 1 && d7dtdState.connStatus !== 1) {
      if(typeof config.channel === "undefined" || config.channel === "channelid") {
        client.user.setPresence({ 
          activities: [{ name: `No channel | Type ${prefix}setchannel` }],
          status: "idle"
        });
      }
      else {
        client.user.setPresence({ 
          activities: [{ name: `7DTD | Type ${prefix}help` }],
          status: "online"
        });
      }
    }

  }

  // Update the status so we don't keep sending duplicates to Discord
  d7dtdState.connStatus = status;
}

function refreshDiscordStatus() {
  var status = d7dtdState.connStatus;
  d7dtdState.connStatus = -100;
  updateStatus(status);
}

// This function prevent's the bot's staus from showing up as blank.
function d7dtdHeartbeat() {
  var status = d7dtdState.connStatus;
  d7dtdState.connStatus = -100;
  updateStatus(status);

  d7dtdState.timeout = setTimeout(() => {
    d7dtdHeartbeat();
  }, 3.6e+6); // Heartbeat every hour
}

function processTelnetResponse(response, callback) {
  // Sometimes the "response" has more than what we're looking for.
  // We have to double-check and make sure the correct line is returned.
  if(typeof response !== "undefined") {
    var lines = response.split(lineSplit);
    d7dtdState.receivedData = 0;
    for(var i = 0; i <= lines.length-1; i++) {
      callback(lines[i]);
    }
  }
}

function parseDiscordCommand(msg, mentioned) {
  var cmd = msg.toString().toUpperCase().replace(prefix, "");

  if(msg.author.bot === true) {
    return;
  }

  // 7d!setchannel
  if(cmd.startsWith("SETCHANNEL")) {
    var channelExists = (typeof channel !== "undefined");

    if(!channelExists || msg.channel.type !== "GUILD_TEXT") {
      return;
    }

    if(!msg.member.permissions.has("MANAGE_GUILD") || msg.guild !== channel.guild) {
      msg.author.send("You do not have permission to do this. (setchannel)");
      return;
    }

    console.log("User " + msg.author.tag + " (" + msg.author.id + ") executed command: " + cmd);
    var str = msg.toString().toUpperCase().replace(prefix + "SETCHANNEL ", "");
    var id = str.replace("<#","").replace(">","");

    // If blank str, use active channel.
    var channelobj;
    if(id === prefix + "SETCHANNEL") {
      channelobj = msg.channel;
    }
    else {
      channelobj = client.channels.cache.find((channelobj) => (channelobj.id === id));
    }

    if(typeof channel !== "undefined" && channelobj.id === channel.id && typeof d7dtdState.setChannelError == "undefined") {
      msg.channel.send(":warning: This channel is already set as the bot's active channel!");
      return;
    }

    if(typeof channelobj === "undefined") {
      msg.channel.send(":x: Failed to identify the channel you specified.");
      return;
    }

    channel = channelobj;
    channelid = channel.id;

    config.channel = channelid;

    fs.writeFile(configFile, JSON.stringify(config, null, "\t"), "utf8", (err) => {
      if(err) {
        console.error("Failed to write to the config file with the following err:\n" + err + "\nMake sure your config file is not read-only or missing.");
        msg.channel.send(":warning: Channel set successfully to <#" + channelobj.id + "> (" + channelobj.id + "), however the configuration has failed to save. The configured channel will not save when the bot restarts. See the bot's console for more info.");
        d7dtdState.setChannelError = err;
      }
      else {
        d7dtdState.setChannelError = void 0;
        msg.channel.send(":white_check_mark: The channel has been successfully set to <#" + channelobj.id + "> (" + channelobj.id + ")");
      }
    });

    refreshDiscordStatus();
  }

  // 7d!exec
  // This command must be explicitly enabled due to the security risks of allowing it.
  if(cmd.startsWith("EXEC")) {
    if(msg.channel.type !== "GUILD_TEXT" || !config["allow-exec-command"]) {
      return;
    }

    if(!msg.member.permissions.has("MANAGE_GUILD") || msg.guild !== channel.guild) {
      msg.author.send("You do not have permission to do this. (exec)");
      return;
    }

    console.log("User " + msg.author.tag + " (" + msg.author.id + ") executed command: " + cmd);
    var execStr = msg.toString().replace(new RegExp(prefix + "EXEC", "ig"), "");
    telnet.exec(execStr);
  }

  // The following commands only work in the specified channel if one is set.
  if(msg.channel === channel || msg.channel.type === "DM") {
    // 7d!info
    if(cmd === "INFO" || cmd === "I" || mentioned) {
      // -1 = Error, 0 = No connection/connecting, 1 = Online, -100 = Override or N/A (value is ignored)
      var statusMsg;
      switch(d7dtdState.connStatus) {
      default:
        statusMsg = ":red_circle: Error";
        break;
      case 0:
        statusMsg = ":white_circle: Connecting...";
        break;
      case 1:
        statusMsg = ":green_circle: Online";
        break;
      }

      // Use the comprehensive changes content for info
      const changesReport = generateChangesReport();
      const infoContent = `Server connection: ${statusMsg}\n\n${changesReport}`;
      
      const embed = {
        color: 0x7289da, // Discord blurple for info
        title: "🎮 HordeComms Information & Features",
        description: infoContent,
        footer: {
          text: `HordeComms v${pjson.version} • Original: LakeYS • Expanded: CDRZ`,
        }
      };
      
      msg.channel.send({ embeds: [embed] })
        .catch((err) => {
          console.log(err);
          // If the embed fails, try sending without it.
          msg.channel.send(infoContent);
        });
    }

    // The following commands only work if disable-commands is OFF. (includes above conditions)
    // TODO: Refactor
    if(!config["disable-commands"]) {
      // 7d!time
      if(cmd === "TIME" || cmd === "T" || cmd === "DAY") {
        telnet.exec("gettime", (err, response) => {
          if(!err) {
            processTelnetResponse(response, (line) => {
              if(line.startsWith("Day")) {
                d7dtdState.receivedData = 1;
                handleTime(line, msg);
              }
            });

            // Sometimes, the response doesn't have the data we're looking for...
            if(!d7dtdState.receivedData) {
              d7dtdState.waitingForTime = 1;
              d7dtdState.waitingForTimeMsg = msg;
            }
          }
          else {
            handleCmdError(err);
          }
        });
      }

      // 7d!players
      if(cmd === "PLAYERS" || cmd === "P" || cmd === "PL" || cmd === "LP") {
        telnet.exec("lp", (err, response) => {
          if(!err) {
            processTelnetResponse(response, (line) => {
              if(line.startsWith("Total of ")) {
                d7dtdState.receivedData = 1;
                handlePlayerCount(line, msg);
              }
            });

            if(!d7dtdState.receivedData) {
              d7dtdState.waitingForPlayers = 1;
              d7dtdState.waitingForPlayersMsg = msg;
            }
          }
          else {
            handleCmdError(err);
          }
        });
      }

      // 7d!activity
      if(cmd === "ACTIVITY" || cmd === "A" || cmd === "ACT") {
        console.log("User " + msg.author.tag + " (" + msg.author.id + ") executed command: " + cmd);
        handleActivity(msg);
      }

      // 7d!trends
      if(cmd === "TRENDS" || cmd === "T" || cmd === "TREND") {
        console.log("User " + msg.author.tag + " (" + msg.author.id + ") executed command: " + cmd);
        handleTrends(msg);
      }

      // 7d!dashboard
      if(cmd === "DASHBOARD" || cmd === "D" || cmd === "DASH") {
        console.log("User " + msg.author.tag + " (" + msg.author.id + ") executed command: " + cmd);
        handleDashboard(msg);
      }

      //if(cmd === "PREF") {
      //  Telnet.exec("getgamepref", (err, response) => {
      //    if(!err) {
      //      var str = msg.toString().toUpperCase().replace(prefix + "PREF ", "").replace(prefix + "PREF", "");
      //      // Sometimes the "response" has more than what we're looking for.
      //      // We have to double-check and make sure the correct line is returned.
      //      if(typeof response !== "undefined") {
      //        var lines = response.split(lineSplit);
      //        d7dtdState.receivedData = 0;

      //        final = "";
      //        for(var i = 0; i <= lines.length-1; i++) {
      //          var line = lines[i];
      //          if(line.startsWith("GamePref.")) {
      //            final = final + lineSplit + line.replace("GamePref.","");
      //            d7dtdState.receivedData = 1;
      //          }
      //        }
      //        msg.author.send(final);
      //        msg.channel.send("Server configuration has been sent to you via DM.");
      //        // TODO: Make sure user can receive DMs before sending
      //      }

      //      if(!d7dtdState.receivedData) {
      //        d7dtdState.waitingForPref = 1;
      //        d7dtdState.waitingForPrefMsg = msg;
      //      }
      //    }
      //    else {
      //      handleCmdError(err);
      //    }
      //  });
      //}
    }
  }
}

////// # Telnet # //////
var params = {
  host: ip,
  port,
  timeout: 15000,
  username: "",
  password: pass,

  passwordPrompt: /Please enter password:/i,
  shellPrompt: /\r\n$/,

  debug: false,
};

// If Discord auth is skipped, we have to connect now rather than waiting for the Discord client.
if(config["skip-discord-auth"]) {
  telnet.connect(params);
}

telnet.on("ready", () => {
  console.log("Connected to game. (" +  Date() + ")");

  if(!config["skip-discord-auth"]) {
    updateStatus(1);
  }
});

telnet.on("failedlogin", () => {
  console.log("Login to game failed! (" +  Date() + ")");
  process.exit();
});

telnet.on("close", () => {
  // Empty the cache.
  d7dtdState.data = "";

  // If there is no error, update status to 'No connection'
  if(d7dtdState.connStatus !== -1) {
    updateStatus(0);
  }

  if(d7dtdState.doReconnect) {
    telnet.end(); // Just in case
    setTimeout(() => { telnet.connect(params); }, 5000);
  }
});

telnet.on("data", (data) => {
  if(config["debug-mode"]) {
    var str = data.toString();

    var lineEnding = "!!!NONE!!!";
    if(str.endsWith("\r\n")) lineEnding = "CRLF";
    else if(str.endsWith("\r")) lineEnding = "CR";
    else if(str.endsWith("\n")) lineEnding = "LF";

    console.log(`[DEBUG] Buffer length: ${data.length}; Line ending: ${lineEnding};`);

    if(lineEnding === "!!!NONE!!!") console.warn("[DEBUG] Buffer is missing a line ending!");

    if(str.startsWith("\r\n") || str.startsWith("\n") || str.startsWith("\r")) {
      console.log("[DEBUG] Line starts with a line ending. Possible issues?");
    }

    if(config["debug-buffer-log"]) {
      console.log(`[BUFFERDMP1] ${str}`);
    }
  }

  data = d7dtdState.data + data.toString();

  if(data.endsWith("\n") || data.endsWith("\r")) {
    d7dtdState.data = ""; // Clear the existing data cache.
  }
  else {
    // Fill the cache to be completed on the next "data" call.
    d7dtdState.data = d7dtdState.data + data;

    // Await further information.
    return;
  }

  var lines = data.split(lineSplit);

  if(config["log-telnet"]) {
    console.log("[Telnet] " + data);
  }

  // Error catchers for password re-prompts
  if(data === "Please enter password:\r\n\u0000\u0000") {
    console.log("ERROR: Received password prompt!");
    process.exit();
  }

  if(data === "Password incorrect, please enter password:\r\n") {
    console.log("ERROR: Received password prompt! (Telnet password is incorrect)");
    process.exit();
  }

  for(var i = 0; i <= lines.length-1; i++) {
    var line = lines[i];

    // escapeRegExp
    lines[i] = lines[i].replace(/[.*+?^${}()|[\]\\]/g, " ");

    var split = line.split(" ");

    if(split[2] === "INF" && split[3] === "[NET]" && split[4] === "ServerShutdown\r") {
      // If we don't destroy the connection, crashes will happen when someone types a message.
      // This is a workaround until better measures can be put in place for sending data to the game.
      console.log("The server has shut down. Closing connection...");
      telnet.destroy();

      channel.send({embeds: [{
        color: 14164000,
        description: "The server has shut down."
      }] })
        .catch(() => {
        // Try re-sending without the embed if an error occurs.
          channel.send("**The server has shut down.**")
            .catch((err) => {
              console.log("Failed to send message with error: " + err.message);
            });
        });
    }

    // This is a workaround for responses not working properly, particularly on local connections.
    if(d7dtdState.waitingForTime && line.startsWith("Day")) {
      handleTime(line, d7dtdState.waitingForTimeMsg);
    }
    else if(d7dtdState.waitingForPlayers && line.startsWith("Total of ")) {
      handlePlayerCount(line, d7dtdState.waitingForPlayersMsg);
    }
    else if(d7dtdState.waitingForActivity && line.startsWith("Total of ")) {
      // Trigger activity processing when player count is received
      setTimeout(() => {
        if (d7dtdState.waitingForActivity) {
          const activityMessage = generateActivityMessage(
            d7dtdState.activityData.players,
            d7dtdState.activityData.time,
            d7dtdState.activityData.hordeTime
          );
          d7dtdState.waitingForActivityMsg.channel.send(activityMessage);
          d7dtdState.waitingForActivity = 0;
        }
      }, 1000); // Give time for other commands to complete
    }
    //else if(d7dtdState.waitingForPref && line.startsWith("GamePref.")) {
    //  d7dtdState.waitingForPrefMsg.channel.send(line);
    //}
    else {
      handleMsgFromGame(line);
    }
  }
});

telnet.on("error", (error) => {
  var errMsg = error.message || error;
  console.log(`An error occurred while connecting to the game:\n${errMsg}`);
  //d7dtdState.lastTelnetErr = data.message;

  updateStatus(-1);
});

function doLogin() {
  client.login(token)
    .catch((error) => {
    // We want the error event to trigger if this part fails.
      client.emit("error", error);
    });
}

var firstLogin;
if(!config["skip-discord-auth"]) {
  doLogin();

  client.on("ready", () => {
    if(firstLogin !== 1) {
      firstLogin = 1;
      console.log("Discord client connected successfully.");

      // Set the initial status and begin the heartbeat timer.
      d7dtdState.connStatus = 0;
      d7dtdHeartbeat();
    }
    else {
      console.log("Discord client re-connected successfully.");

      // When the client reconnects, we have to re-establish the status.
      refreshDiscordStatus();
    }


    if(client.guilds.cache.size === 0) {
      console.log("\x1b[31m********\nWARNING: The bot is currently not in a Discord server. You can invite it to a guild using this invite link:\nhttps://discord.com/oauth2/authorize?client_id=" + client.user.id + "&scope=bot\n********\x1b[0m");
    }

    if(client.guilds.cache.size > 1) {
      console.log("\x1b[31m********\nWARNING: The bot is currently in more than one Discord server. Please type 'leaveguilds' in the console to clear the bot from all guilds.\nIt is highly recommended that you verify 'Public bot' is UNCHECKED on this page:\n\x1b[1m https://discord.com/developers/applications/" + client.user.id + "/information \x1b[0m\n\x1b[31m********\x1b[0m");
    }

    channel = client.channels.cache.find((channel) => (channel.id === channelid));

    if(!channel && !skipChannelCheck) {
      console.log("\x1b[33mERROR: Failed to identify channel with ID '" + channelid + "'\x1b[0m");
      config.channel = "channelid";
    }

    // Wait until the Discord client is ready before connecting to the game.
    if(d7dtdState.connInitialized !== 1) {
      d7dtdState.connInitialized = 1; // Make sure we only do this once
      telnet.connect(params);
    }
  });

  client.on("error", (error) => {
    console.log("Discord client disconnected with reason: " + error);

    if(error.code === "TOKEN_INVALID") {
      if(token === "your_token_here") {
        console.log("It appears that you have not yet added a token. Please replace \"your_token_here\" with a valid token in the config file.");
      }
      else if(token.length < 50) {
        console.log("It appears that you have entered a client secret or other invalid string. Please ensure that you have entered a bot token and try again.");
      }
      else {
        console.log("Please double-check the configured token and try again.");
      }
      process.exit();
    }

    console.log("Attempting to reconnect in 6s...");
    setTimeout(() => { doLogin(); }, 6000);
  });

  client.on("messageCreate", (msg) => {
    // member can be null for messages from webhooks, etc.
    if(msg.author === client.user || msg.member == null) {
      return;
    }

    if(!config["show-discord-bot-msgs"] && msg.author.bot === true) {
      return;
    }

    // If the bot is mentioned, pass through as if the user typed 7d!info
    // Also includes overrides for the default prefix.
    var mentioned = msg.content.includes("<@" + client.user.id + ">") || msg.content === "7d!info";

    if(msg.content.toUpperCase().startsWith(prefix) || mentioned) {
      parseDiscordCommand(msg, mentioned);
    }
    else if(msg.channel === channel && msg.channel.type === "GUILD_TEXT") {
      msg = "[" + msg.member.displayName + "] " + msg.cleanContent;
      handleMsgToGame(msg);
    }
  });

  // Handle button interactions
  client.on("interactionCreate", (interaction) => {
    if (!interaction.isButton()) return;
    
    // Handle all dashboard and navigation button interactions
    if (interaction.customId.startsWith("dashboard_") || interaction.customId === "back_to_dashboard") {
      handleButtonInteraction(interaction);
    }
  });
}

////// # Console Input # //////
process.stdin.on("data", (text) => {
  if(text.toString() === "stop\r\n" || text.toString() === "exit\r\n" || text.toString() === "stop\n" || text.toString() === "exit\n") {
    process.exit();
  }
  else if(text.toString() === "help\r\n" || text.toString() === "help\n") {
    console.log("This is the console for the Discord bot. It currently only accepts JavaScript commands for advanced users. Type 'exit' to shut it down.");
  }
  else if(text.toString() === "leaveguilds\r\n" || text.toString() === "leaveguilds\n") {
    client.guilds.cache.forEach((guild) => {
      console.log("Leaving guild \"" + guild.name + "\"");
      guild.leave();
    });
    console.log("Left all servers. Use this link to re-invite the bot: \n\x1b[1m https://discord.com/oauth2/authorize?client_id=" + client.user.id + "&scope=bot \x1b[0m");
  }
  else
  {
    try {
      eval(text.toString());
    }
    catch(err) {
      console.log(err);
    }
  }
});

process.on("exit",  () => {
  d7dtdState.doReconnect = 0;

  if(!config["skip-discord-auth"]) {
    client.destroy();
  }
});

process.on("unhandledRejection", (err) => {
  if(!config["skip-discord-auth"]) {
    console.log(err.stack);
    console.log("Unhandled rejection: '" + err.message + "'. Attempting to reconnect...");
    client.destroy();
    setTimeout(() => { doLogin(); }, 6000);
  }
});
