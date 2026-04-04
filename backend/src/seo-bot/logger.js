'use strict';

const path = require('path');
const fs = require('fs');
const winston = require('winston');

const logDir = path.join(__dirname, '../../logs');
try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }

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
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'seo-bot.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [SEO-BOT] ${level}: ${message}${extra}`;
        })
      ),
    }),
  ],
});

module.exports = logger;
