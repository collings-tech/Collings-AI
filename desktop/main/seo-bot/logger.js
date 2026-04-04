'use strict';

const path = require('path');
const fs = require('fs');
const winston = require('winston');

// Resolve log directory — use Electron userData path when available
let logDir;
try {
  const { app } = require('electron');
  logDir = path.join(app.getPath('userData'), 'logs');
} catch {
  logDir = path.join(__dirname, '../../../logs');
}

// Ensure log directory exists
try {
  fs.mkdirSync(logDir, { recursive: true });
} catch {
  // If we can't create it, winston will fail gracefully on its own
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'seo-bot-error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'seo-bot.log'),
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    }),
  ],
});

if (process.env.NODE_ENV === 'development') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [SEO-BOT] ${level}: ${message}${extra}`;
        })
      ),
    })
  );
}

module.exports = logger;
