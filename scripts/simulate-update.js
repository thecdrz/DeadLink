const UpdatesService = require('../lib/updates');
const pjson = require('../package.json');
const config = require('../config.json');
(async () => {
  const updates = new UpdatesService({ repoAuthor: 'thecdrz', repoName: 'DeadLink', currentVersion: pjson.version, storageDir: '.' });
  const action = 'check';
  const info = await updates.fetchLatest({ includePrerelease: !!(config.updates && config.updates.prerelease) });
  let usedCached = false;
  let effectiveInfo = info;
  if (!info) {
    if (updates.cache && updates.cache.lastRelease) { effectiveInfo = updates.cache.lastRelease; usedCached = true; }
    else { console.log('Could not fetch release info (network unreachable)'); return; }
  }
  const upToDate = !updates.isNewer(effectiveInfo.version);
  const embed = {
    title: upToDate ? `Latest release (already installed): v${effectiveInfo.version}` : `Update available: v${effectiveInfo.version}`,
    url: effectiveInfo.url,
    description: upToDate ? `You're running v${pjson.version}. This is the latest release.` : `You're running v${pjson.version}. A new release is available.`
  };
  if (action === 'check') {
    if (usedCached) console.log('⚠️ Live fetch failed; showing cached release info.');
    console.log('EMBED:', embed);
  }
})();
