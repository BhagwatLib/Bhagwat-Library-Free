const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'app.log');

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// If NODE_ENV is production, default to 'info' to suppress all debug logs.
// In development, default to 'debug' unless LOG_LEVEL is explicitly set.
function getCurrentLogLevel() {
  if (process.env.LOG_LEVEL) {
    const envLevel = process.env.LOG_LEVEL.toLowerCase().trim();
    if (LOG_LEVELS[envLevel] !== undefined) {
      return LOG_LEVELS[envLevel];
    }
  }
  return process.env.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug;
}

// Harmless Chromium & library warnings to suppress completely
const SUPPRESSED_PATTERNS = [
  /DEPRECATED_ENDPOINT/i,
  /dbus/i,
  /vkCreateInstance/i,
  /egl/i,
  /mesa/i,
  /libva/i,
  /gpu_process_host/i,
  /Failed to connect to the bus/i,
  /Fontconfig error/i,
  /GLib-GObject/i,
  /vaInitialize/i,
];

function shouldSuppress(message, meta) {
  const metaText = meta ? (meta.stack || (typeof meta === 'string' ? meta : JSON.stringify(meta))) : '';
  const fullText = `${message || ''} ${metaText}`;
  return SUPPRESSED_PATTERNS.some((pattern) => pattern.test(fullText));
}

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  let metaStr = '';
  if (meta) {
    if (meta.stack) {
      metaStr = `\n--- STACK TRACE ---\n${meta.stack}\n-------------------`;
    } else {
      metaStr = ` | Meta: ${JSON.stringify(meta, null, 2)}`;
    }
  }
  return `[${timestamp}] [${level.toUpperCase()}]: ${message}${metaStr}\n`;
}

function writeLog(level, message, meta) {
  const numericLevel = LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : LOG_LEVELS.info;
  const currentThreshold = getCurrentLogLevel();

  // Suppress logs below active log level
  if (numericLevel < currentThreshold) {
    return;
  }

  // Suppress known harmless Chromium / driver warnings
  if (shouldSuppress(message, meta)) {
    return;
  }

  const formatted = formatMessage(level, message, meta);

  if (level === 'error') {
    console.error(formatted.trim());
  } else if (level === 'warn') {
    console.warn(formatted.trim());
  } else {
    console.log(formatted.trim());
  }

  // Append to file
  try {
    fs.appendFileSync(logFile, formatted, 'utf8');
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

const logger = {
  debug: (message, meta) => writeLog('debug', message, meta),
  info: (message, meta) => writeLog('info', message, meta),
  warn: (message, meta) => writeLog('warn', message, meta),
  error: (message, meta) => writeLog('error', message, meta),
};

module.exports = logger;
