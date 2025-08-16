// Simple Puppeteer script to render sample embeds for the website.
// Requires Discord client token and a test guild/channel or uses a local HTML harness.
// For safety and portability, we render a lightweight HTML harness with our embed JSON.

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { serverAnalyticsEmbed, activityEmbed, playersListEmbed, timeEmbed, playerDeepDiveEmbed } = require('../lib/embeds');
const pjson = require('../package.json');

function sampleEmbeds() {
  return [
    { name: 'dashboard-trends', embed: serverAnalyticsEmbed({ description: '📈 Current: 7 players\n📋 24h Avg: 5.3\n🔝 Peak: 12 | 🔽 Low: 1\n\n🎯 Activity Insights\n🕐 Last Hour: High (7.2 avg)\n⏰ Last 3 Hours: Moderate (4.8 avg)\n📅 Last 6 Hours: Moderate (3.9 avg)\n\n📊 Activity Patterns\n📊 Activity increasing by 18%\n🎯 Consistency: Moderately consistent', withImage: true }) },
    // Activity (brief)
    { name: 'activity-brief', embed: activityEmbed({ description: '� 8 online | Day 14, 21:05\n🩸 Blood Moon Warning\n> Horde begins in less than an hour\n🩹 Low HP: Mina 33%\n📶 High ping: Kai 172ms\n🏘️ Clusters: 3 | Largest: 3 | Isolated: 2\n\nNova L20 ❤️78% 🟢62ms · Rex L21 ❤️82% 🟢59ms · Mina L9 ❤️33% 🟠188ms · Kai L13 ❤️57% 🟠172ms · Ivy L26 ❤️91% 🟢44ms · Thorn L17 ❤️66% 🟢51ms +2 more' }) },
    // Activity (full)
    { name: 'activity-full', embed: activityEmbed({ description: 'Night falls over the far northern pine forests as Nova scouts the ridgeline. Health holds at 78% and spirits are high.\n\nMina is in trouble in the southern wastelands—critically low at 33%. If you can reach her, bring meds and cover.\n\nRex and Ivy move in tandem across the ash lands; signs of looting but no major threats yet.\n\n🩸 Blood Moon Warning: begins in less than an hour. Fortify, craft spikes, and ensure ammo stocks are ready.\n\nTips:\n• Low HP players should regroup and heal before venturing out.\n• Expect increased zombie aggression near towns after dark.' }) },
  { name: 'players', embed: playersListEmbed({ description: 'Total of 3 in the game\n\n**John** L18 | ❤️ 85% (Excellent) | ⚔️ 25 | ☠️ 1 | 🟢 50ms | 📏 430m | ⏱️ 34m | 🔥 16m (PB 45m)\n↳ the distant eastern ash lands\n\n**Sarah** L8 | ❤️ 30% (Critical) | ⚔️ 8 | ☠️ 5 | 🟡 45ms | 📏 220m | ⏱️ 12m | 🔥 5m (PB 18m)\n↳ the far northern woodlands\n\nClusters: 2 | Largest: 2 | Isolated: 1' }) },
    { name: 'time', embed: timeEmbed({ description: 'Day 7, 21:05\nHorde begins in 55 minutes.' }) },
  { name: 'player-deep-dive', embed: playerDeepDiveEmbed({ title: '🎯 Player Deep Dive', description: '**John**\nLevel: 18 | ❤️ 85% (Excellent) | Ping: 🟢 50ms\nKills: 25 | Deaths: 1\nSession: 34m\nDistance: 430m (Lifetime 12,300m) | Avg Speed: 12.6 m/min\nDeathless Streak: 16m (PB 45m)\nLocation: the distant eastern ash lands' }) }
  ];
}

function terminalStartupCard(){
  const lines = [
  `DeadLink v${pjson.version}  |  mode: DEV  |  logs: ./logs`,
    '— — — — — — — — — — — — — — — — — — — — — — —',
    '[init]   reading config.json … ok',
    '[telnet] connecting to 127.0.0.1:8081 … connected',
    '[discord] logging in … ready (1 guild)',
    '[analytics] loaded analytics.json (sessions: 24)',
  `[updates] checked GitHub releases (latest v${pjson.version})`,
    '[heartbeat] scheduled (post-connect)',
    '',
    'Tip: /dashboard for the UI • DEV_MODE=true to simulate telnet'
  ].join('\n');
  return {
    title: 'Terminal',
    description: lines,
    footer: { text: 'Clean structured logs' }
  };
}

function htmlFor(embed, opts = {}) {
  const pad = 12;
  const maxWidth = opts.maxWidth || 900; // balanced width for crispness
  const chartHeight = opts.chartHeight || 240; // smaller chart area to avoid overpowering
  return `<!doctype html><meta charset="utf-8"/><style>
  body{background:#2b2d31;margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Noto Sans',sans-serif}
  .card{max-width:${maxWidth}px;background:#313338;color:#dbdee1;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,0.06);overflow:hidden}
  .title{padding:${pad}px ${pad}px 8px ${pad}px;font-weight:700}
  .desc{white-space:pre-wrap;padding:${pad}px;color:#b5bac1}
  .footer{padding:${pad}px;color:#8e9297;font-size:12px;border-top:1px solid rgba(255,255,255,0.06)}
  .image{display:block;width:100%;height:auto;aspect-ratio:${maxWidth}/${chartHeight};object-fit:cover;border-top-left-radius:10px;border-top-right-radius:10px}
  </style><div class="card">
  <div class="title">${escapeHtml(embed.title||'')}</div>
  ${embed.image?`<img class="image" src="https://dummyimage.com/${maxWidth}x${chartHeight}/212121/ffffff&text=Chart" alt="image"/>`:''}
  <div class="desc">${escapeHtml(embed.description||'')}</div>
  <div class="footer">${escapeHtml(embed.footer?.text||'')}</div>
  </div>`;
}

function escapeHtml(s='') {
  return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

async function run() {
  const outDir = path.join(process.cwd(), 'screenshots');
  const docsOutDir = path.join(process.cwd(), 'docs', 'assets', 'snapshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  if (!fs.existsSync(docsOutDir)) fs.mkdirSync(docsOutDir, { recursive: true });

  // Puppeteer 24+: headless true by default; include no-sandbox for CI/containers
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(15000);
  // Larger viewport + higher scale for sharper images
  await page.setViewport({ width: 1120, height: 760, deviceScaleFactor: 2.5 });

  // Include terminal snapshot first
  const all = [{ name: 'terminal-startup', embed: terminalStartupCard() }, ...sampleEmbeds()];
  for (const s of all) {
  const html = htmlFor(s.embed, { maxWidth: 900, chartHeight: 240 });
      try {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        const filename = `${s.name}.png`;
        const file = path.join(outDir, filename);
        await page.screenshot({ path: file });
        console.log('Saved', file);

        // Also copy into docs assets so GitHub Pages can serve them
        const docsFile = path.join(docsOutDir, filename);
        fs.copyFileSync(file, docsFile);
      } catch (err) {
        console.error('Failed to snapshot', s.name, err.message);
      }
    }
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error('snapshot failed', err);
    process.exit(1);
  });
}

module.exports = { sampleEmbeds, htmlFor };
