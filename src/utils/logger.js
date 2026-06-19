/**
 * logger.js — Winston Logger
 *
 * Two transports:
 *   1. Console — colorised, human-readable (for development)
 *   2. File   — JSON lines to logs/transactions.log (for audit trail)
 *
 * Every significant event (token exchange, order creation, payment result,
 * errors) is logged so transaction details are stored locally.
 */

const { createLogger, format, transports } = require('winston');
const path = require('path');

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const extras = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] ${level}: ${message}${extras}`;
        })
      ),
    }),
    new transports.File({
      filename: path.join(__dirname, '../../logs/transactions.log'),
      format: format.json(),
    }),
  ],
});

module.exports = logger;
