#!/usr/bin/env node
// DeadLink telemetry report generator
// Usage examples (PowerShell):
//   node scripts/telemetry-report.js --input .\logs\telemetry-events.jsonl --since 7d --out txt
//   node scripts/telemetry-report.js --out html --output .\logs\telemetry-report.html

const fs = require('fs');
const path = require('path');
const minimist = require('minimist');

function parseSince(s) {
  if (!s) return 30 * 24 * 60 * 60 * 1000; // default 30d
  if (typeof s === 'number') return s;
  const m = String(s).trim().match(/^(\d+)([smhdw])$/i);
  if (!m) return Number(s) || 0;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : unit === 'd' ? 86400000 : 604800000;
  return n * mult;
}

function safeReadLines(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  } catch (_) { return []; }
}

function loadEvents(inputPath, sinceMs) {
  const now = Date.now();
  const cutoff = now - sinceMs;
  const lines = safeReadLines(inputPath);
  const events = [];
  for (const line of lines) {
    try {
      const j = JSON.parse(line);
      const ts = j && j.event && Number(j.event.ts);
      if (!ts || ts < cutoff) continue;
      events.push(j);
    } catch (_) {}
  }
  return events;
}

function groupBy(array, keyFn) {
  const m = new Map();
  for (const it of array) {
    const k = keyFn(it);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function toTable(map) {
  return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}\t${v}`).join('\n');
}

function byDay(ts) { return new Date(ts).toISOString().slice(0,10); }

function buildReport(events) {
  const totals = { count: events.length };
  const byType = groupBy(events, e => e.event && e.event.type || 'unknown');
  const byVersion = groupBy(events, e => (e.app && e.app.version) || 'unknown');
  const byPlatform = groupBy(events, e => `${(e.runtime&&e.runtime.platform)||'unk'}-${(e.runtime&&e.runtime.arch)||'unk'}`);
  const byNode = groupBy(events, e => (e.runtime && e.runtime.node) || 'unknown');
  const byInstance = groupBy(events, e => (e.instance && e.instance.id) || 'unknown');
  const byDayCounts = new Map();
  const byDayHour = new Map(); // day -> [24]
  for (const e of events) {
    const k = byDay(e.event.ts);
    byDayCounts.set(k, (byDayCounts.get(k)||0)+1);
    const d = new Date(e.event.ts);
    const hr = d.getHours();
    const arr = byDayHour.get(k) || new Array(24).fill(0);
    arr[hr] = (arr[hr]||0)+1;
    byDayHour.set(k, arr);
  }
  // Hour-of-day histogram (local time)
  const byHour = new Array(24).fill(0);
  for (const e of events) {
    const d = new Date(e.event.ts);
    const hr = d.getHours();
    if (hr >= 0 && hr < 24) byHour[hr]++;
  }
  const features = { devMode:0, updates:0, bloodMoon:0, chartsPng:0 };
  for (const e of events) {
    const f = e.features || {};
    if (f.devMode) features.devMode++;
    if (f.updates) features.updates++;
    if (f.bloodMoon) features.bloodMoon++;
    if (f.chartsPng) features.chartsPng++;
  }
  // Period bounds
  let minTs = null, maxTs = null;
  for (const e of events) {
    const t = e && e.event && e.event.ts;
    if (!t) continue;
    if (minTs == null || t < minTs) minTs = t;
    if (maxTs == null || t > maxTs) maxTs = t;
  }
  const period = {
    from: minTs ? new Date(minTs).toISOString() : null,
    to: maxTs ? new Date(maxTs).toISOString() : null,
    days: byDayCounts.size
  };
  // Rate (events/hour) based on span, guarding zero
  const spanMs = (maxTs && minTs) ? Math.max(1, maxTs - minTs) : 0;
  const eventsPerHour = spanMs ? Math.round((totals.count / (spanMs/3600000)) * 10) / 10 : totals.count;
  // Recent events (newest first, keep up to 30)
  const recent = events
    .slice()
    .sort((a,b) => (b.event.ts||0) - (a.event.ts||0))
    .slice(0, 30)
    .map(e => ({ ts: e.event.ts, type: e.event.type }));

  // Insights
  let busiestDay = null;
  for (const [k,v] of byDayCounts.entries()) {
    if (!busiestDay || v > busiestDay.count) busiestDay = { day: k, count: v };
  }
  let peakHour = null;
  for (let i=0;i<byHour.length;i++) {
    const v = byHour[i];
    if (!peakHour || v > peakHour.count) peakHour = { hour: i, count: v };
  }
  let topType = null;
  for (const [k,v] of byType.entries()) {
    if (!topType || v > topType.count) topType = { type: k, count: v };
  }
  const lastEventAgoMs = maxTs ? Math.max(0, Date.now() - maxTs) : null;
  // Streak: longest consecutive days with any events
  const sortedDays = Array.from(byDayCounts.keys()).sort();
  let longestStreak = 0, cur = 0, prev = null;
  for (const d of sortedDays) {
    if (prev) {
      const next = new Date(prev);
      next.setUTCDate(next.getUTCDate()+1);
      const expect = next.toISOString().slice(0,10);
      if (d === expect) cur += 1; else cur = 1;
    } else cur = 1;
    if (cur > longestStreak) longestStreak = cur;
    prev = d;
  }

  return { totals, byType, byVersion, byPlatform, byNode, byInstance, byDayCounts, byDayHour, byHour, features, period, recent, busiestDay, peakHour, topType, lastEventAgoMs, eventsPerHour, longestStreak };
}

function renderText(rep) {
  const lines = [];
  lines.push(`Events: ${rep.totals.count}`);
  lines.push('');
  lines.push('[Events by type]');
  lines.push(toTable(rep.byType));
  lines.push('');
  lines.push('[Events per day]');
  lines.push(toTable(rep.byDayCounts));
  lines.push('');
  lines.push('[App versions]');
  lines.push(toTable(rep.byVersion));
  lines.push('');
  lines.push('[Platforms]');
  lines.push(toTable(rep.byPlatform));
  lines.push('');
  lines.push('[Node versions]');
  lines.push(toTable(rep.byNode));
  lines.push('');
  lines.push('[Feature signals (counts where true)]');
  lines.push(Object.entries(rep.features).map(([k,v])=>`${k}\t${v}`).join('\n'));
  return lines.join('\n');
}

function renderMarkdown(rep) {
  const code = (t) => '``'+'`\n'+t+'\n``'+'`';
  return [
    `# DeadLink Telemetry Report`,
    `Events: ${rep.totals.count}`,
    '',
    '## Events by type',
    code(toTable(rep.byType)),
    '',
    '## Events per day',
    code(toTable(rep.byDayCounts)),
    '',
    '## App versions',
    code(toTable(rep.byVersion)),
    '',
    '## Platforms',
    code(toTable(rep.byPlatform)),
    '',
    '## Node versions',
    code(toTable(rep.byNode)),
    '',
    '## Feature signals (true counts)',
    code(Object.entries(rep.features).map(([k,v])=>`${k}\t${v}`).join('\n'))
  ].join('\n');
}

