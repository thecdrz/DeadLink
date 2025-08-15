const UpdatesService = require('../lib/updates');
(async () => {
  const svc = new UpdatesService({ repoAuthor: 'thecdrz', repoName: 'DeadLink', currentVersion: require('../package.json').version, storageDir: '.' });
  try {
    const info = await svc.fetchLatest({ includePrerelease: false });
    console.log('fetchLatest result:', info);
    if (info) console.log('isNewer?', svc.isNewer(info.version));
  } catch (e) {
    console.error('fetch failed:', e && e.message ? e.message : e);
  }
})();
