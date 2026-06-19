/**
 * routes/payments.js — Payment API Routes
 *
 * All routes require an authenticated session (enforced by requireAuth).
 * The access token for Clover API calls is sourced from the server-side
 * session, set during the OAuth2 callback.
 *
 * Endpoints:
 *   POST /api/checkout           → Full flow: create order + line item + payment
 *   POST /api/orders             → Create an empty order
 *   GET  /api/orders/:id         → Get order details (with line items)
 *   POST /api/orders/:id/items   → Add a line item to an existing order
 *   POST /api/payments           → Create a payment against an existing order
 *   GET  /api/payments/:id       → Get payment status
 */

const express = require('express');
const router = express.Router();
const clover = require('../services/cloverService');
const requireAuth = require('../middleware/requireAuth');
const logger = require('../utils/logger');

// All routes require an active session
router.use(requireAuth);

/**
 * Helper — Converts a dollar amount to cents for the Clover API.
 * Example: parseToCents(22.00) → 2200
 */
function parseToCents(amount) {
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) {
    throw new Error('Invalid amount: must be a positive number');
  }
  return Math.round(num * 100);
}

/**
 * Helper — Gets the Clover access token from the session.
 * Token is set during OAuth callback and stored server-side.
 */
function getAccessToken(req) {
  return req.session.accessToken;
}


// ─────────────────────────────────────────────────────────────
//  POST /api/checkout
//
//  One-shot endpoint that runs the complete payment flow:
//    Step 1: Create a new order
//    Step 2: Add the item as a line item (product name + price)
//    Step 3: Process the payment using a test card
//
//  Request body: { "amount": 22.00, "description": "Wireless Mouse" }
//  Response:     { success, transaction: { orderId, paymentId, status, ... } }
// ─────────────────────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  const { amount, description } = req.body;
  const accessToken = getAccessToken(req);
  const { merchantId } = req.session;

  // Validate required fields
  if (!amount || !description) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['amount', 'description'],
    });
  }

  let amountInCents;
  try {
    amountInCents = parseToCents(amount);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  logger.info('Checkout initiated', { merchantId, amount, description });

  try {
    // Step 1: Create order
    const order = await clover.createOrder(accessToken, merchantId);

    // Step 2: Add line item (product name + price)
    const lineItem = await clover.addLineItem(accessToken, merchantId, order.id, {
      amountInCents,
      description,
    });

    // Step 3: Process payment (uses sandbox test card)
    const payment = await clover.createPayment(
      accessToken,
      merchantId,
      order.id,
      amountInCents
    );
    
    // Return transaction summary
    const result = {
      success: true,
      transaction: {
        orderId: order.id,
        lineItemId: lineItem.id,
        paymentId: payment.id,
        amount: `$${(amountInCents / 100).toFixed(2)}`,
        amountInCents,
        description,
        status: payment.result || 'UNKNOWN',
        createdAt: new Date().toISOString(),
      },
      raw: { order, lineItem, payment },
    };

    logger.info('Checkout completed', {
      paymentId: payment.id,
      orderId: order.id,
      status: payment.result,
    });

    res.json(result);
  } catch (err) {
    const apiError = err.response?.data;
    const statusCode = err.response?.status;
    logger.error('Checkout failed', { message: err.message, apiError, merchantId });

    // Token expired → clear session, ask user to re-login
    if (statusCode === 401) {
      req.session.destroy(() => {});
      return res.status(401).json({
        success: false,
        error: 'Session expired',
        message: 'Your Clover token has expired. Please log in again.',
        loginUrl: '/auth/login',
      });
    }

    res.status(statusCode || 500).json({
      success: false,
      error: 'Payment processing failed',
      details: apiError || err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/orders
//  Create an empty order (no line items yet).
// ─────────────────────────────────────────────────────────────
router.post('/orders', async (req, res) => {
  const accessToken =  getAccessToken(req);
  const { merchantId } = req.session;

  try {
    const order = await clover.createOrder(accessToken, merchantId);
    res.json({ success: true, order });
  } catch (err) {
    logger.error('Create order failed', { message: err.message });
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/orders/:id
//  Fetch an order with its line items expanded.
// ─────────────────────────────────────────────────────────────
router.get('/orders/:id', async (req, res) => {
  const accessToken =  getAccessToken(req);
  const { merchantId } = req.session;

  try {
    const order = await clover.getOrder(accessToken, merchantId, req.params.id);
    res.json({ success: true, order });
  } catch (err) {
    logger.error('Get order failed', { message: err.message });
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/orders/:id/items
//  Add a line item to an existing order.
//  Body: { "amount": 15.00, "description": "Keyboard" }
// ─────────────────────────────────────────────────────────────
router.post('/orders/:id/items', async (req, res) => {
  const { amount, description } = req.body;
  const accessToken =  getAccessToken(req);
  const { merchantId } = req.session;

  if (!amount || !description) {
    return res.status(400).json({ error: 'Missing amount or description' });
  }

  try {
    const amountInCents = parseToCents(amount);
    const lineItem = await clover.addLineItem(accessToken, merchantId, req.params.id, {
      amountInCents,
      description,
    });
    res.json({ success: true, lineItem });
  } catch (err) {
    logger.error('Add line item failed', { message: err.message });
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/payments
//  Create a payment against an existing order.
//  Body: { "orderId": "ORDER_ID", "amount": 22.00 }
// ─────────────────────────────────────────────────────────────
router.post('/payments', async (req, res) => {
  const { orderId, amount } = req.body;
  const accessToken =  getAccessToken(req);
  const { merchantId } = req.session;

  if (!orderId || !amount) {
    return res.status(400).json({ error: 'Missing orderId or amount' });
  }

  try {
    const amountInCents = parseToCents(amount);
    const payment = await clover.createPayment(
      accessToken,
      merchantId,
      orderId,
      amountInCents
    );
     
    res.json({ success: true, payment });
  } catch (err) {
    logger.error('Create payment failed', { message: err.message });
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/payments/:id
//  Fetch payment status and details.
// ─────────────────────────────────────────────────────────────
router.get('/payments/:id', async (req, res) => {
  const accessToken =  getAccessToken(req);
  const { merchantId } = req.session;

  try {
    const payment = await clover.getPayment(accessToken, merchantId, req.params.id);
    res.json({
      success: true,
      paymentId: payment.id,
      status: payment.result,
      amount: payment.amount,
      createdTime: payment.createdTime,
      payment,
    });
  } catch (err) {
    logger.error('Get payment failed', { message: err.message });
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

module.exports = router;
