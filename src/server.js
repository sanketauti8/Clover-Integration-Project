/**
 * server.js — Application Entry Point
 *
 * Sets up Express with:
 *   - JSON body parsing
 *   - HTTP request logging (morgan)
 *   - Server-side sessions (express-session) for storing OAuth tokens
 *   - Static file serving for the checkout UI
 *   - Route mounting for auth and payment endpoints
 *   - Global error handler
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const morgan = require('morgan');
const path = require('path');
const logger = require('./utils/logger');

// ── Validate required env vars before starting ─────────────
const REQUIRED_ENV = ['CLOVER_APP_ID', 'CLOVER_APP_SECRET', 'REDIRECT_URI', 'SESSION_SECRET'];
REQUIRED_ENV.forEach((key) => {
  if (!process.env[key]) {
    logger.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────

// Parse JSON and URL-encoded request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log every HTTP request to console (e.g. "GET / 200 3.2ms")
app.use(morgan('dev'));

// Serve the checkout UI from /public
app.use(express.static(path.join(__dirname, '../public')));

// Server-side session — stores the Clover access token + merchant ID
// The browser only receives a session cookie (connect.sid), never the token itself
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,             // JavaScript cannot read the cookie
      maxAge: 1000 * 60 * 60 * 8, // Session expires after 8 hours
    },
  })
);

// ── Routes ─────────────────────────────────────────────────

// OAuth2 authentication routes (login, callback, status, logout)
app.use('/auth', require('./routes/auth'));
app.use('/oauth', require('./routes/auth')); // Clover sandbox redirects to /oauth/callback

// Payment API routes (all require an active session)
app.use('/api', require('./routes/payments'));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Global Error Handler ────────────────────────────────────
// Catches unhandled errors thrown inside route handlers
app.use((err, _req, res, _next) => {
  logger.error('Unhandled server error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Server running at http://localhost:${PORT}`);
  logger.info(`OAuth login: http://localhost:${PORT}/auth/login`);
});

module.exports = app;
