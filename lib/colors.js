// Minimal ANSI color utilities with auto-detect and opt-out via NO_COLOR
// Inspired by picocolors API shape (but zero-dep)

const isEnabled = (() => {
  if (process.env.NO_COLOR != null) return false;
  const f = process.env.FORCE_COLOR;
  if (f === '0') return false;
  if (f === '1' || f === 'true') return true;
  return !!(process.stdout && process.stdout.isTTY);
})();

function wrap(code, str) {
  const s = String(str);
  return isEnabled ? `\u001b[${code}m${s}\u001b[0m` : s;
}

module.exports = {
  enabled: isEnabled,
  bold: (s) => wrap(1, s),
  dim: (s) => wrap(2, s),
  red: (s) => wrap(31, s),
  green: (s) => wrap(32, s),
  yellow: (s) => wrap(33, s),
  blue: (s) => wrap(34, s),
  magenta: (s) => wrap(35, s),
  cyan: (s) => wrap(36, s),
  white: (s) => wrap(37, s),
  gray: (s) => wrap(90, s),
};
