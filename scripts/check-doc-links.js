const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Simple link linter: finds local asset links in docs and checks HTTP 200 when served via root path.
// This is intentionally lightweight and checks only files referenced under docs/ or assets.

async function checkUrl(url) {
  // Only check local links (relative paths starting without http)
  if (/^https?:/i.test(url)) return null;
  // Normalize leading ./
  url = url.replace(/^\.\//, '');
  const localPath = path.join(__dirname, '..', url);
  if (!fs.existsSync(localPath)) {
    return { url, ok: false, reason: 'missing' };
  }
  return { url, ok: true };
}

function findLinksInFile(filePath) {
  const md = fs.readFileSync(filePath, 'utf8');
  const re = /\]\(([^)]+)\)/g; // markdown link pattern [text](url)
  let m;
  const links = [];
  while ((m = re.exec(md))) {
    links.push(m[1]);
  }
  const imgRe = /src=\"([^\"]+)\"/g;
  while ((m = imgRe.exec(md))) {
    links.push(m[1]);
  }
  return links;
}

async function main() {
  const docsDir = path.join(__dirname, '..', 'docs');
  if (!fs.existsSync(docsDir)) {
    console.log('No docs directory, skipping link checks.');
    process.exit(0);
  }
  const mdFiles = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.md') || p.endsWith('.html')) mdFiles.push(p);
    }
  }
  walk(docsDir);

  let failures = [];
  for (const f of mdFiles) {
    const links = findLinksInFile(f);
    for (const l of links) {
      const res = await checkUrl(l);
      if (res && !res.ok) failures.push({ file: f, url: l, reason: res.reason });
    }
  }

  if (failures.length) {
    console.error('Docs link check found missing local assets:');
    failures.forEach(x => console.error(`${x.file}: ${x.url} (${x.reason})`));
    process.exit(3);
  }
  console.log('Docs link check passed.');
}

main().catch(err => { console.error(err); process.exit(4); });
