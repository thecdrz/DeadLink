const https = require("https");
const net = require("net");

class DishordeInitializer {
  constructor(packageData, config, configPrivate) {
    // # Version Check # //
    if(config["disable-version-check"]) {
      return;
    }

    // If, for whatever reason, semver-compare isn't installed, we'll skip the version check.
    var semver;
    try {
      semver = require("semver-compare");
    } catch(err) {
      if(err.code === "MODULE_NOT_FOUND") {
        console.warn(`********\nWARNING: semver-compare module not found. The version check will be skipped.\nMake sure to keep this application up-to-date! Check here for newer versions:\n\x1b[1m https://github.com/${configPrivate.githubAuthor}/${configPrivate.githubName}/releases \x1b[0m\n********`);
        return;
      }
      else {
        throw(err);
      }
    }

    var options = {
      host: "api.github.com",
      path: `/repos/${configPrivate.githubAuthor}/${configPrivate.githubName}/releases/latest`,
      method: "GET",
      headers: {"user-agent":configPrivate.githubName}
    };

    var input = "";
    var request = https.request(options, (res) => {
      res.on("data", (data) => {
        input = input + data; // Combine the data
      });
      res.on("error", (err) => {
        console.log(err);
      });
      res.on("uncaughtException", (err) => {
        console.log(err);
      });

      // Note that if there is an error while parsing the JSON data, the bot will crash.
      res.on("end", () => {
        if(typeof input !== "undefined") {
          this.parseVersion(JSON.parse(input.toString()), semver, packageData, configPrivate);
        }
        else {
          console.log(input); // Log the input on error
          console.log("WARNING: Unable to parse version data.");
        }
      });
    });

    request.end();
    process.nextTick(() => {
      request.on("error", (err) => {
        console.log(err);
        console.log("ERROR: Unable to query version data.");
      });
    });

    if(config["allow-multiple-instances"] !== true && typeof configPrivate.socketPort !== "undefined") {
      var server  = net.createServer()
        .on("error", (error) => {
          if(error.code === "EADDRINUSE") {
            console.error("\x1b[31mERROR: It appears that there is another instance of Dishorde already running. Please make sure only one instance of this application is running at a time.\n\nTo bypass this, enable \"allow-multiple-instances\" in the config.");
            process.exit();
          }
          else {
            console.warn(`WARNING: An unknown error has occurred. (${error.message})`);
          }
        });

      server.listen(configPrivate.socketPort);
    }
  }

  parseVersion(json, semver, pjson, configPrivate) {
    if(typeof json.tag_name === "undefined") {
      console.log(json);
      console.warn("WARNING: Unable to parse version data.");
    }
    else {
      const release = json.tag_name.replace("v",""); // Mark the release
  
      // Compare this build's version to the latest release.
      var releaseRelative = semver(pjson.version, release);
  
      if(releaseRelative === 1) {
        console.log(`********\nNOTICE: You are running\x1b[1m v${pjson.version}\x1b[0m, which is ahead of the latest published GitHub release.\nIf you just tagged a new release, this is expected until the GitHub Release is published.\nLatest releases:\n\x1b[1m https://github.com/${configPrivate.githubAuthor}/${configPrivate.githubName}/releases \x1b[0m\n********`);
      }
  
      if(releaseRelative === -1) {
        console.log(`********\nNOTICE: You are currently running\x1b[1m v${pjson.version}\x1b[0m. A newer version is available.\nCheck here for the latest version of this script:\n\x1b[1m https://github.com/${configPrivate.githubAuthor}/${configPrivate.githubName}/releases \x1b[0m\n********`);
      }
    }
  }
}

module.exports = DishordeInitializer;
