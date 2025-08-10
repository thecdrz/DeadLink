const https = require('https');
const fs = require('fs');
const path = require('path');
let semver;
try { semver = require('semver-compare'); } catch(_) { semver = null; }

function httpGetJson(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

class UpdatesService {
  constructor({ repoAuthor, repoName, currentVersion, storageDir = '.' }) {
    this.repoAuthor = repoAuthor;
    this.repoName = repoName;
    this.currentVersion = currentVersion;
    this.storagePath = path.join(storageDir, 'updates.json');
    this.timer = null;
    this.cache = this.loadCache();
  }

  loadCache() {
    try {
      if (fs.existsSync(this.storagePath)) {
        return JSON.parse(fs.readFileSync(this.storagePath, 'utf8')) || {};
      }
    } catch (_) {}
    return { lastNotifiedVersion: null, lastCheckedAt: 0 };
  }

  saveCache() {
    try { fs.writeFileSync(this.storagePath, JSON.stringify(this.cache, null, 2), 'utf8'); } catch (_) {}
  }

  async fetchLatest({ includePrerelease = false } = {}) {
    const base = {
      host: 'api.github.com',
      method: 'GET',
      headers: { 'user-agent': this.repoName }
    };
    if (!includePrerelease) {
      const options = { ...base, path: `/repos/${this.repoAuthor}/${this.repoName}/releases/latest` };
      const json = await httpGetJson(options);
      return this.normalizeRelease(json);
    }
    // Include prereleases: fetch list and take first non-draft
    const options = { ...base, path: `/repos/${this.repoAuthor}/${this.repoName}/releases` };
    const list = await httpGetJson(options);
    const item = Array.isArray(list) ? list.find(r => r && r.draft === false) : null;
    return this.normalizeRelease(item || {});
  }

  normalizeRelease(json) {
    if (!json || !json.tag_name) return null;
    const version = String(json.tag_name).replace(/^v/i, '');
    return {
      tag: json.tag_name,
      version,
      name: json.name || json.tag_name,
      url: json.html_url || `https://github.com/${this.repoAuthor}/${this.repoName}/releases/tag/${json.tag_name}`,
      body: json.body || ''
    };
  }

  isNewer(latestVersion) {
    if (!latestVersion) return false;
    if (!semver) return latestVersion !== this.currentVersion; // fallback
    return semver(this.currentVersion, latestVersion) === -1;
  }

  startSchedule({ intervalHours = 24, includePrerelease = false } = {}, onNewVersion) {
    const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;
    const tick = async () => {
      try {
        const info = await this.fetchLatest({ includePrerelease });
        this.cache.lastCheckedAt = Date.now();
        if (info && this.isNewer(info.version)) {
          if (this.cache.lastNotifiedVersion !== info.version) {
            this.cache.lastNotifiedVersion = info.version;
            this.saveCache();
            if (typeof onNewVersion === 'function') onNewVersion(info);
          }
        }
        this.saveCache();
      } catch (_) {}
      finally {
        this.timer = setTimeout(tick, intervalMs);
      }
    };
    if (!this.timer) this.timer = setTimeout(tick, 5_000);
  }

  stop() { if (this.timer) clearTimeout(this.timer); this.timer = null; }

  getGuide(os = 'windows') {
    if (os === 'linux') {
      return [
        'Backup: cp config.json config.backup.json; cp analytics.json analytics.backup.json 2>/dev/null || true',
        'Download: curl -L https://github.com/' + this.repoAuthor + '/' + this.repoName + '/releases/latest/download/HordeComms.tar.gz -o HordeComms.tar.gz',
        'Extract: tar -xzf HordeComms.tar.gz -C ..',
        'Install deps: cd ../HordeComms && npm ci',
        'Restart your process manager or run ./run.sh'
      ].join('\n');
    }
    // windows
    return [
      'Backup: copy config.json config.backup.json & copy analytics.json analytics.backup.json 2>nul',
      'Download: Invoke-WebRequest https://github.com/' + this.repoAuthor + '/' + this.repoName + '/archive/refs/tags/%LATEST%.zip -OutFile HordeComms.zip',
      'Extract: Expand-Archive -Path HordeComms.zip -DestinationPath .. -Force',
      'Install deps: cd ..\\HordeComms && npm ci',
      'Restart using run.bat'
    ].join('\n');
  }
}

module.exports = UpdatesService;
