/**
 * Clover API service layer.
 *
 * Documented flow used by this prototype:
 *  1. OAuth token exchange
 *  2. Platform REST API: create order
 *  3. Platform REST API: add line item
 *  4. Ecommerce token API: tokenize a sandbox test card
 *  5. Ecommerce API: pay for the existing order with the source token
 *  6. Platform REST API: retrieve order/payment status
 */

const axios = require('axios');
const logger = require('../utils/logger');

const OAUTH_BASE_URL = 'https://sandbox.dev.clover.com';
const PLATFORM_BASE_URL = 'https://apisandbox.dev.clover.com';
const TOKEN_BASE_URL = 'https://token-sandbox.dev.clover.com';
const ECOMMERCE_BASE_URL = 'https://scl-sandbox.dev.clover.com';

function platformClient(accessToken) {
  return axios.create({
    baseURL: `${PLATFORM_BASE_URL}/v3`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': process.env.CLOVER_USER_AGENT || 'CloverCheckoutDemo/1.0',
    },
    timeout: 15000,
  });
}

function ecommerceClient(privateToken) {
  return axios.create({
    baseURL: `${ECOMMERCE_BASE_URL}/v1`,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${privateToken}`,
      'User-Agent': process.env.CLOVER_USER_AGENT || 'CloverCheckoutDemo/1.0',
    },
    timeout: 15000,
  });
}

async function exchangeCodeForToken(code) {
  const url = `${OAUTH_BASE_URL}/oauth/token`;
  const params = {
    client_id: process.env.CLOVER_APP_ID,
    client_secret: process.env.CLOVER_APP_SECRET,
    code,
  };

  logger.info('Exchanging auth code for access token', { url });
  const response = await axios.get(url, { params, timeout: 15000 });
  const { access_token, merchant_id } = response.data;

  if (!access_token) throw new Error('No access_token in Clover token response');
  logger.info('Token exchange successful', { merchant_id });
  return { access_token, merchant_id };
}

async function createOrder(accessToken, merchantId) {
  const client = platformClient(accessToken);
  logger.info('Creating order', { merchantId });

  const response = await client.post(`/merchants/${merchantId}/orders`, {
    state: 'open',
    testMode: true,
    title: 'Web Checkout',
  });

  logger.info('Order created', { orderId: response.data.id });
  return response.data;
}

async function addLineItem(accessToken, merchantId, orderId, { amountInCents, description }) {
  const client = platformClient(accessToken);
  logger.info('Adding line item', { orderId, amountInCents, description });

  const response = await client.post(
    `/merchants/${merchantId}/orders/${orderId}/line_items`,
    { price: amountInCents, name: description, unitQty: 1000 }
  );

  logger.info('Line item added', { lineItemId: response.data.id });
  return response.data;
}

/**
 * Creates a single-use Clover source token from an official sandbox test card.
 * This endpoint requires the Ecommerce PUBLIC token in the apikey header.
 */
async function tokenizeTestCard(publicToken) {
  if (!publicToken) {
    throw new Error('CLOVER_ECOM_PUBLIC_TOKEN is required to tokenize the sandbox card');
  }

  const response = await axios.post(
    `${TOKEN_BASE_URL}/v1/tokens`,
    {
      card: {
        number: process.env.CLOVER_TEST_CARD_NUMBER || '6011361000006668',
        exp_month: process.env.CLOVER_TEST_CARD_EXP_MONTH || '12',
        exp_year: process.env.CLOVER_TEST_CARD_EXP_YEAR || '2030',
        cvv: process.env.CLOVER_TEST_CARD_CVV || '123',
        brand: process.env.CLOVER_TEST_CARD_BRAND || 'DISCOVER',
      },
    },
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: publicToken,
        'User-Agent': process.env.CLOVER_USER_AGENT || 'CloverCheckoutDemo/1.0',
      },
      timeout: 15000,
    }
  );

  if (!response.data?.id?.startsWith('clv_')) {
    throw new Error('Clover tokenization did not return a valid source token');
  }

  logger.info('Sandbox card tokenized', { last4: response.data.card?.last4 });
  return response.data;
}

/**
 * Pays an existing Clover order with a single-use source token.
 * Official endpoint: POST https://scl-sandbox.dev.clover.com/v1/orders/{orderId}/pay
 */
async function payForOrder(privateToken, orderId, source, amountInCents, clientIp) {
  if (!privateToken) {
    throw new Error('CLOVER_ECOM_PRIVATE_TOKEN is required to pay for the order');
  }

  const client = ecommerceClient(privateToken);
  logger.info('Paying for order', { orderId, amountInCents });

  const response = await client.post(
    `/orders/${orderId}/pay`,
    {
      amount: amountInCents,
      currency: 'usd',
      source,
      ecomind: 'ecom',
    },
    {
      headers: {
        'x-forwarded-for': clientIp || '127.0.0.1',
      },
    }
  );

  logger.info('Order payment completed', {
    orderId,
    paymentId: response.data?.id,
    status: response.data?.status || response.data?.result,
  });
  return response.data;
}

async function getPayment(accessToken, merchantId, paymentId) {
  const client = platformClient(accessToken);
  const response = await client.get(`/merchants/${merchantId}/payments/${paymentId}`);
  return response.data;
}

async function getOrder(accessToken, merchantId, orderId) {
  const client = platformClient(accessToken);
  const response = await client.get(`/merchants/${merchantId}/orders/${orderId}`, {
    params: { expand: 'lineItems,payments' },
  });
  return response.data;
}

module.exports = {
  exchangeCodeForToken,
  createOrder,
  addLineItem,
  tokenizeTestCard,
  payForOrder,
  getPayment,
  getOrder,
  OAUTH_BASE_URL,
  PLATFORM_BASE_URL,
  TOKEN_BASE_URL,
  ECOMMERCE_BASE_URL,
  BASE_URL: OAUTH_BASE_URL,
};
