// Optional Pino logger factory. Returns null when dependencies are missing.
function createPinoLogger(level = 'info') {
  try {
    const pino = require('pino');
    let logger = null;
    try {
      // Use pino-pretty as a transport if available (pino v9+)
      const transport = pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'HH:MM:ss.l',
          singleLine: true
        }
      });
      logger = pino({ level, base: null }, transport);
    } catch (_) {
      // Fallback to raw JSON logs if pretty transport not available
      logger = pino({ level, base: null });
    }
    return logger;
  } catch (_) {
    return null;
  }
}

function patchConsoleToPino(pinoLogger) {
  if (!pinoLogger) return false;
  const orig = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };
  try {
    console.log = (...args) => pinoLogger.info(args.map(String).join(' '));
    console.warn = (...args) => pinoLogger.warn(args.map(String).join(' '));
    console.error = (...args) => pinoLogger.error(args.map(String).join(' '));
    return true;
  } catch (_) {
    // restore on failure
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
    return false;
  }
}

module.exports = { createPinoLogger, patchConsoleToPino };
