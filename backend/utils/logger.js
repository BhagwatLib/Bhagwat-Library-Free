const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'app.log');

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
  const formatted = formatMessage(level, message, meta);
  // Log to console with full stack trace preservation
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
  info: (message, meta) => writeLog('info', message, meta),
  warn: (message, meta) => writeLog('warn', message, meta),
  error: (message, meta) => writeLog('error', message, meta),
};

module.exports = logger;
