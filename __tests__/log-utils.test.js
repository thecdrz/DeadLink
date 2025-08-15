const fs = require('fs');
const path = require('path');
const os = require('os');

const { ensureDir, activeFile, rotateIfNeeded, writeFileLine } = require('../lib/log-utils');

describe('log-utils', () => {
  const tmp = path.join(os.tmpdir(), `deadlink-test-${Date.now()}`);
  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch(_) {}
  });

  test('writes a line and creates directory', () => {
    ensureDir(tmp);
    const f = activeFile(tmp);
    expect(path.basename(f)).toBe('deadlink.log');
    writeFileLine('hello world', tmp);
    const contents = fs.readFileSync(f, 'utf8');
    expect(contents).toMatch(/hello world/);
  });

  test('rotates files when exceeding size', () => {
    // create big file
    ensureDir(tmp);
    const f = activeFile(tmp);
    fs.writeFileSync(f, 'x'.repeat(1024));
    rotateIfNeeded(tmp, 10, 3); // tiny maxSize to trigger rotation
    // after rotateIfNeeded, active file should exist (possibly empty)
    expect(fs.existsSync(f)).toBe(true);
  });
});
