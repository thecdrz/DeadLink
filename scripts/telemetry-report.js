#!/usr/bin/env node
// DeadLink telemetry report generator
// Usage examples (PowerShell):
//   node scripts/telemetry-report.js --input .\logs\telemetry-events.jsonl --since 7d --out txt
//   node scripts/telemetry-report.js --out html --output .\logs\telemetry-report.html

const fs = require('fs');
const path = require('path');
const { safeReadLines, safeReadJson, safeWriteFile } = require('../lib/fs-utils');
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

// reuse safeReadLines/safeReadJson from lib/fs-utils
function readJSONSafe(file) { return safeReadJson(file, null); }

function quantile(sortedArr, q) {
  if (!sortedArr.length) return 0;
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedArr[base + 1] !== undefined) {
    return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
  } else {
    return sortedArr[base];
  }
}

function humanizeKey(k) {
  // Convert snake_case or camelCase into label and unit guess
  const u = /(_ms|_pct|_mb|_sec)$/i.exec(k);
  const unit = u ? u[1].toLowerCase() : '';
  const base = k.replace(/[_-]([a-z])/g, (_,c)=>' '+c.toUpperCase()).replace(/([a-z])([A-Z])/g,'$1 $2');
  const label = base.replace(/_ms|_pct|_mb|_sec/ig,'').replace(/^./,c=>c.toUpperCase());
  return { label: label.trim(), unit: unit.replace(/^_/,'') };
}

