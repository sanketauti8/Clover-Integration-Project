/**
 * routes/auth.js — OAuth2 Authentication Routes
 *
 * Implements the Clover OAuth2 Authorization Code Flow:
 *
 *   1. GET /auth/login     → Redirects browser to Clover's login page
 *   2. GET /auth/callback  → Clover redirects here with ?code=...
 *                            We exchange the code for an access_token
 *                            and store it in the server-side session
 *   3. GET /auth/status    → Returns current auth state (JSON)
 *   4. GET /auth/logout    → Destroys the session
 *
 * Flow diagram:
 *
 *   Browser          Your Server              Clover
 *     |                   |                      |
 *     |-- /auth/login --> |                      |
 *     |                   |-- redirect --------> |
 *     |                   |                      | (merchant logs in)
 *     |                   | <-- ?code=XXX ------ |
 *     |                   |                      |
 *     |                   |-- GET /oauth/token -> |
 *     |                   | <-- access_token ---- |
 *     |                   |                      |
 *     | <-- redirect / -- | (token in session)   |
 */

const express = require('express');
const router = express.Router();
const { exchangeCodeForToken, BASE_URL } = require('../services/cloverService');
const logger = require('../utils/logger');

// ── 1. Login — Redirect to Clover OAuth ─────────────────────
router.get('/login', (_req, res) => {
  const authUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authUrl.searchParams.set('client_id', process.env.CLOVER_APP_ID);
  authUrl.searchParams.set('redirect_uri', process.env.REDIRECT_URI);

  logger.info('Redirecting to Clover OAuth', { url: authUrl.toString() });
  res.redirect(authUrl.toString());
});

// ── 2. Callback — Exchange code for token ───────────────────
// Clover redirects here after the merchant approves the app.
// The one-time ?code= is exchanged for a persistent access_token.
router.get('/callback', async (req, res) => {
  const { code, merchant_id: merchantIdFromQuery } = req.query;

  if (!code) {
    logger.error('OAuth callback missing code', { query: req.query });
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    const { access_token, merchant_id } = await exchangeCodeForToken(code);

    // Store in server-side session (never exposed to the browser)
    req.session.accessToken = access_token;
    req.session.merchantId = merchant_id || merchantIdFromQuery;

    // Explicitly save before redirecting to prevent race condition
    // where the redirect fires before the session is written to store
    req.session.save((err) => {
      if (err) {
        logger.error('Session save failed', { message: err.message });
        return res.status(500).json({ error: 'Session save failed' });
      }

      logger.info('OAuth login successful', { merchantId: req.session.merchantId });
      res.redirect('/?auth=success');
    });
  } catch (err) {
    logger.error('Token exchange failed', {
      message: err.message,
      response: err.response?.data,
    });
    res.status(500).json({
      error: 'Token exchange failed',
      details: err.response?.data || err.message,
    });
  }
});

// ── 3. Status — Check if session is authenticated ───────────
router.get('/status', (req, res) => {
  if (req.session?.accessToken) {
    res.json({ authenticated: true, merchantId: req.session.merchantId });
  } else {
    res.json({ authenticated: false });
  }
});

// ── 4. Logout — Destroy session ─────────────────────────────
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out successfully' });
  });
});

module.exports = router;
