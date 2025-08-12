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
    // Cycle through day phases and horde states deterministically by time
    const slot = Math.floor(Date.now() / 10000) % 4; // 0..3
    if (slot === 0) {
      response = "Day 3, 08:15\nNo blood moon tonight.";
    } else if (slot === 1) {
      response = "Day 4, 14:30\nNo blood moon tonight.";
    } else if (slot === 2) {
      response = "Day 7, 20:45\nHorde begins in 1 hour.";
    } else {
      response = "Day 7, 22:10\nBlood moon is active!";
    }
  }
  else if(command === "version") {
    response = "Game version: Alpha 21.2 (b30) Compatibility Version: Alpha 21.2";
  }
  else if(command === "lp") {
    // Helper to build player lines
    const P = (idx, name, x, y, z, health, deaths, zombies, level, ping) =>
      `${idx}. id=${170+idx}, ${name}, pos=(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}), rot=(0.0, 45.0, 0.0), remote=True, health=${health}, deaths=${deaths}, zombies=${zombies}, players=0, score=${Math.max(50, level*10 + zombies)}, level=${level}, steamid=7656119${100000000+idx}, ip=192.168.1.${100+idx}, ping=${ping}`;

    const scenarios = [];
    // 0: Empty
    scenarios.push({ lines: [], total: 0 });
    // 1: Single low-health
    scenarios.push({ lines: [P(1,'John',150.5,67.0,-200.3, 15,2,15,12, 80)], total: 1 });
    // 2: Trio mixed
    scenarios.push({ lines: [
      P(1,'John',150.5,67.0,-200.3, 85,1,25,18, 50),
      P(2,'Sarah',-300.2,65.0,400.8, 30,5,8,8, 45),
      P(3,'Mike',800.0,70.0,100.0, 95,0,45,25, 35)
    ], total: 3 });
    // 3: Cluster of 5 near each other
    scenarios.push({ lines: [
      P(1,'Alex',100.0,68.0,100.0, 75,1,10,10, 40),
      P(2,'Bree',120.0,67.0,110.0, 60,0,5,9, 55),
      P(3,'Cruz',130.0,66.0,95.0, 90,2,15,14, 70),
      P(4,'Dawn',115.0,67.0,130.0, 40,3,12,8, 65),
      P(5,'Echo',105.0,67.0,120.0, 88,0,7,11, 48)
    ], total: 5 });
    // 4: Larger server sample (10 players, mixed spread)
    scenarios.push({ lines: [
      P(1,'Nova',-850.0,64.0,1200.0, 78,1,22,20, 62),
      P(2,'Rex',-860.0,64.0,1210.0, 82,0,19,21, 59),
      P(3,'Mina',300.0,65.0,-1400.0, 33,4,6,9, 88),
      P(4,'Kai',320.0,65.0,-1380.0, 57,1,11,13, 72),
      P(5,'Ivy',1500.0,70.0,200.0, 91,0,28,26, 44),
      P(6,'Thorn',1490.0,70.0,210.0, 66,2,13,17, 51),
      P(7,'Zed',-50.0,68.0,-40.0, 24,5,3,7, 95),
      P(8,'Una',-60.0,68.0,-35.0, 46,2,9,10, 86),
      P(9,'Pax',900.0,69.0,-900.0, 88,0,31,24, 39),
      P(10,'Luz',-1200.0,64.0,850.0, 72,1,18,19, 55)
    ], total: 10 });

    const idx = Math.floor(Date.now() / 10000) % scenarios.length;
    const sc = scenarios[idx];
    response = sc.lines.join('\n') + (sc.lines.length?"\n":"") + `Total of ${sc.total} in the game`;
  }

  if (typeof callback === 'function') callback(void 0, response);
};

// Provide send() compatibility used by TelnetQueue when available
Client.send = (data) => {
  // No-op; simulate immediate success.
};
