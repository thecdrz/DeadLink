const fs = require('fs');

function ensureDir(dir) {
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir); } catch(_) {}
}

function activeFile(dir = './logs') { return `${dir}/deadlink.log`; }

function rotateIfNeeded(dir = './logs', maxSize = 512 * 1024, maxFiles = 5) {
  try {
    ensureDir(dir);
    const f = activeFile(dir);
    if (fs.existsSync(f)) {
      const stat = fs.statSync(f);
      if (stat.size >= maxSize) {
        for (let i = maxFiles-1; i >= 0; i--) {
          const src = i === 0 ? f : `${f}.${i}`;
          const dest = `${f}.${i+1}`;
          if (fs.existsSync(src)) {
            if (i+1 >= maxFiles) { try { fs.unlinkSync(src); } catch(_) {} }
            else { try { fs.renameSync(src, dest); } catch(_) {} }
          }
        }
        // Ensure the active file exists after rotation (tests expect an active file to be present)
        try {
          if (!fs.existsSync(f)) {
            fs.writeFileSync(f, '');
          }
        } catch(_) {}
      }
    }
  } catch(_) {}
}

function writeFileLine(line, dir = './logs') {
  try {
    rotateIfNeeded(dir);
    fs.appendFileSync(activeFile(dir), line + '\n');
  } catch(_) {}
}

module.exports = { ensureDir, activeFile, rotateIfNeeded, writeFileLine };
