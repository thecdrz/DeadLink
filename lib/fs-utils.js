const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  try {
    if (!dir) return;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

function safeReadJson(filePath, defaultValue = null) {
  try {
    if (!filePath) return defaultValue;
    if (!fs.existsSync(filePath)) return defaultValue;
    const txt = fs.readFileSync(filePath, 'utf8');
    if (!txt || txt.trim() === '') return defaultValue;
    return JSON.parse(txt);
  } catch (_) {
    return defaultValue;
  }
}

function safeWriteJson(filePath, data, { ensureDirectory = true } = {}) {
  try {
    if (!filePath) return false;
    if (ensureDirectory) {
      const dir = path.dirname(filePath);
      ensureDir(dir);
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function safeAppendLine(filePath, line) {
  try {
    if (!filePath) return false;
    const dir = path.dirname(filePath);
    ensureDir(dir);
    fs.appendFileSync(filePath, String(line) + '\n');
    return true;
  } catch (_) { return false; }
}

function safeReadLines(filePath) {
  try {
    if (!filePath) return [];
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.split(/\r?\n/).filter(Boolean);
  } catch (_) { return []; }
}

function safeWriteFile(filePath, content, { ensureDirectory = true } = {}) {
  try {
    if (!filePath) return false;
    if (ensureDirectory) ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, String(content), 'utf8');
    return true;
  } catch (_) { return false; }
}

module.exports = { ensureDir, safeReadJson, safeWriteJson, safeAppendLine, safeReadLines, safeWriteFile };
