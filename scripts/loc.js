// Simple LOC (lines of code) counter for the repository.
// Counts lines in tracked files with selected extensions plus Dockerfile.
// Usage: node scripts/loc.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const includedExts = new Set(['.js', '.json', '.md', '.yml', '.yaml', '.html', '.css']);

function getTrackedFiles() {
  const out = execSync('git ls-files', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
  if (!out) return [];
  return out.split(/\r?\n/);
}

function countLines(text) {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

function main() {
  const files = getTrackedFiles();
  let total = 0;
  const rows = [];
  for (const f of files) {
    const ext = f === 'Dockerfile' ? 'Dockerfile' : path.extname(f);
    if (ext === 'Dockerfile' || includedExts.has(ext)) {
      let lines = 0;
      try {
        const content = fs.readFileSync(f, 'utf8');
        lines = countLines(content);
      } catch {
        // Ignore unreadable file.
      }
      total += lines;
      rows.push({ file: f, lines });
    }
  }
  rows.sort((a, b) => b.lines - a.lines);
  console.log('Top files by line count:');
  for (const r of rows.slice(0, 15)) {
    console.log(String(r.lines).padStart(6), r.file);
  }
  console.log('TOTAL_LINES=' + total);
}

if (require.main === module) {
  main();
}