function gatherMetrics(events) {
  const arrays = new Map();
  const consider = (name, val) => {
    if (typeof val !== 'number' || !isFinite(val)) return;
    if (!/_ms$|_pct$|_mb$|_sec$|latency|ping|queue|duration|time/i.test(name)) return; // heuristic
    arrays.set(name, (arrays.get(name)||[]).concat(val));
  };
  const walk = (obj, prefix, depth) => {
    if (!obj || typeof obj !== 'object' || depth>2) return;
    for (const [k,v] of Object.entries(obj)) {
      const name = prefix ? `${prefix}_${k}` : k;
      if (typeof v === 'number') consider(name, v);
      else if (typeof v === 'object') walk(v, name, depth+1);
    }
  };
  for (const e of events) {
    // Prioritize common nests first
    if (e.metrics) walk(e.metrics, '', 0);
    if (e.performance) walk(e.performance, '', 0);
    if (e.net) walk(e.net, '', 0);
    if (e.telnet) walk(e.telnet, 'telnet', 0);
    if (e.discord) walk(e.discord, 'discord', 0);
    // Fallback: shallow scan of event payload
    if (e.event) walk(e.event, 'event', 0);
  }
  const summaries = [];
  for (const [key, arr] of arrays.entries()) {
    const a = arr.slice().sort((x,y)=>x-y);
    const avg = a.reduce((s,n)=>s+n,0) / a.length;
    const med = quantile(a, 0.5);
    const p90 = quantile(a, 0.9);
    const p99 = quantile(a, 0.99);
    const { label, unit } = humanizeKey(key);
    summaries.push({ key, label, unit, count: a.length, min: a[0], max: a[a.length-1], avg, median: med, p90, p99 });
  }
  // Sort by sample size, then by key
  summaries.sort((a,b)=> (b.count - a.count) || a.key.localeCompare(b.key));
  return summaries;
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
  const byType = groupBy(events, e => (e.event && e.event.type) || 'unknown');
  const byVersion = groupBy(events, e => (e.app && e.app.version) || 'unknown');
  const byPlatform = groupBy(events, e => `${(e.runtime && e.runtime.platform) || 'unk'}-${(e.runtime && e.runtime.arch) || 'unk'}`);
  const byNode = groupBy(events, e => (e.runtime && e.runtime.node) || 'unknown');
  const byInstance = groupBy(events, e => (e.instance && e.instance.id) || 'unknown');

  const byDayCounts = new Map();
  const byDayHour = new Map();
  const byHour = new Array(24).fill(0);
  const features = { devMode: 0, updates: 0, bloodMoon: 0, chartsPng: 0 };

  let minTs = null, maxTs = null;
  for (const e of events) {
    const ts = e && e.event && e.event.ts;
    if (!ts) continue;

    const day = byDay(ts);
    byDayCounts.set(day, (byDayCounts.get(day) || 0) + 1);

    const d = new Date(ts);
    const hr = d.getHours();
    byHour[hr] = (byHour[hr] || 0) + 1;
    let arr = byDayHour.get(day);
    if (!arr) { arr = new Array(24).fill(0); byDayHour.set(day, arr); }
    arr[hr]++;

    if (minTs == null || ts < minTs) minTs = ts;
    if (maxTs == null || ts > maxTs) maxTs = ts;

    const f = e.feature || e.features || {};
    if (f.devMode) features.devMode++;
    if (f.updates) features.updates++;
    if (f.bloodMoon) features.bloodMoon++;
    if (f.chartsPng) features.chartsPng++;
  }

  // version first-seen day
  const versionFirstDay = new Map();
  const seenVersions = new Set();
  const sortedByTs = events.slice().sort((a,b)=> (a.event.ts||0) - (b.event.ts||0));
  for (const e of sortedByTs) {
    const ver = (e.app && e.app.version) || 'unknown';
    if (!seenVersions.has(ver)) {
      seenVersions.add(ver);
      versionFirstDay.set(ver, byDay(e.event.ts));
    }
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

  // Numeric metrics
  const metrics = gatherMetrics(events);

  // Test results / coverage (best-effort: look for jest output/coverage-summary.json)
  const testSummary = (() => {
    const out = { suites: null, tests: null, passed: null, failed: null, time: null };
    const jestJson = readJSONSafe(path.resolve(process.cwd(), 'logs', 'jest-last-run.json'))
                  || readJSONSafe(path.resolve(process.cwd(), 'jest-results.json'));
    if (jestJson && jestJson.numTotalTests != null) {
      out.suites = jestJson.numTotalTestSuites;
      out.tests = jestJson.numTotalTests;
      out.passed = jestJson.numPassedTests;
      out.failed = jestJson.numFailedTests;
      out.time = jestJson.startTime ? new Date(jestJson.startTime).toISOString() : null;
    }
    return out;
  })();

  const coverage = readJSONSafe(path.resolve(process.cwd(), 'coverage', 'coverage-summary.json')) || null;

  return { totals, byType, byVersion, byPlatform, byNode, byInstance, byDayCounts, byDayHour, byHour, features, period, recent, busiestDay, peakHour, topType, lastEventAgoMs, eventsPerHour, longestStreak, versionFirstDay, metrics, testSummary, coverage };
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
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    /* Modern CSS Custom Properties */
    :root {
      /* Colors */
      --bg-primary: #0c0f14;
      --bg-secondary: #1e293b;
      --glass: rgba(30, 41, 59, 0.4);
      --border: rgba(51, 65, 85, 0.6);
      --border-hover: rgba(51, 65, 85, 0.8);
      
      /* Text */
      --text-primary: #f1f5f9;
      --text-secondary: #cbd5e1;
      --text-muted: #94a3b8;
      
      /* Accent colors */
      --primary: #3b82f6;
      --primary-muted: rgba(59, 130, 246, 0.2);
      --success: #10b981;
      --success-text: #34d399;
      --warning: #f59e0b;
      --warning-text: #fbbf24;
      --danger: #ef4444;
      --danger-text: #f87171;
      
      /* Shadows */
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      
      /* Typography */
      --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
      --font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
      
      /* Legacy support */
      --bg: var(--bg-primary);
      --card: var(--glass);
      --muted: var(--text-muted);
      --fg: var(--text-primary);
      --line: var(--border);
      --accent: var(--primary);
      --accent2: #a78bfa;
      --accentBar: var(--primary);
      --good: var(--success);
      --warn: var(--warning);
      --danger: var(--danger);
      --sys: #38bdf8;
      --flow: var(--warning);
      --feat: #06b6d4;
    }

    [data-theme="alt"] {
      --bg-primary: #0b0b10;
      --bg-secondary: #1a1a24;
      --glass: rgba(26, 26, 36, 0.6);
      --border: rgba(71, 85, 105, 0.6);
      --border-hover: rgba(71, 85, 105, 0.8);
      --text-primary: #e3e9ef;
      --text-secondary: #b8c5d1;
      --text-muted: #8b98a5;
      --primary: #06b6d4;
      --accent: #06b6d4;
      --accent2: #f472b6;
      --accentBar: #38bdf8;
    }

    /* Reset and Base Styles */
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-feature-settings: 'cv11', 'ss01';
      font-optical-sizing: auto;
      line-height: 1.6;
      min-height: 100vh;
    }

    .wrap {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }

    /* Navigation */
    .topnav {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(12, 15, 20, 0.8);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      margin: -2rem -2rem 1.5rem -2rem;
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .topnav .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: var(--text-primary);
      font-weight: 600;
      font-size: 1.125rem;
    }

    .topnav img.logo {
      height: 28px;
      width: auto;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    }

    .topnav .links a {
      color: var(--text-secondary);
      text-decoration: none;
      margin-left: 1rem;
      padding: 0.5rem 1rem;
      border-radius: 0.75rem;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .topnav .links a:hover {
      color: var(--text-primary);
      background: var(--glass);
    }

    .topnav .tools {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .theme-toggle {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 0.5rem 0.75rem;
      border-radius: 0.75rem;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .theme-toggle:hover {
      color: var(--text-primary);
      background: var(--glass);
      border-color: var(--border-hover);
    }

    /* Typography */
    h1 {
      margin: 0 0 1rem 0;
      color: var(--text-primary);
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: -0.025em;
    }

    h2 {
      margin: 2rem auto 1rem auto;
      color: var(--text-primary);
      width: min(1200px, 100%);
      font-size: 1.875rem;
      font-weight: 600;
      letter-spacing: -0.025em;
    }

    h2::after {
      content: "";
      display: block;
      height: 1px;
      background: linear-gradient(90deg, var(--border), transparent);
      margin-top: 1rem;
    }

    /* Hero Section */
    .hero {
      width: min(1200px, 100%);
      margin: 0 auto;
      padding: 2rem 0 1.5rem;
      text-align: center;
    }

    .hero h1 {
      background: linear-gradient(135deg, var(--text-primary) 0%, var(--primary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    /* Tabs */
    .tabs {
      width: min(1200px, 100%);
      margin: 1.5rem auto;
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      justify-content: center;
    }

    .tabs .tab {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 0.75rem 1.5rem;
      border-radius: 999px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }

    .tabs .tab::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.1), transparent);
      transition: left 0.5s ease;
    }

    .tabs .tab:hover::before {
      left: 100%;
    }

    .tabs .tab:hover {
      color: var(--text-primary);
      border-color: var(--border-hover);
      transform: translateY(-1px);
    }

    .tabs .tab.active {
      color: var(--text-primary);
      background: var(--glass);
      border-color: var(--primary);
      box-shadow: var(--shadow-md);
      backdrop-filter: blur(10px);
    }

    /* Utility Classes */
    .muted {
      color: var(--text-muted);
    }

    .group {
      margin-bottom: 2rem;
    }

    .hidden {
      display: none !important;
    }

    /* Grid Layouts */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
      margin: 1.5rem 0;
    }

    .grid.two {
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }

    /* Cards */
    .card {
      background: var(--glass);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 1.5rem;
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }

    .card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    }

    .card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg);
      border-color: var(--border-hover);
    }

    .stat {
      font-size: 1.875rem;
      font-weight: 700;
      text-align: center;
      color: var(--text-primary);
    }

    .grid.stats .card {
      text-align: center;
    }

    /* Charts */
    .chart {
      background: var(--glass);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 1.5rem;
      width: min(1200px, 100%);
      margin: 0 auto;
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
    }

    .chart:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    /* KPIs */
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      width: min(1200px, 100%);
      margin: 1rem auto 1.5rem;
    }

    .card.kpi {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      cursor: pointer;
      background: linear-gradient(135deg, var(--glass), rgba(30, 41, 59, 0.6));
    }

    .card.kpi:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-xl);
    }

    .kpi .lab {
      color: var(--text-muted);
      font-size: 0.875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .kpi .val {
      font-size: 2rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .kpi .delta {
      font-size: 0.875rem;
      color: var(--text-secondary);
      font-weight: 500;
    }

    .kpi .delta.up {
      color: var(--success-text);
    }

    .kpi .delta.down {
      color: var(--danger-text);
    }

    /* Workflow Funnel */
    .funnel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .frow {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem;
      border-radius: 0.75rem;
      transition: all 0.2s ease;
    }

    .frow:hover {
      background: rgba(30, 41, 59, 0.3);
    }

    .frow .flab {
      min-width: 160px;
      text-align: right;
      color: var(--text-secondary);
      font-weight: 500;
    }

    .frow .fbar {
      flex: 1;
      height: 20px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      border-radius: 999px;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }

    .frow .fbar i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, var(--primary), #60a5fa);
      border-radius: 999px;
      transition: all 0.3s ease;
    }

    .frow .fval {
      min-width: 70px;
      text-align: center;
      color: var(--text-primary);
      font-weight: 600;
    }

    /* SVG Styles */
    svg {
      width: 100%;
      height: 280px;
      display: block;
    }

    /* Tables */
    table {
      border-collapse: collapse;
      width: min(1200px, 100%);
      margin: 0 auto;
      background: var(--glass);
      border: 1px solid var(--border);
      border-radius: 1rem;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }

    th, td {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border);
      text-align: center;
    }

    th {
      background: rgba(30, 41, 59, 0.6);
      color: var(--text-primary);
      font-weight: 600;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    td {
      color: var(--text-secondary);
    }

    tr:hover {
      background: rgba(30, 41, 59, 0.3);
    }

    tr:last-child td {
      border-bottom: none;
    }

    /* Code */
    pre {
      background: var(--glass);
      padding: 1rem;
      border-radius: 0.75rem;
      border: 1px solid var(--border);
      color: var(--text-primary);
      font-family: var(--font-mono);
      backdrop-filter: blur(10px);
    }

    /* Bars */
    .bars {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem;
      border-radius: 0.75rem;
      transition: all 0.2s ease;
    }

    .bar:hover {
      background: rgba(30, 41, 59, 0.3);
    }

    .bar .label {
      min-width: 160px;
      color: var(--text-primary);
      text-align: center;
      font-weight: 500;
    }

    .bar .track {
      flex: 1;
      height: 16px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      border-radius: 999px;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }

    .bar .fill {
      height: 100%;
      background: linear-gradient(90deg, var(--primary), #60a5fa);
      border-radius: 999px;
      transition: all 0.3s ease;
    }

    .bar .val {
      width: 100px;
      text-align: center;
      color: var(--text-secondary);
      font-weight: 500;
    }

    /* Insights */
    .insights {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1.5rem;
      margin: 1.5rem 0;
    }

    /* Subtle text */
    .subtle {
      font-size: 0.875rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    /* Mini charts */
    .mini svg {
      height: 100px;
    }

    /* Heatmap */
    .heatmap {
      display: grid;
      grid-template-columns: repeat(25, 1fr);
      gap: 0.5rem;
      align-items: center;
    }

    .heatmap .day {
      grid-column: 1/2;
      color: var(--text-muted);
      font-size: 0.75rem;
      font-weight: 500;
    }

    .heatmap .cells {
      grid-column: 2/26;
      display: grid;
      grid-template-columns: repeat(24, 1fr);
      gap: 2px;
    }

    .cell {
      height: 16px;
      border-radius: 4px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      transition: all 0.2s ease;
    }

    .cell:hover {
      transform: scale(1.1);
      z-index: 10;
    }

    .cell[data-x="1"] { background: rgba(59, 130, 246, 0.2); }
    .cell[data-x="2"] { background: rgba(59, 130, 246, 0.4); }
    .cell[data-x="4"] { background: rgba(59, 130, 246, 0.6); }
    .cell[data-x="8"] { background: rgba(59, 130, 246, 0.8); }
    .cell[data-x="16"] { background: rgba(59, 130, 246, 1); }

    /* Strip layout */
    .strip {
      display: grid;
      grid-template-columns: repeat(24, 1fr);
      gap: 2px;
    }

    .strip .cell {
      height: 20px;
    }

    /* Legend */
    .legend {
      display: flex;
      gap: 1rem;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      font-size: 0.875rem;
      margin-top: 1rem;
    }

    .legend .swatch {
      display: inline-block;
      width: 16px;
      height: 12px;
      border-radius: 4px;
      border: 1px solid var(--border);
    }

    /* Tips */
    .tips {
      background: var(--glass);
      border: 1px dashed var(--border);
      padding: 1rem 1.5rem;
      border-radius: 1rem;
      margin-top: 1rem;
      backdrop-filter: blur(10px);
    }

    .tips ul {
      margin: 1rem 0 0 1.5rem;
      padding: 0;
    }

    .chart.empty {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100px;
      border: 1px dashed var(--border);
      color: var(--text-muted);
    }

    /* Tooltips */
    .tt {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.75rem;
      margin-left: 0.5rem;
      cursor: default;
      position: relative;
      transition: all 0.2s ease;
    }

    .tt:hover {
      border-color: var(--border-hover);
      color: var(--text-secondary);
    }

    .tt::after {
      content: attr(data-tip);
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      bottom: 130%;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid var(--border);
      color: var(--text-primary);
      padding: 0.75rem 1rem;
      border-radius: 0.75rem;
      white-space: pre-wrap;
      min-width: 200px;
      max-width: 320px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
      box-shadow: var(--shadow-lg);
      backdrop-filter: blur(10px);
    }

    .tt:hover::after {
      opacity: 1;
    }

    /* Collapsibles */
    details {
      background: var(--glass);
      border: 1px solid var(--border);
      border-radius: 1rem;
      margin: 1rem 0;
      backdrop-filter: blur(10px);
    }

    summary {
      list-style: none;
      padding: 1rem 1.5rem;
      cursor: pointer;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary:hover {
      background: rgba(30, 41, 59, 0.3);
    }

    summary .badge {
      background: rgba(30, 41, 59, 0.6);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.25rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
    }

    details > div {
      padding: 0 1.5rem 1.5rem;
    }

    /* Donut Gauges */
    .donuts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1.5rem;
      width: min(1200px, 100%);
      margin: 0 auto;
    }

    .donut {
      background: var(--glass);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
    }

    .donut:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg);
    }

    .donut svg {
      width: 100px;
      height: 100px;
    }

    .donut .lab {
      margin-top: 1rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    /* Section Headers */
    .sec {
      width: min(1200px, 100%);
      margin: 2rem auto 1rem auto;
    }

    .sec h2 {
      margin: 0;
      color: var(--text-primary);
      padding-left: 1rem;
      border-left: 4px solid var(--primary);
      border-radius: 0 0.25rem 0.25rem 0;
    }

    .sec.sys h2 { border-color: var(--sys); }
    .sec.flow h2 { border-color: var(--flow); }
    .sec.feat h2 { border-color: var(--feat); }
    .sec.quality h2 { border-color: var(--accent2); }

    /* Metric Table */
    .kv {
      width: min(1200px, 100%);
      margin: 0 auto;
    }

    .kv .hdr, .kv .row {
      display: grid;
      grid-template-columns: 1.2fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 1fr;
    }

    .kv .hdr > div, .kv .row > div {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border);
      text-align: center;
    }

    .kv .hdr {
      background: rgba(30, 41, 59, 0.6);
      font-weight: 600;
      position: sticky;
      top: 70px;
      z-index: 20;
      backdrop-filter: blur(10px);
    }

    .kv .srt {
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .kv .srt:hover {
      color: var(--primary);
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.75rem;
      font-weight: 600;
    }

    .segments {
      position: relative;
      height: 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: linear-gradient(to right, var(--success) 0 var(--g), var(--warning) var(--g) var(--y), var(--danger) var(--y) 100%);
      overflow: hidden;
    }

    .segments > i {
      position: absolute;
      top: -4px;
      width: 2px;
      height: 18px;
      background: var(--text-primary);
      border-radius: 1px;
      box-shadow: var(--shadow-sm);
    }

    /* Progress Bar */
    .pbar {
      height: 10px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      border-radius: 999px;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }

    .pbar i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, var(--primary), #60a5fa);
      border-radius: 999px;
      transition: all 0.3s ease;
    }

    /* Text Colors */
    .txt-good { color: var(--success-text); }
    .txt-warn { color: var(--warning-text); }
    .txt-danger { color: var(--danger-text); }
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
    const markers = Array.isArray(opts.markers) ? opts.markers : [];
    const marks = markers.map(m => {
      const x = pad + (m.index||0)*dx; const y1 = pad, y2 = pad + 12;
      return `<g><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#f472b6" stroke-width="1.5"/>`+
        (m.label?`<text x="${Math.min(w-40, x+3)}" y="${y2+12}" fill="#9aa7b2" font-size="10">${esc(m.label)}</text>`:'')+
      `</g>`;
    }).join('');
    return `<div class="chart ${opts.mini ? 'mini' : ''}"><svg viewBox="0 0 ${w} ${h+2*pad}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,194,199,0.35)"/>
          <stop offset="100%" stop-color="rgba(0,194,199,0.02)"/>
        </linearGradient>
      </defs>
      <polyline fill="none" stroke="#00c2c7" stroke-width="2" points="${pts}"/>
      ${circles}
      ${marks}
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
  const cells = arr.map((v,hr) => {
    const t = v>16? '16+' : v;
    return `<div class="cell" data-x="${v}" title="${day} ${String(hr).padStart(2,'0')}:00 — ${t} event${v===1?'':'s'}"></div>`;
  }).join('');
      return `<div class="day">${day}</div><div class="cells">${cells}</div>`;
    }).join('');

    const legend = `<div class="legend" aria-label="heatmap legend">`+
      `<span>0</span>`+
      `<span class="cell" data-x="1" style="width:14px;height:10px"></span><span>1</span>`+
      `<span class="cell" data-x="2" style="width:14px;height:10px"></span><span>2</span>`+
      `<span class="cell" data-x="4" style="width:14px;height:10px"></span><span>4</span>`+
      `<span class="cell" data-x="8" style="width:14px;height:10px"></span><span>8</span>`+
      `<span class="cell" data-x="16" style="width:14px;height:10px"></span><span>16+</span>`+
    `</div>`;
    return `<div class="chart"><div class="heatmap">${rows}</div><div class="subtle" style="margin-top:6px">0-23h local time →</div>${legend}</div>`;
  }

  // Compact 24h strip for single-day/hour-of-day view
  function hourStrip(hourCounts) {
    const total = (hourCounts||[]).reduce((a,b)=>a+(b||0),0);
    if (!total) {
      return `<div class="chart empty" title="No events recorded for any hour in this window.">No hourly activity</div>`;
    }
    const cells = hourCounts.map((v,hr) => {
      const t = v>16? '16+' : v;
      return `<div class="cell" data-x="${v}" title="${String(hr).padStart(2,'0')}:00 — ${t} event${v===1?'':'s'}"></div>`;
    }).join('');
    return `<div class="chart"><div class="strip">${cells}</div><div class="subtle" style="margin-top:6px">0-23h local time →</div></div>`;
  }

  // Donut gauge for features
  function donut(label, pct, count){
    const r = 22, c = Math.PI*2*r;
    const dash = Math.round((Math.max(0, Math.min(100, pct))/100)*c);
    return `<div class="donut" title="${esc(label)}: ${count} (${Math.round(pct)}%)">`
      + `<svg viewBox="0 0 60 60" aria-label="${esc(label)}">
        <g transform="translate(30,30)">
          <circle r="${r}" cx="0" cy="0" fill="none" stroke="#0e1a30" stroke-width="8"/>
          <circle r="${r}" cx="0" cy="0" fill="none" stroke="#06b6d4" stroke-width="8" stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90)"/>
          <text x="0" y="4" text-anchor="middle" fill="#e6edf3" font-size="12">${Math.round(pct)}%</text>
        </g>
      </svg>`
      + `<div class="lab">${esc(label)}</div>`
    + `</div>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${style}</style></head>
  <body><div class="wrap" id="root">
  <div class="topnav">
    <div class="brand"><img class="logo" src="assets/deadlink-logo.png" alt="DeadLink logo"/> DeadLink</div>
    <div class="links">${(() => {
      const links = [
        '<a href="#overview">Overview</a>',
        '<a href="#system">System</a>',
        '<a href="#workflow">Workflow</a>',
        '<a href="#features">Features</a>',
        '<a href="#quality">Quality</a>'
      ];
      if (instancesCount > 1) links.push('<a href="#instances">Instances</a>');
      links.push('<a href="#versions">Versions</a>','<a href="#platforms">Platforms</a>','<a href="#node">Node</a>','<a href="#types">Types</a>','<a href="#recent">Recent</a>');
      return links.join('');
    })()}</div>
    <div class="tools"><button class="theme-toggle" id="themeBtn" title="Toggle theme">Theme</button></div>
  </div>
  <script>(function(){
    var root=document.getElementById('root');
    var btn=document.getElementById('themeBtn');
    if(btn&&root){
      try{var pref=localStorage.getItem('dl-theme'); if(pref){root.setAttribute('data-theme',pref);} }catch(e){}
      btn.addEventListener('click',function(){
        var next = root.getAttribute('data-theme')==='alt' ? '' : 'alt';
        if(next){root.setAttribute('data-theme',next);} else {root.removeAttribute('data-theme');}
        try{localStorage.setItem('dl-theme',next);}catch(e){}
      });
    }
  })();</script>
  <div class="hero">
    <h1 id="overview">${title}</h1>
    <div class="muted">${rep.period.from ? esc(rep.period.from) : '-'} → ${rep.period.to ? esc(rep.period.to) : '-'} • Days: ${rep.period.days}</div>
    <div class="tabs" role="tablist">
      <button class="tab active" data-tab="t-overview">Overview</button>
      <button class="tab" data-tab="t-system">System</button>
      <button class="tab" data-tab="t-workflow">Workflow</button>
      <button class="tab" data-tab="t-quality">Quality</button>
      <button class="tab" data-tab="t-features">Features</button>
      <button class="tab" data-tab="t-explore">Explore</button>
    </div>
  </div>
  ${instancesCount <= 1
    ? '<div class="tips" style="margin-top:10px">Local-only: generated from this instance\'s telemetry file.</div>'
    : `<div class="tips" style="margin-top:10px">Aggregated across ${instancesCount} instances (anonymous). Use separate files or filters for per-environment segmentation.</div>`}
  ${(rep.totals.count < 15 || dayLabels.length < 2) ? `<details style="margin-top:10px"><summary>Low data tips</summary><div class="tips"><ul>
    <li>Try a longer window: <code>npm run telemetry:report -- --since 30d</code></li>
    <li>Generate local events: <code>npm run telemetry:smoke</code> or <code>npm run telemetry:send</code></li>
    <li>Ensure analytics are enabled in config or env <code>DEADLINK_ANALYTICS=1</code></li>
  </ul></div></details>` : ''}

  <div id="t-overview" class="group">
  <div class="kpis">
    <div class="card kpi" data-goto="t-workflow" title="Go to Workflow">
      <div class="lab">Events</div>
      <div class="val">${rep.totals.count}</div>
      <div class="delta">Across ${rep.period.days||0} day${rep.period.days===1?'':'s'}</div>
    </div>
    <div class="card kpi" data-goto="t-system" title="Go to System">
      <div class="lab">Peak hour</div>
      <div class="val">${rep.peakHour ? String(rep.peakHour.hour).padStart(2,'0')+':00' : '-'}</div>
      <div class="delta">${rep.peakHour?rep.peakHour.count+' events':''}</div>
    </div>
    <div class="card kpi" data-goto="t-quality" title="Go to Quality">
      <div class="lab">Test pass</div>
      <div class="val">${(rep.testSummary && rep.testSummary.tests!=null)? Math.round(((rep.testSummary.passed||0)/(rep.testSummary.tests||1))*100)+'%':'-'}</div>
      <div class="delta">Suites ${(rep.testSummary && rep.testSummary.suites!=null)?rep.testSummary.suites:'-'}</div>
    </div>
    <div class="card kpi" data-goto="t-features" title="Go to Features">
      <div class="lab">Top feature</div>
      <div class="val">${rep.topType ? esc(rep.topType.type) : '-'}</div>
      <div class="delta">${rep.topType ? Math.round(rep.topType.count/(rep.totals.count||1)*100)+'% of events' : ''}</div>
    </div>
  </div>
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
  </div>

  <div id="t-system" class="group hidden">
  <div class="sec sys" id="system"><h2>System health</h2></div>
  ${(() => {
    if (!rep.metrics || !rep.metrics.length) return '<p class="muted">No system metrics found.</p>';
    const formatVal = (unit,v) => {
      if (v==null || v===Infinity || v===-Infinity) return '-';
      if (unit==='ms') return Math.round(v)+' ms';
      if (unit==='pct') return Math.round(v)+'%';
      if (unit==='mb') return Math.round(v*10)/10+' MB';
      if (unit==='sec') return Math.round(v*10)/10+' s';
      return Math.round(v*10)/10;
    };
    const isTimey = (m)=> (m.unit==='ms' || m.unit==='sec' || /latency|ping|duration|time/i.test(m.key));
    const guessSla = (m)=>{
      if (m.unit==='ms'){ if (/ping|latency/i.test(m.key)) return { g:100, y:300 }; return { g:200, y:600 }; }
      if (m.unit==='sec'){ if (/ping|latency/i.test(m.key)) return { g:0.1, y:0.3 }; return { g:1, y:3 }; }
      if (m.unit==='pct') return { g:50, y:80 };
      if (m.unit==='mb') return { g:50, y:200 };
      return { g:m.median||0, y:m.p90||0 };
    };
    const rowHtml = (m) => {
      const unit = m.unit || '';
      const sla = guessSla(m);
      const maxRef = Math.max(m.p99||0, (sla.y||0)*1.5, (m.p90||0));
      const gP = maxRef? Math.min(96, Math.round((sla.g/maxRef)*100)) : 20;
      const yP = maxRef? Math.min(98, Math.max(gP+2, Math.round((sla.y/maxRef)*100))) : 70;
      const mark = maxRef? Math.min(100, Math.round((m.p90/maxRef)*100)) : 0;
      const visual = isTimey(m)
        ? `<div class="segments" style="--g:${gP}%;--y:${yP}%" title="p90 marker • good≤${formatVal(unit,sla.g)}, warn≤${formatVal(unit,sla.y)}"><i style="left:${mark}%"></i></div>`
        : `<div class="pbar" aria-label="p90 visual"><i style="width:${Math.min(100, Math.round((m.p90/(m.p99||m.p90||1))*100))}%"></i></div>`;
      return `<div class="row" data-label="${esc(m.label)}" data-count="${m.count}" data-median="${m.median}" data-p90="${m.p90}" data-p99="${m.p99}">`
        + `<div title="${esc(m.key)}">${esc(m.label)}</div>`
        + `<div>${m.count}</div>`
        + `<div>${formatVal(unit, m.min)}</div>`
        + `<div>${formatVal(unit, m.median)}</div>`
        + `<div>${formatVal(unit, m.p90)}</div>`
        + `<div>${formatVal(unit, m.p99)}</div>`
        + `<div>${visual}</div>`
      + `</div>`;
    };
    const rows = rep.metrics.slice(0, 24).map(rowHtml).join('');
    return `<div class="chart"><div class="kv" id="metrics">
      <div class="hdr"><div class="srt" data-sort="label" title="Sort by name">Metric</div><div class="srt" data-sort="count" title="Sort by samples">Samples</div><div>Min</div><div class="srt" data-sort="median" title="Sort by median">Median</div><div class="srt" data-sort="p90" title="Sort by p90">p90</div><div>p99</div><div>Visual</div></div>
      ${rows}
    </div><div class="subtle" style="margin-top:6px">Heuristic scan of numeric fields like latency, duration, ping, queue, and *_ms.</div>
    </div>`;
  })()}
  </div>

  <div id="t-workflow" class="group hidden">
  <div class="sec flow" id="workflow"><h2>Workflow telemetry</h2></div>
  ${(() => {
    // Heuristic funnel from common DeadLink events; will display if any stages seen
    const stageKeys = ['runtime_start','discord_ready','channel_bound','hc_scheduled','hc_done'];
    const counts = new Map(rep.byType);
    const stages = stageKeys.map(k=>({ key:k, label:k.replace(/_/g,' '), count: counts.get(k)||0 }));
    const any = stages.some(s=>s.count>0);
    if (!any) return '';
    const max = Math.max.apply(null, stages.map(s=>s.count)) || 1;
    const rows = stages.map(s=>`<div class="frow"><div class="flab">${esc(s.label)}</div><div class="fbar"><i style="width:${Math.round(s.count/max*100)}%"></i></div><div class="fval">${s.count}</div></div>`).join('');
    return `<div class="chart"><div class="funnel">${rows}</div><div class="subtle" style="margin-top:6px">Workflow funnel (heuristic): shows counts of key lifecycle stages.</div></div>`;
  })()}
  <h2 id="trend-hr">Events per hour (local) <span class="tt" data-tip="Distribution across hours of the day (local time) aggregated over the selected window.">i</span></h2>
  ${emptyState || hourStrip(rep.byHour)}
  ${dayLabels.length > 1 ? (()=>{
    const markers = (()=>{
      const arr = [];
      for (const [ver, d] of rep.versionFirstDay.entries()){
        const idx = dayLabels.indexOf(d);
        if (idx >= 0) arr.push({ index: idx, label: 'v'+ver });
      }
      return arr;
    })();
    return `<h2 id="trend-day">Events per day <span class="tt" data-tip="Daily totals with first-seen version markers.">i</span></h2>` + sparkline(dayLabels, dayValues, { markers });
  })() : ''}
  ${dayLabels.length && dayLabels.length <= 7 ? `<h2>Activity heatmap (last ${dayLabels.length} day${dayLabels.length>1?'s':''})</h2>` + heatmap(dayLabels, rep.byDayHour) : ''}
  <h2 id="types">Events by type <span class="tt" data-tip="Relative frequency of event names in this window.">i</span></h2>
  ${typeBars(typeLabels, typeValues)}
  <div class="subtle" style="margin-top:6px">Each bar shows how often an event occurred during this window. Percentages are relative to total events.</div>
  </div>

  <div id="t-quality" class="group hidden">
  <div class="sec quality" id="quality"><h2>Quality</h2></div>
  ${(() => {
    const t = rep.testSummary || {};
    const hasTests = t.tests != null;
    const cov = rep.coverage;
    const covRow = (label) => {
      if (!cov || !cov.total || !cov.total[label]) return '';
      const ent = cov.total[label] || {};
      const pct = ent.pct || 0; const covered = ent.covered || 0; const total = ent.total || 0;
      const cls = pct >= 80 ? 'txt-good' : pct >= 60 ? 'txt-warn' : 'txt-danger';
      const w = Math.min(100, Math.round(pct));
      const barColor = pct >= 80 ? 'var(--good)' : pct >= 60 ? 'var(--warn)' : 'var(--danger)';
      return `<div>${label}</div><div class="${cls}">${pct}%</div><div class="pbar" title="${covered}/${total}"><i style="width:${w}%;background:${barColor}"></i></div>`;
    };
    if (!hasTests && !cov) return '<p class="muted">No test data available.</p>';
    return `<div class="chart">
      ${hasTests ? `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <div class="card"><div class="muted">Suites</div><div class="stat">${t.suites ?? '-'}</div></div>
        <div class="card"><div class="muted">Tests</div><div class="stat">${t.tests ?? '-'}</div></div>
        <div class="card"><div class="muted">Passed</div><div class="stat">${t.passed ?? '-'}</div></div>
        <div class="card"><div class="muted">Failed</div><div class="stat">${t.failed ?? '-'}</div></div>
      </div>${t.time ? `<div class="subtle" style="grid-column:1/-1">Last run: ${esc(t.time)}</div>` : ''}` : '<p class="muted">No recent test summary file found.</p>'}
      ${cov ? `<div style="margin-top:8px" class="kv">
        <div class="h">Coverage</div><div class="h">Percent</div><div class="h">Visual</div>
        ${covRow('lines')} ${covRow('functions')} ${covRow('statements')} ${covRow('branches')}
      </div>` : ''}
      <div class="subtle" style="margin-top:6px">Looks for logs/jest-last-run.json or jest-results.json and coverage/coverage-summary.json.</div>
    </div>`;
  })()}
  </div>

  <div id="t-features" class="group hidden">
  <div class="sec feat" id="features"><h2>Features</h2></div>
  <h2 id="features-sub">Feature signals <span class="tt" data-tip="Boolean indicators derived from events (e.g., dev mode enabled, updates checked). Values show share of events where a signal is true.">i</span></h2>
  ${(() => {
    const entries = Object.entries(rep.features).sort((a,b)=>b[1]-a[1]);
    const items = entries.map(([k,v]) => donut(k, rep.totals.count? (v/rep.totals.count)*100 : 0, v)).join('');
    return `<div class="donuts">${items}</div>`;
  })()}
  <div class="subtle" style="margin-top:6px">Signals reflect feature usage within this window. Percentages are out of total events.</div>
  </div>

  <div id="t-explore" class="group hidden">
  <div class="sec" id="explore"><h2>Explore</h2></div>
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
  </div>

  <script>(function(){
    var tabs=[].slice.call(document.querySelectorAll('.tabs .tab'));
    function show(id){
      ['t-overview','t-system','t-workflow','t-quality','t-features','t-explore'].forEach(function(x){
        var el=document.getElementById(x); if(!el) return; if(x===id) el.classList.remove('hidden'); else el.classList.add('hidden');
      });
      tabs.forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-tab')===id); });
    }
    tabs.forEach(function(t){ t.addEventListener('click', function(){ show(t.getAttribute('data-tab')); }); });
    // KPI jump links
    [].forEach.call(document.querySelectorAll('.kpi[data-goto]'), function(k){
      k.addEventListener('click', function(){ var id=k.getAttribute('data-goto'); show(id); window.scrollTo({top:0,behavior:'smooth'}); });
    });
    // metrics sorting inside System tab
    var root=document.getElementById('metrics'); if(root){ var hdr=root.querySelector('.hdr'); var rows=[].slice.call(root.querySelectorAll('.row'));
      function sortBy(key, asc){ rows.sort(function(a,b){ var av=a.dataset[key], bv=b.dataset[key]; var an=Number(av), bn=Number(bv); if(!isNaN(an) && !isNaN(bn)) return asc? (an-bn):(bn-an); return asc? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av)); }); rows.forEach(function(r){ root.appendChild(r); }); }
      hdr&&hdr.addEventListener('click', function(e){ var el=e.target.closest('.srt'); if(!el) return; var key=el.getAttribute('data-sort'); var asc = el.getAttribute('data-order')!== 'asc' ? true : false; [].forEach.call(hdr.querySelectorAll('.srt'), function(h){ h.removeAttribute('data-order'); }); el.setAttribute('data-order', asc?'asc':'desc'); sortBy(key, asc); });
    }
  })();</script>

  <div class="sec sys" id="system"><h2>System health</h2></div>
  ${(() => {
    if (!rep.metrics || !rep.metrics.length) return '';
    const formatVal = (unit,v) => {
      if (v==null || v===Infinity || v===-Infinity) return '-';
      if (unit==='ms') return Math.round(v)+' ms';
      if (unit==='pct') return Math.round(v)+'%';
      if (unit==='mb') return Math.round(v*10)/10+' MB';
      if (unit==='sec') return Math.round(v*10)/10+' s';
      return Math.round(v*10)/10;
    };
    const isTimey = (m)=> (m.unit==='ms' || m.unit==='sec' || /latency|ping|duration|time/i.test(m.key));
    const guessSla = (m)=>{
      // Heuristic thresholds for good/warn based on unit/name
      if (m.unit==='ms'){
        if (/ping|latency/i.test(m.key)) return { g:100, y:300 };
        return { g:200, y:600 };
      }
      if (m.unit==='sec'){
        if (/ping|latency/i.test(m.key)) return { g:0.1, y:0.3 };
        return { g:1, y:3 };
      }
      if (m.unit==='pct') return { g:50, y:80 }; // lower better
      if (m.unit==='mb') return { g:50, y:200 }; // lower better
      return { g:m.median||0, y:m.p90||0 };
    };
    const rowHtml = (m) => {
      const unit = m.unit || '';
      const sla = guessSla(m);
      const maxRef = Math.max(m.p99||0, (sla.y||0)*1.5, (m.p90||0));
      const gP = maxRef? Math.min(96, Math.round((sla.g/maxRef)*100)) : 20;
      const yP = maxRef? Math.min(98, Math.max(gP+2, Math.round((sla.y/maxRef)*100))) : 70;
      const mark = maxRef? Math.min(100, Math.round((m.p90/maxRef)*100)) : 0;
      const visual = isTimey(m)
        ? `<div class="segments" style="--g:${gP}%;--y:${yP}%" title="p90 marker • good≤${formatVal(unit,sla.g)}, warn≤${formatVal(unit,sla.y)}"><i style="left:${mark}%"></i></div>`
        : `<div class="pbar" aria-label="p90 visual"><i style="width:${Math.min(100, Math.round((m.p90/(m.p99||m.p90||1))*100))}%"></i></div>`;
      return `<div class="row" data-label="${esc(m.label)}" data-count="${m.count}" data-median="${m.median}" data-p90="${m.p90}" data-p99="${m.p99}">`
        + `<div title="${esc(m.key)}">${esc(m.label)}</div>`
        + `<div>${m.count}</div>`
        + `<div>${formatVal(unit, m.min)}</div>`
        + `<div>${formatVal(unit, m.median)}</div>`
        + `<div>${formatVal(unit, m.p90)}</div>`
        + `<div>${formatVal(unit, m.p99)}</div>`
        + `<div>${visual}</div>`
      + `</div>`;
    };
    const rows = rep.metrics.slice(0, 24).map(rowHtml).join('');
  return `<div class="chart"><div class="kv" id="metrics">
      <div class="hdr"><div class="srt" data-sort="label" title="Sort by name">Metric</div><div class="srt" data-sort="count" title="Sort by samples">Samples</div><div>Min</div><div class="srt" data-sort="median" title="Sort by median">Median</div><div class="srt" data-sort="p90" title="Sort by p90">p90</div><div>p99</div><div>Visual</div></div>
      ${rows}
    </div><div class="subtle" style="margin-top:6px">Heuristic scan of numeric fields like latency, duration, ping, queue, and *_ms.</div>
    <script>(function(){
      var root=document.getElementById('metrics'); if(!root) return;
      var hdr=root.querySelector('.hdr'); var rows=[].slice.call(root.querySelectorAll('.row'));
      function sortBy(key, asc){
        rows.sort(function(a,b){
          var av=a.dataset[key], bv=b.dataset[key];
          var an=Number(av), bn=Number(bv);
          if(!isNaN(an) && !isNaN(bn)) return asc? (an-bn):(bn-an);
          return asc? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });
        for(var i=0;i<rows.length;i++) root.appendChild(rows[i]);
      }
      hdr.addEventListener('click', function(e){
        var el=e.target.closest('.srt'); if(!el) return;
        var key=el.getAttribute('data-sort'); var asc = el.getAttribute('data-order')!== 'asc' ? true : false;
        [].forEach.call(hdr.querySelectorAll('.srt'), function(h){ h.removeAttribute('data-order'); });
        el.setAttribute('data-order', asc?'asc':'desc');
        sortBy(key, asc);
      });
    })();</script>
    </div>`;
  })()}

  <div class="sec quality" id="quality"><h2>Quality</h2></div>
  ${(() => {
    const t = rep.testSummary || {};
    const hasTests = t.tests != null;
    const cov = rep.coverage;
    const covRow = (label) => {
      if (!cov || !cov.total || !cov.total[label]) return '';
      const ent = cov.total[label] || {};
      const pct = ent.pct || 0; const covered = ent.covered || 0; const total = ent.total || 0;
      const cls = pct >= 80 ? 'txt-good' : pct >= 60 ? 'txt-warn' : 'txt-danger';
      const w = Math.min(100, Math.round(pct));
      const barColor = pct >= 80 ? 'var(--good)' : pct >= 60 ? 'var(--warn)' : 'var(--danger)';
      return `<div>${label}</div><div class="${cls}">${pct}%</div><div class="pbar" title="${covered}/${total}"><i style="width:${w}%;background:${barColor}"></i></div>`;
    };
    if (!hasTests && !cov) return '';
    return `<div class="chart">
      ${hasTests ? `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <div class="card"><div class="muted">Suites</div><div class="stat">${t.suites ?? '-'}</div></div>
        <div class="card"><div class="muted">Tests</div><div class="stat">${t.tests ?? '-'}</div></div>
        <div class="card"><div class="muted">Passed</div><div class="stat">${t.passed ?? '-'}</div></div>
        <div class="card"><div class="muted">Failed</div><div class="stat">${t.failed ?? '-'}</div></div>
      </div>${t.time ? `<div class="subtle" style="grid-column:1/-1">Last run: ${esc(t.time)}</div>` : ''}` : '<p class="muted">No recent test summary file found.</p>'}
      ${cov ? `<div style="margin-top:8px" class="kv">
        <div class="h">Coverage</div><div class="h">Percent</div><div class="h">Visual</div>
        ${covRow('lines')} ${covRow('functions')} ${covRow('statements')} ${covRow('branches')}
      </div>` : ''}
      <div class="subtle" style="margin-top:6px">Looks for logs/jest-last-run.json or jest-results.json and coverage/coverage-summary.json.</div>
    </div>`;
  })()}

  <div class="sec flow" id="workflow"><h2>Workflow telemetry</h2></div>
  <h2 id="trend-hr">Events per hour (local) <span class="tt" data-tip="Distribution across hours of the day (local time) aggregated over the selected window.">i</span></h2>
  ${emptyState || hourStrip(rep.byHour)}
  ${dayLabels.length > 1 ? (()=>{
    const markers = (()=>{
      const arr = [];
      for (const [ver, d] of rep.versionFirstDay.entries()){
        const idx = dayLabels.indexOf(d);
        if (idx >= 0) arr.push({ index: idx, label: 'v'+ver });
      }
      return arr;
    })();
    return `<h2 id="trend-day">Events per day <span class="tt" data-tip="Daily totals with first-seen version markers.">i</span></h2>` + sparkline(dayLabels, dayValues, { markers });
  })() : ''}

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
  <div class="sec feat" id="features"><h2>Features</h2></div>
  <h2 id="features-sub">Feature signals <span class="tt" data-tip="Boolean indicators derived from events (e.g., dev mode enabled, updates checked). Values show share of events where a signal is true.">i</span></h2>
  ${(() => {
    const entries = Object.entries(rep.features).sort((a,b)=>b[1]-a[1]);
    const items = entries.map(([k,v]) => donut(k, rep.totals.count? (v/rep.totals.count)*100 : 0, v)).join('');
    return `<div class="donuts">${items}</div>`;
  })()}
  <div class="subtle" style="margin-top:6px">Signals reflect feature usage within this window. Percentages are out of total events.</div>
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
    try { safeWriteFile(outFile, content, { ensureDirectory: true }); console.log(`Wrote ${outFile}`); } catch (e) { console.error('Failed to write output:', e.message || e); }
  } else {
    console.log(content);
  }
}

if (require.main === module) main();
