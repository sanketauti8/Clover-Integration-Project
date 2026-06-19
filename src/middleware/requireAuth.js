/**
 * requireAuth.js — Authentication Middleware
 *
 * Protects all /api/* routes. Checks that the session contains
 * a valid merchant ID (set during the OAuth callback).
 *
 * If the user hasn't completed OAuth login, returns 401 with
 * a message directing them to /auth/login.
 */

const logger = require('../utils/logger');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.merchantId) {
    logger.warn('Unauthenticated request blocked', { path: req.path });
    return res.status(401).json({
      error: 'Not authenticated',
      message: 'Please complete OAuth login first at GET /auth/login',
      loginUrl: '/auth/login',
    });
  }
  next();
}

module.exports = requireAuth;
