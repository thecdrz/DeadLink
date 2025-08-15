const fs = require('fs');
const path = require('path');
const { safeReadJson, safeWriteJson } = require('./fs-utils');
let semver;
try { semver = require('semver-compare'); } catch(_) { semver = null; }
const { httpGetJson } = require('./http-utils');

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
  const v = safeReadJson(this.storagePath, { lastNotifiedVersion: null, lastCheckedAt: 0, lastRelease: null });
  return v;
  }

  saveCache() {
  try { safeWriteJson(this.storagePath, this.cache); } catch (_) {}
  }

  async fetchLatest({ includePrerelease = false } = {}) {
  const maxAttempts = 3;
  const delays = [300, 700];
  let attempt = 0;
  let lastErr = null;
    const base = {
      host: 'api.github.com',
      method: 'GET',
      headers: { 'user-agent': this.repoName, 'accept': 'application/vnd.github.v3+json' }
    };
    // If a GITHUB_TOKEN is provided in env, use it to avoid strict rate limits
    try {
      if (process && process.env && process.env.GITHUB_TOKEN) {
        base.headers.authorization = `token ${process.env.GITHUB_TOKEN}`;
      }
    } catch(_) {}
    while (attempt < maxAttempts) {
      try {
        if (!includePrerelease) {
          const options = { ...base, path: `/repos/${this.repoAuthor}/${this.repoName}/releases/latest` };
          const json = await httpGetJson(options);
          const info = this.normalizeRelease(json);
          if (info) { this.cache.lastRelease = info; this.saveCache(); }
          return info;
        }
        // Include prereleases: fetch list and take first non-draft
        const options = { ...base, path: `/repos/${this.repoAuthor}/${this.repoName}/releases` };
        const list = await httpGetJson(options);
        const item = Array.isArray(list) ? list.find(r => r && r.draft === false) : null;
        const info = this.normalizeRelease(item || {});
        if (info) { this.cache.lastRelease = info; this.saveCache(); }
        return info;
      } catch (e) {
        lastErr = e;
        try { console.warn('[updates] fetchLatest attempt failed:', e && e.message ? e.message : e); } catch(_) {}
        attempt++;
        if (attempt < maxAttempts) {
          const d = delays[Math.min(attempt-1, delays.length-1)];
          await new Promise(r => setTimeout(r, d));
          continue;
        }
        break;
      }
    }
    try { console.warn('[updates] fetchLatest failed (all attempts):', lastErr && lastErr.message ? lastErr.message : lastErr); } catch(_) {}
    return null;
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
    if (!this.timer) {
      this.timer = setTimeout(tick, 5_000);
      try { require('./lifecycle').registerTimeout(this.timer); } catch(_) {}
    }
  }

  stop() { if (this.timer) clearTimeout(this.timer); this.timer = null; }

  getGuide(os = 'windows', versionTag = null) {
    // Prefer a specific tag when provided; fall back to current version tag
    const tag = versionTag || ('v' + (this.currentVersion || 'latest'));
    if (os === 'linux') {
      return [
        'Backup: cp config.json config.backup.json; cp analytics.json analytics.backup.json 2>/dev/null || true',
  'Download: curl -L https://github.com/' + this.repoAuthor + '/' + this.repoName + '/archive/refs/tags/' + tag + '.tar.gz -o DeadLink.tar.gz',
  'Extract: mkdir -p ../DeadLink-' + tag + ' && tar -xzf DeadLink.tar.gz -C ..',
        'Install deps: cd .. && cd $(ls -d ' + this.repoName + '-*' + tag.replace(/[^\w.-]/g, '') + '* | head -n 1) && npm ci',
        'Restart your process manager or run ./run.sh'
      ].join('\n');
    }
    // windows
    return [
      'Backup: copy config.json config.backup.json & copy analytics.json analytics.backup.json 2>nul',
  'Download: Invoke-WebRequest https://github.com/' + this.repoAuthor + '/' + this.repoName + '/archive/refs/tags/' + tag + '.zip -OutFile DeadLink.zip',
  'Extract: Expand-Archive -Path DeadLink.zip -DestinationPath .. -Force',
      'Install deps: cd .. & for /d %G in (' + this.repoName + '-*' + tag + '*) do (cd "%G" & npm ci & goto done) & :done',
      'Restart using run.bat'
    ].join('\n');
  }
}

module.exports = UpdatesService;
