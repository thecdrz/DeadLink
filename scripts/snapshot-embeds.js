// Simple Puppeteer script to render sample embeds for the website.
// Requires Discord client token and a test guild/channel or uses a local HTML harness.
// For safety and portability, we render a lightweight HTML harness with our embed JSON.

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { serverAnalyticsEmbed, activityEmbed, playersListEmbed, timeEmbed, playerDeepDiveEmbed } = require('../lib/embeds');

function sampleEmbeds() {
  return [
    { name: 'dashboard-trends', embed: serverAnalyticsEmbed({ description: '📈 Current: 7 players\n📋 24h Avg: 5.3\n🔝 Peak: 12 | 🔽 Low: 1\n\n🎯 Activity Insights\n🕐 Last Hour: High (7.2 avg)\n⏰ Last 3 Hours: Moderate (4.8 avg)\n📅 Last 6 Hours: Moderate (3.9 avg)\n\n📊 Activity Patterns\n📊 Activity increasing by 18%\n🎯 Consistency: Moderately consistent', withImage: true }) },
    { name: 'activity', embed: activityEmbed({ description: '👤 John is cautiously exploring the distant eastern ash lands\nHe is in excellent health and moving quickly.\n\nTips:\n✅ Managing well - maintain vigilance.' }) },
    { name: 'players', embed: playersListEmbed({ description: 'Total of 3 in the game\n\n**John** L18 | ❤️ 85% (Excellent) | K/D 25.0 | 🧟 25 | ⚔️ 0.8kpm | ☠️ 1 | 🟢 50ms | 📏 430m | ⏱️ 34m | 🔥 16m (PB 45m)\n↳ the distant eastern ash lands\n\n**Sarah** L8 | ❤️ 30% (Critical) | K/D 1.6 | 🧟 8 | ⚔️ 0.4kpm | ☠️ 5 | 🟡 45ms | 📏 220m | ⏱️ 12m | 🔥 5m (PB 18m)\n↳ the far northern woodlands\n\nClusters: 2 | Largest: 2 | Isolated: 1' }) },
    { name: 'time', embed: timeEmbed({ description: 'Day 7, 21:05\nHorde begins in 55 minutes.' }) },
    { name: 'player-deep-dive', embed: playerDeepDiveEmbed({ title: '🎯 Player Deep Dive', description: '**John**\nLevel: 18 | ❤️ 85% (Excellent) | Ping: 🟢 50ms\nKills: 25 | Deaths: 1 | K/D: 25.0 | Kill Rate: 0.8 kpm\nSession: 34m\nDistance: 430m (Lifetime 12,300m) | Avg Speed: 12.6 m/min\nDeathless Streak: 16m (PB 45m)\nLocation: the distant eastern ash lands' }) }
  ];
}

function htmlFor(embed, opts = {}) {
  const pad = 12;
  const maxWidth = opts.maxWidth || 880; // wider card for higher-res screenshots
  const chartHeight = opts.chartHeight || 300;
  return `<!doctype html><meta charset="utf-8"/><style>
  body{background:#2b2d31;margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Noto Sans',sans-serif}
  .card{max-width:${maxWidth}px;background:#313338;color:#dbdee1;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);}
  .title{padding:${pad}px ${pad}px 0 ${pad}px;font-weight:600}
  .desc{white-space:pre-wrap;padding:${pad}px;color:#b5bac1}
  .footer{padding:${pad}px;color:#8e9297;font-size:12px}
  .image{display:block;width:100%;height:auto;aspect-ratio:${maxWidth}/${chartHeight};object-fit:cover}
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

    for (const s of sampleEmbeds()) {
  const html = htmlFor(s.embed, { maxWidth: 980, chartHeight: 340 });
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
