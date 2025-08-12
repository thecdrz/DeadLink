// Generates a short dashboard tour animation (PNG frames -> WebM + optional GIF)
// Outputs:
// - docs/assets/snapshots/dashboard-tour.webm
// - docs/assets/snapshots/dashboard-tour.gif (optional if ffmpeg supports gif)

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');
const { serverAnalyticsEmbed, activityEmbed, playersListEmbed, timeEmbed } = require('../lib/embeds');

function htmlFor(embed){
  const pad = 12;
  const maxWidth = 980;
  const chartHeight = 340;
  return `<!doctype html><meta charset="utf-8"/><style>
  body{background:#2b2d31;margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Noto Sans',sans-serif}
  .wrap{display:flex;flex-direction:column;align-items:center;gap:10px}
  .tabs{display:flex;gap:8px}
  .tabs button{padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:#3a3c42;color:#e9e6df;cursor:pointer}
  .tabs button.active{background:#51545b}
  .card{max-width:${maxWidth}px;background:#313338;color:#dbdee1;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);}
  .title{padding:${pad}px ${pad}px 0 ${pad}px;font-weight:600}
  .desc{white-space:pre-wrap;padding:${pad}px;color:#b5bac1}
  .footer{padding:${pad}px;color:#8e9297;font-size:12px}
  .image{display:block;width:100%;height:auto;aspect-ratio:${maxWidth}/${chartHeight};object-fit:cover}
  </style>
  <div class="wrap">
    <div class="tabs" role="tablist">
      <button data-tab="trends" class="active">Trends</button>
      <button data-tab="activity">Activity</button>
      <button data-tab="players">Players</button>
      <button data-tab="time">Time</button>
    </div>
    <div class="card" id="card">
      <div class="title"></div>
      <img class="image" style="display:none" alt="chart"/>
      <div class="desc"></div>
      <div class="footer"></div>
    </div>
  </div>
  <script>
    const embeds = {
      trends: ${JSON.stringify(serverAnalyticsEmbed({ description: '📈 Current: 7 players\n📋 24h Avg: 5.3\n🔝 Peak: 12 | 🔽 Low: 1\n\n🎯 Activity Insights\n🕐 Last Hour: High (7.2 avg)\n⏰ Last 3 Hours: Moderate (4.8 avg)\n📅 Last 6 Hours: Moderate (3.9 avg)\n\n📊 Activity Patterns\n📊 Activity increasing by 18%\n🎯 Consistency: Moderately consistent', withImage: true }))},
      activity: ${JSON.stringify(activityEmbed({ description: '👤 John explores the ash lands. Health excellent; speed high. Tips: ✅ Managing well.' }))},
      players: ${JSON.stringify(playersListEmbed({ description: '3 online: John (L18 ❤️85% K/D 25.0 50ms 430m), Sarah (L8 ❤️30% 45ms 220m)…\nClusters: 2 | Largest: 2 | Isolated: 1' }))},
      time: ${JSON.stringify(timeEmbed({ description: 'Day 7, 21:05\nHorde begins in 55 minutes.' }))}
    };
    function render(name){
      const e = embeds[name];
      const card = document.getElementById('card');
      card.querySelector('.title').textContent = e.title || '';
      const img = card.querySelector('.image');
      if (e.image){ img.src = 'https://dummyimage.com/${maxWidth}x${chartHeight}/212121/ffffff&text=Chart'; img.style.display='block'; } else { img.style.display='none'; }
      card.querySelector('.desc').textContent = e.description || '';
      card.querySelector('.footer').textContent = (e.footer && e.footer.text) || '';
      document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab===name));
    }
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', ()=>render(b.dataset.tab)));
    render('trends');
  </script>`;
}

async function generateFrames(page, framesDir){
  const sequence = [
    { tab: 'trends', hold: 18 },
    { tab: 'activity', hold: 18 },
    { tab: 'players', hold: 18 },
    { tab: 'time', hold: 18 }
  ];
  let i = 0;
  for (const step of sequence){
    await page.evaluate(t => { window.render(t); }, step.tab);
  // small pause after switch
  await new Promise(r => setTimeout(r, 250));
    for (let j=0;j<step.hold;j++){
      const file = path.join(framesDir, `frame_${String(i).padStart(4,'0')}.png`);
      await page.screenshot({ path: file });
      i++;
    }
  }
}

function encodeFFmpeg({framesDir, outWebm, fps=12}){
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame_%04d.png'),
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '35',
      outWebm
    ];
    const proc = spawn(ffmpegPath, args, { stdio: 'inherit' });
    proc.on('exit', code => code===0 ? resolve() : reject(new Error('ffmpeg failed '+code)));
  });
}

async function run(){
  const docsOutDir = path.join(process.cwd(), 'docs', 'assets', 'snapshots');
  fs.mkdirSync(docsOutDir, { recursive: true });
  const framesDir = path.join(process.cwd(), 'screenshots', 'anim-frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1120, height: 760, deviceScaleFactor: 2.5 });

  const html = htmlFor({});
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await generateFrames(page, framesDir);
  await browser.close();

  // Encode to WebM
  const outWebm = path.join(docsOutDir, 'dashboard-tour.webm');
  await encodeFFmpeg({ framesDir, outWebm, fps: 12 });

  // Optional GIF (may be large); attempt, ignore failure if codec not present
  try{
    const outGif = path.join(docsOutDir, 'dashboard-tour.gif');
    await new Promise((resolve, reject) => {
      const args = [
        '-y', '-i', path.join(framesDir, 'frame_%04d.png'),
        '-vf', 'fps=10,scale=960:-1:flags=lanczos', outGif
      ];
      const proc = spawn(ffmpegPath, args, { stdio: 'inherit' });
      proc.on('exit', code => code===0 ? resolve() : reject(new Error('gif encode failed '+code)));
    });
  }catch(_){ /* ignore */ }

  console.log('Saved', outWebm);
}

if (require.main === module){
  run().catch(err => { console.error('snapshot-anim failed', err); process.exit(1); });
}