function renderHtml(rep) {
  const title = 'DeadLink Telemetry Report';
  const dayLabels = Array.from(rep.byDayCounts.keys()).sort();
  const dayValues = dayLabels.map(k => rep.byDayCounts.get(k));
  const types = Array.from(rep.byType.entries()).sort((a,b)=>b[1]-a[1]);
  const typeLabels = types.map(t => t[0]);
  const typeValues = types.map(t => t[1]);
  const avgPerDay = rep.period.days ? Math.round((rep.totals.count / rep.period.days) * 10) / 10 : rep.totals.count;
  const instancesCount = rep.byInstance ? Array.from(rep.byInstance.keys()).length : 0;

  const style = `
    :root{--bg:#0f1117;--card:#151a24;--muted:#9aa7b2;--fg:#e6edf3;--accent:#06b6d4;--accent2:#f472b6}
    *{box-sizing:border-box}
    body{margin:0;background:linear-gradient(180deg,#0f1117,#0c0f14);color:var(--fg);font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
    .wrap{max-width:1100px;margin:0 auto;padding:18px}
    .topnav{position:sticky;top:0;z-index:3;background:rgba(15,17,23,.85);backdrop-filter:blur(6px);border-bottom:1px solid #22314e;margin: -18px -18px 12px -18px;padding:10px 18px;display:flex;align-items:center;justify-content:space-between}
    .topnav .brand{display:flex;align-items:center;gap:10px;color:var(--fg);font-weight:600}
    .topnav img.logo{height:22px;width:auto;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))}
    .topnav .links a{color:var(--fg);text-decoration:none;margin-left:10px;padding:6px 10px;border-radius:6px}
    .topnav .links a:hover{background:#11203c}
    h1{margin:0 0 8px 0;color:var(--accent)} h2{margin-top:28px;color:var(--accent)}
    .muted{color:var(--muted)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:12px 0}
    .card{background:var(--card);padding:12px 14px;border-radius:10px;border:1px solid #1f2a44}
    .stat{font-size:22px;font-weight:700;text-align:center}
    .grid.stats .card{ text-align:center }
    .chart{background:var(--card);border:1px solid #1f2a44;border-radius:12px;padding:12px}
    svg{width:100%;height:220px;display:block}
    table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid #1f2a44;border-radius:10px;overflow:hidden}
    th,td{padding:8px 10px;border-bottom:1px solid #1f2a44}
    thead{background:#15223d}
    tr:nth-child(even){background:#0f1830}
    pre{background:var(--card);padding:10px;border-radius:8px;border:1px solid #1c2633;color:var(--fg)}
    .bars{display:flex;flex-direction:column;gap:8px}
    .bar{display:flex;align-items:center;gap:8px}
    .bar .label{min-width:140px;color:var(--fg)}
    .bar .track{flex:1;height:16px;background:#0e1a30;border:1px solid #1f2a44;border-radius:10px;overflow:hidden}
    .bar .fill{height:100%;background:linear-gradient(90deg,var(--accent2),var(--accent))}
  .bar .val{width:60px;text-align:right;color:var(--muted)}
  .subtle{font-size:12px;color:var(--muted)}
  .insights{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:12px 0}
  .mini svg{height:80px}
  .heatmap{display:grid;grid-template-columns:repeat(25,1fr);gap:6px;align-items:center}
  .heatmap .day{grid-column:1/2;color:var(--muted);font-size:12px}
  .heatmap .cells{grid-column:2/26;display:grid;grid-template-columns:repeat(24,1fr);gap:2px}
  .cell{height:14px;border-radius:3px;background:#0e141d;border:1px solid #1b2430}
  .cell[data-x>="1"]{background:#0a3a40}
  .cell[data-x>="2"]{background:#0e5a63}
  .cell[data-x>="4"]{background:#0f7a7d}
  .cell[data-x>="8"]{background:#0f9b98}
  .cell[data-x>="16"]{background:#11bcb3}
  /* Single-row 24h strip */
  .strip{display:grid;grid-template-columns:repeat(24,1fr);gap:2px}
  .strip .cell{height:18px}
  .tips{background:var(--card);border:1px dashed #2a3a4f;padding:10px 12px;border-radius:8px;margin-top:8px}
  /* Tooltips */
  .tt{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;border:1px solid #2a3a4f;color:#9aa7b2;font-size:11px;margin-left:6px;cursor:default;position:relative}
  .tt::after{content:attr(data-tip);position:absolute;left:50%;transform:translateX(-50%);bottom:120%;background:#0e141d;border:1px solid #1c2633;color:var(--fg);padding:6px 8px;border-radius:6px;white-space:pre-wrap;min-width:180px;max-width:280px;opacity:0;pointer-events:none;transition:opacity .12s;box-shadow:0 4px 14px rgba(0,0,0,.45)}
  .tt:hover::after{opacity:1}
  /* Collapsibles */
  details{background:var(--card);border:1px solid #1c2633;border-radius:8px;margin:10px 0}
  summary{list-style:none;padding:10px 12px;cursor:pointer;color:var(--fg);display:flex;align-items:center;gap:8px}
  summary::-webkit-details-marker{display:none}
  summary .badge{background:#162132;color:var(--fg);border:1px solid #1c2633;border-radius:999px;padding:2px 8px;font-size:12px}
  details > div{padding:8px 10px}
  `;
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const short = (s) => String(s||'').length>10 ? String(s).slice(0,8)+'…' : String(s||'');
  const table = (map) => '<table><thead><tr><th>Key</th><th>Count</th></tr></thead><tbody>'+
    Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')+
    '</tbody></table>';

  const emptyState = rep.totals.count === 0 ? '<p class="muted">No events in the selected period.</p>' : '';

  // Inline SVG sparkline for per-day
  function sparkline(labels, values, opts={}) {
    const w = opts.width || 920, h = opts.height || 200, pad = opts.pad || 10;
    if (!values.length) return `<div class="chart" style="height:${h+2*pad}px;display:flex;align-items:center;justify-content:center"><span class=muted>No data</span></div>`;
    const max = Math.max.apply(null, values);
    const min = 0;
    const dx = (w - 2*pad) / Math.max(values.length - 1, 1);
    const scaleY = (v) => h - (v - min) * (h / (max - min || 1));
    const pts = values.map((v,i) => `${pad + i*dx},${pad + scaleY(v)}`).join(' ');
    const circles = values.map((v,i)=>`<circle cx="${pad + i*dx}" cy="${pad + scaleY(v)}" r="2.5" fill="#00c2c7"/>`).join('');
    return `<div class="chart ${opts.mini ? 'mini' : ''}"><svg viewBox="0 0 ${w} ${h+2*pad}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,194,199,0.35)"/>
          <stop offset="100%" stop-color="rgba(0,194,199,0.02)"/>
        </linearGradient>
      </defs>
      <polyline fill="none" stroke="#00c2c7" stroke-width="2" points="${pts}"/>
      ${circles}
    </svg></div>`;
  }

  // CSS-based horizontal bars for event types
  function typeBars(labels, values) {
    if (!values.length) return '<p class="muted">No event types available.</p>';
    const max = Math.max.apply(null, values) || 1;
    const rows = labels.map((lab, i) => {
      const pct = Math.max(2, Math.round(values[i] / max * 100));
  const tip = `${esc(lab)}: ${values[i]} events (${Math.round(values[i]/(rep.totals.count||1)*100)}%)`;
  return `<div class="bar" title="${tip}"><div class="label">${esc(lab)}</div><div class="track"><div class="fill" style="width:${pct}%"></div></div><div class="val">${values[i]} <span class="subtle">(${Math.round(values[i]/(rep.totals.count||1)*100)}%)</span></div></div>`;
    }).join('');
    return `<div class="chart"><div class="bars">${rows}</div></div>`;
  }

  // Hour-of-day histogram (0..23)
  function hourBars(hourCounts) {
    const max = Math.max.apply(null, hourCounts) || 1;
    const rows = hourCounts.map((v, hr) => {
      const label = String(hr).padStart(2,'0')+':00';
      const pct = Math.max(2, Math.round(v / max * 100));
      return `<div class="bar"><div class="label">${label}</div><div class="track"><div class="fill" style="width:${pct}%"></div></div><div class="val">${v}</div></div>`;
    }).join('');
    return `<div class="chart"><div class="bars">${rows}</div></div>`;
  }

  // 7x24 heatmap (up to 7 days)
  function heatmap(days, byDayHour) {
    if (!days.length) return '';
    const rows = days.map(day => {
      const arr = byDayHour.get(day) || new Array(24).fill(0);
  const cells = arr.map((v,hr) => `<div class="cell" data-x="${v}" title="${day} ${String(hr).padStart(2,'0')}:00 — ${v} event${v===1?'':'s'}"></div>`).join('');
      return `<div class="day">${day}</div><div class="cells">${cells}</div>`;
    }).join('');
    return `<div class="chart"><div class="heatmap">${rows}</div><div class="subtle" style="margin-top:6px">0-23h local time →</div></div>`;
  }

  // Compact 24h strip for single-day/hour-of-day view
  function hourStrip(hourCounts) {
    const cells = hourCounts.map((v,hr) => `<div class="cell" data-x="${v}" title="${String(hr).padStart(2,'0')}:00 — ${v} event${v===1?'':'s'}"></div>`).join('');
    return `<div class="chart"><div class="strip">${cells}</div><div class="subtle" style="margin-top:6px">0-23h local time →</div></div>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${style}</style></head>
  <body><div class="wrap">
  <div class="topnav">
    <div class="brand"><img class="logo" src="/assets/deadlink-logo.png" alt="DeadLink logo"/> DeadLink</div>
    <div class="links">${(() => {
      const links = [
        '<a href="#overview">Overview</a>',
        '<a href="#trend">Daily/Hourly</a>',
        '<a href="#types">Types</a>'
      ];
      if (instancesCount > 1) links.push('<a href="#instances">Instances</a>');
      links.push('<a href="#versions">Versions</a>','<a href="#platforms">Platforms</a>','<a href="#node">Node</a>','<a href="#features">Features</a>','<a href="#recent">Recent</a>');
      return links.join('');
    })()}</div>
  </div>
  <h1 id="overview">${title}</h1>
  <div class="muted">${rep.period.from ? esc(rep.period.from) : '-'} → ${rep.period.to ? esc(rep.period.to) : '-'} • Days: ${rep.period.days}</div>
  ${instancesCount <= 1
    ? '<div class="tips" style="margin-top:10px">Local-only: generated from this instance\'s telemetry file.</div>'
    : `<div class="tips" style="margin-top:10px">Aggregated across ${instancesCount} instances (anonymous). Use separate files or filters for per-environment segmentation.</div>`}

  <div class="grid">
    <div class="card"><div class="muted">Events <span class="tt" data-tip="Total events observed in the selected time window.">i</span></div><div class="stat">${rep.totals.count}</div></div>
    <div class="card"><div class="muted">Event types <span class="tt" data-tip="Unique event names captured (e.g., startup, channel_bound).">i</span></div><div class="stat">${types.length}</div></div>
    <div class="card"><div class="muted">App versions <span class="tt" data-tip="Number of DeadLink versions reported by clients during this window.">i</span></div><div class="stat">${Array.from(rep.byVersion.keys()).length}</div></div>
    <div class="card"><div class="muted">Platforms <span class="tt" data-tip="Unique OS/arch combos (platform-arch).">i</span></div><div class="stat">${Array.from(rep.byPlatform.keys()).length}</div></div>
    <div class="card"><div class="muted">Avg / day <span class="tt" data-tip="Total events divided by active days with any events.">i</span></div><div class="stat">${avgPerDay}</div></div>
    <div class="card"><div class="muted">Events / hour <span class="tt" data-tip="Rate across the period span, not just active hours.">i</span></div><div class="stat">${rep.eventsPerHour}</div></div>
    <div class="card"><div class="muted">Active days <span class="tt" data-tip="Days with >=1 event in the selected window.">i</span></div><div class="stat">${rep.period.days}</div></div>
  <div class="card"><div class="muted">Best streak <span class="tt" data-tip="Longest run of consecutive days with activity.">i</span></div><div class="stat">${rep.longestStreak||0}d</div></div>
  <div class="card"><div class="muted">Instances <span class="tt" data-tip="Unique anonymous instance IDs reporting in this window.">i</span></div><div class="stat">${instancesCount}</div></div>
  </div>

  <div class="insights">
    <div class="card"><div class="muted">Peak hour</div><div class="stat">${rep.peakHour ? String(rep.peakHour.hour).padStart(2,'0')+':00' : '-'}</div><div class="muted">${rep.peakHour ? rep.peakHour.count + ' events' : ''}</div></div>
    <div class="card"><div class="muted">Busiest day</div><div class="stat">${rep.busiestDay ? rep.busiestDay.day : '-'}</div><div class="muted">${rep.busiestDay ? rep.busiestDay.count + ' events' : ''}</div></div>
    <div class="card"><div class="muted">Top event</div><div class="stat">${rep.topType ? esc(rep.topType.type) : '-'}</div><div class="muted">${rep.topType ? rep.topType.count + ' ('+Math.round(rep.topType.count/(rep.totals.count||1)*100)+'%)' : ''}</div></div>
    <div class="card"><div class="muted">Last event</div><div class="stat">${rep.lastEventAgoMs!=null ? Math.floor(rep.lastEventAgoMs/60000) + 'm ago' : '-'}</div><div class="muted">${rep.period.to ? esc(rep.period.to) : ''}</div></div>
  </div>

  ${dayLabels.length > 0 ? sparkline(dayLabels, dayValues, {height:80, mini:true}) : ''}

  ${rep.totals.count < 15 || dayLabels.length < 2 ? `<div class="tips"><strong>Low data tips</strong><ul>
    <li>Try a longer window: <code>npm run telemetry:report -- --since 30d</code></li>
    <li>Generate local events: <code>npm run telemetry:smoke</code> or <code>npm run telemetry:send</code></li>
    <li>Ensure analytics are enabled in config or env <code>DEADLINK_ANALYTICS=1</code></li>
  </ul></div>` : ''}

  <h2 id="trend">${dayLabels.length > 1 ? 'Events per day' : 'Events per hour (local)'} <span class="tt" data-tip="Daily totals if multiple days are present; otherwise the distribution across hours of the day (local time).">i</span></h2>
  ${emptyState || (dayLabels.length > 1 ? sparkline(dayLabels, dayValues) : hourStrip(rep.byHour))}

  ${dayLabels.length && dayLabels.length <= 7 ? `<h2>Activity heatmap (last ${dayLabels.length} day${dayLabels.length>1?'s':''})</h2>` + heatmap(dayLabels, rep.byDayHour) : ''}

  <h2 id="types">Events by type <span class="tt" data-tip="Relative frequency of event names in this window.">i</span></h2>
  ${typeBars(typeLabels, typeValues)}
  <div class="subtle" style="margin-top:6px">Each bar shows how often an event occurred during this window. Percentages are relative to total events.</div>

  ${instancesCount > 1 ? `<details id="instances" ${instancesCount<=5?'open':''}><summary>Instances <span class="badge">${instancesCount}</span></summary><div>
    <div class="subtle" style="margin-bottom:6px">Instance IDs are truncated for readability.</div>
    ${(() => {
      const rows = Array.from(rep.byInstance.entries()).sort((a,b)=>b[1]-a[1]).slice(0,100).map(([id,c])=>`<tr><td title="${esc(id)}">${esc(short(id))}</td><td>${c}</td></tr>`).join('');
      return `<table><thead><tr><th>Instance</th><th>Events</th></tr></thead><tbody>${rows}</tbody></table>`;
    })()}
  </div></details>` : ''}

  <div id="recent"></div>
  ${rep.recent && rep.recent.length ? `<details ${rep.recent.length<=10?'open':''}><summary>Recent events <span class="badge">${rep.recent.length}</span></summary><div>` + '<table><thead><tr><th>Time</th><th>Type</th></tr></thead><tbody>'+ rep.recent.map(r=>`<tr><td>${esc(new Date(r.ts).toISOString())}</td><td>${esc(r.type||'')}</td></tr>`).join('') + '</tbody></table>' + '</div></details>' : '<p class="muted">No recent events.</p>'}

  <details id="versions" ${Array.from(rep.byVersion.keys()).length<=3?'open':''}><summary>App versions <span class="badge">${Array.from(rep.byVersion.keys()).length}</span></summary><div>${table(rep.byVersion)}</div></details>
  <details id="platforms" ${Array.from(rep.byPlatform.keys()).length<=2?'open':''}><summary>Platforms <span class="badge">${Array.from(rep.byPlatform.keys()).length}</span></summary><div>${table(rep.byPlatform)}</div></details>
  <details id="node" ${Array.from(rep.byNode.keys()).length<=2?'open':''}><summary>Node versions <span class="badge">${Array.from(rep.byNode.keys()).length}</span></summary><div>${table(rep.byNode)}</div></details>
  <h2 id="features">Feature signals <span class="tt" data-tip="Boolean indicators derived from events (e.g., dev mode enabled, updates checked). Counted when true.">i</span></h2>
  ${(() => {
    const rows = Object.entries(rep.features)
      .sort((a,b)=>b[1]-a[1])
      .map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v}</td><td>${rep.totals.count?Math.round(v/(rep.totals.count)*100):0}%</td></tr>`)
      .join('');
    return `<table><thead><tr><th>Feature</th><th>True count</th><th>% of events</th></tr></thead><tbody>${rows}</tbody></table>`;
  })()}
  <div class="subtle" style="margin-top:6px">Signals are derived from event payloads and represent feature usage flags within this period.</div>
  <div class="muted" style="margin-top:10px">Generated ${new Date().toISOString()}</div>
  </div></body></html>`;
}

function main() {
  const argv = minimist(process.argv.slice(2));
  const input = argv.input || argv.i || path.resolve(process.cwd(), 'logs', 'telemetry-events.jsonl');
  const since = parseSince(argv.since || argv.s);
  const out = String(argv.out || argv.format || 'txt').toLowerCase();
  const outFile = argv.output || argv.o;
  const events = loadEvents(input, since);
  const rep = buildReport(events);
  let content = '';
  if (out === 'md' || out === 'markdown') content = renderMarkdown(rep);
  else if (out === 'html') content = renderHtml(rep);
  else content = renderText(rep);
  if (outFile) {
    try { fs.writeFileSync(outFile, content); console.log(`Wrote ${outFile}`); } catch (e) { console.error('Failed to write output:', e.message || e); }
  } else {
    console.log(content);
  }
}

if (require.main === module) main();
