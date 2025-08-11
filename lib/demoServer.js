const EventEmitter = require("events");
class DemoClient extends EventEmitter {}

const Client = new DemoClient();
exports.client = Client;

Client.connect = () => {
  // simulate async connect with a thenable
  return new Promise((resolve) => {
    setTimeout(() => { Client.emit("ready"); resolve(); }, 50);
  });
};

let announced = false;
Client.on("ready", () => {
  if (!announced) {
    console.log("Dev client ready");
    announced = true;
  }
});

Client.exec = (command, options, callback) => {
  // options is optional in our code paths
  if (typeof options === 'function' && !callback) { callback = options; }
  var response = "";
  if(command === "gettime") {
    response = "Day 7, 21:00\n1 hour to next horde.";
  }
  else if(command === "version") {
    response = "Game version: Alpha 21.2 (b30) Compatibility Version: Alpha 21.2";
  }
  else if(command === "lp") {
    // Simulate different scenarios for testing
    const scenarios = [
      // Empty server
      "Total of 0 in the game",
      // Single player scenario  
      "1. id=171, John, pos=(150.5, 67.0, -200.3), rot=(0.0, 45.0, 0.0), remote=True, health=45, deaths=2, zombies=15, players=0, score=150, level=12, steamid=76561198123456789, ip=192.168.1.100, ping=50\nTotal of 1 in the game",
      // Multiple players scenario
      "1. id=171, John, pos=(150.5, 67.0, -200.3), rot=(0.0, 45.0, 0.0), remote=True, health=85, deaths=1, zombies=25, players=0, score=250, level=18, steamid=76561198123456789, ip=192.168.1.100, ping=50\n2. id=172, Sarah, pos=(-300.2, 65.0, 400.8), rot=(0.0, 180.0, 0.0), remote=True, health=30, deaths=5, zombies=8, players=0, score=120, level=8, steamid=76561198987654321, ip=192.168.1.101, ping=45\n3. id=173, Mike, pos=(800.0, 70.0, 100.0), rot=(0.0, 90.0, 0.0), remote=True, health=95, deaths=0, zombies=45, players=0, score=480, level=25, steamid=76561198555666777, ip=192.168.1.102, ping=35\nTotal of 3 in the game"
    ];
    
    // Cycle through scenarios for testing
    const scenario = Math.floor(Date.now() / 10000) % scenarios.length;
    response = scenarios[scenario];
  }

  if (typeof callback === 'function') callback(void 0, response);
};

// Provide send() compatibility used by TelnetQueue when available
Client.send = (data) => {
  // No-op; simulate immediate success.
};
