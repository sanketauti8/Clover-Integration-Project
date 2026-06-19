/**
 * cloverService.js — Clover REST API Service Layer
 *
 * Centralises ALL Clover API interactions in one file:
 *   1. exchangeCodeForToken — OAuth2 token exchange
 *   2. createOrder          — POST /v3/merchants/{mId}/orders
 *   3. addLineItem          — POST /v3/merchants/{mId}/orders/{orderId}/line_items
 *   4. createPayment        — POST /v3/merchants/{mId}/payments
 *   5. getPayment           — GET  /v3/merchants/{mId}/payments/{paymentId}
 *   6. getOrder             — GET  /v3/merchants/{mId}/orders/{orderId}
 *
 * All amounts are in CENTS (e.g. $22.00 = 2200).
 */

const axios = require('axios');
const logger = require('../utils/logger');

// Clover Sandbox base URL
const BASE_URL = 'https://sandbox.dev.clover.com';

/**
 * Creates an Axios instance authenticated with the Clover API token.
 * Uses both Bearer header and query param for maximum compatibility.
 */
function cloverClient(accessToken) {
  const instance = axios.create({
    baseURL: `${BASE_URL}/v3`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    timeout: 15000,
  });

  // Also attach token as query param (Clover sandbox works reliably with both)
  instance.interceptors.request.use((config) => {
    config.params = { ...config.params, access_token: accessToken };
    return config;
  });

  return instance;
}

// ─────────────────────────────────────────────────────────────
//  1. OAuth2 — Exchange authorization code for access token
//
//  Called during the OAuth callback after the merchant logs in
//  and approves the app. The one-time `code` is exchanged for
//  a persistent access_token.
//
//  Endpoint: GET https://sandbox.dev.clover.com/oauth/token
//  Params:   client_id, client_secret, code
//  Returns:  { access_token, merchant_id }
// ─────────────────────────────────────────────────────────────
async function exchangeCodeForToken(code) {
  const url = `${BASE_URL}/oauth/token`;
  const params = {
    client_id: process.env.CLOVER_APP_ID,
    client_secret: process.env.CLOVER_APP_SECRET,
    code,
  };

  logger.info('Exchanging auth code for access token', { url });
  const response = await axios.get(url, { params });

  const { access_token, merchant_id } = response.data;
  if (!access_token) {
    throw new Error('No access_token in Clover token response');
  }

  logger.info('Token exchange successful', { merchant_id });
  return { access_token, merchant_id };
}


// ─────────────────────────────────────────────────────────────
//  2. Create a new Order
//
//  Every payment in Clover must be associated with an order.
//  This creates an empty order that line items can be added to.
//
//  Endpoint: POST /v3/merchants/{mId}/orders
//  Body:     { currency: "usd", state: "open" }
//  Returns:  Order object with order.id
// ─────────────────────────────────────────────────────────────
async function createOrder(accessToken, merchantId) {
  const client = cloverClient(accessToken);

  logger.info('Creating order', { merchantId });
  const response = await client.post(`/merchants/${merchantId}/orders`, {
    currency: 'usd',
    state: 'open',
  });

  logger.info('Order created', { orderId: response.data.id });
  return response.data;
}

// ─────────────────────────────────────────────────────────────
//  3. Add a Line Item to an Order
//
//  Attaches a product (name + price) to an existing order.
//  This is what the merchant sees as "what was purchased."
//
//  Endpoint: POST /v3/merchants/{mId}/orders/{orderId}/line_items
//  Body:     { price (in cents), name, unitQty: 1000 }
//
//  Note: unitQty uses milliUnits — 1000 = 1 unit
// ─────────────────────────────────────────────────────────────
async function addLineItem(accessToken, merchantId, orderId, { amountInCents, description }) {
  const client = cloverClient(accessToken);

  logger.info('Adding line item', { orderId, amountInCents, description });
  const response = await client.post(`/merchants/${merchantId}/orders/${orderId}/line_items`, {
    price: amountInCents,
    name: description,
    unitQty: 1000,
  });

  logger.info('Line item added', { lineItemId: response.data.id });
  return response.data;
}

// ─────────────────────────────────────────────────────────────
//  4. Create a Payment
//
//  Processes a payment against an order using a test card.
//  In sandbox, we use a cardTransaction object that simulates
//  a Visa card (4111 1111 1111 1111) — no real card is charged.
//
//  Key fields:
//    - tender.labelKey: identifies payment method (credit card)
//    - cardTransaction: simulated card data for sandbox testing
//
//  Endpoint: POST /v3/merchants/{mId}/payments
//  Returns:  Payment object with payment.id and payment.result
// ─────────────────────────────────────────────────────────────
async function createPayment(accessToken, merchantId, orderId, amountInCents) {
  const client = cloverClient(accessToken);

  const payload = {
    order: { id: orderId },
    amount: amountInCents,
    tipAmount: 0,
    taxAmount: 0,
    currency: 'usd',
    // Required: tells Clover this is a credit card payment
    tender: { labelKey: 'com.clover.tender.credit_card' },
    // Sandbox test card — simulates Visa 4111 1111 1111 1111
    cardTransaction: {
      credit: false,
      type: 'AUTH',
      cardType: 'VISA',
      last4: '1111',
      first6: '411111',
      authCode: 'OK',
      referenceId: `ref_${Date.now()}`,
      transactionNo: `txn_${Date.now()}`,
      state: 'CLOSED',
      begBalance: 0,
      endBalance: 0,
      avsResult: 'SUCCESS',
      cvvResult: 'SUCCESS',
    },
  };

  logger.info('Creating payment', { orderId, amountInCents });
  const response = await client.post(`/merchants/${merchantId}/payments`, payload);
  logger.info('Payment created', {
    paymentId: response.data.id,
    result: response.data.result,
    orderId,
    amountInCents,
  });

  return response.data;
}

// ─────────────────────────────────────────────────────────────
//  5. Get Payment Status
//
//  Fetches a payment by ID to check its current status.
//  Used to verify whether a payment was successful or failed.
//
//  Endpoint: GET /v3/merchants/{mId}/payments/{paymentId}
// ─────────────────────────────────────────────────────────────
async function getPayment(accessToken, merchantId, paymentId) {
  const client = cloverClient(accessToken);
  logger.info('Fetching payment status', { paymentId });
  const response = await client.get(`/merchants/${merchantId}/payments/${paymentId}`);
  return response.data;
}

// ─────────────────────────────────────────────────────────────
//  6. Get Order Details (with line items)
//
//  Fetches an order and expands its line items so you can see
//  what products were included.
//
//  Endpoint: GET /v3/merchants/{mId}/orders/{orderId}?expand=lineItems
// ─────────────────────────────────────────────────────────────
async function getOrder(accessToken, merchantId, orderId) {
  const client = cloverClient(accessToken);
  const response = await client.get(`/merchants/${merchantId}/orders/${orderId}`, {
    params: { expand: 'lineItems' },
  });
  return response.data;
}


module.exports = {
  exchangeCodeForToken,
  createOrder,
  addLineItem,
  createPayment,
  getPayment,
  getOrder,
  BASE_URL,
};
