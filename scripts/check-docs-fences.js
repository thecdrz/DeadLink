const fs = require('fs');
const path = require('path');

const guideDir = path.join(__dirname, '..', 'docs', 'guide');
let failures = [];

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const firstNonBlank = lines.find(l => l.trim() !== '');
  if (firstNonBlank && /^\s*```/.test(firstNonBlank)) {
    failures.push(filePath);
  }
}

function main() {
  if (!fs.existsSync(guideDir)) {
    console.log('No docs/guide directory found, skipping.');
    process.exit(0);
  }
  const files = fs.readdirSync(guideDir).filter(f => f.endsWith('.md'));
  files.forEach(f => checkFile(path.join(guideDir, f)));

  if (failures.length) {
    console.error('Docs fence check failed. Files with leading code fences:');
    failures.forEach(x => console.error('  - ' + x));
    process.exit(2);
  }
  console.log('Docs fence check passed.');
}

main();
