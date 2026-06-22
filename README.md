# Clover Payment Gateway Integration

A Node.js/Express web application that integrates with the Clover REST API to process sandbox payments via OAuth2 authentication.

## Tech Stack

- **Backend:** Node.js, Express
- **Authentication:** OAuth2 Authorization Code Flow
- **Session Management:** express-session (server-side)
- **HTTP Client:** Axios
- **Logging:** Winston
- **Frontend:** HTML, CSS, JavaScript

---

## API Flow

This project implements the following documented Clover API flow:

```
1. OAuth2 token exchange
   GET https://sandbox.dev.clover.com/oauth/token

2. Create order
   POST https://apisandbox.dev.clover.com/v3/merchants/{mId}/orders

3. Add line item
   POST https://apisandbox.dev.clover.com/v3/merchants/{mId}/orders/{orderId}/line_items

4. Tokenize sandbox test card
   POST https://token-sandbox.dev.clover.com/v1/tokens

5. Pay for order
   POST https://scl-sandbox.dev.clover.com/v1/orders/{orderId}/pay

6. Fetch payment status
   GET https://apisandbox.dev.clover.com/v3/merchants/{mId}/payments/{paymentId}

7. Fetch order details
   GET https://apisandbox.dev.clover.com/v3/merchants/{mId}/orders/{orderId}?expand=lineItems,payments
```

---

## Setup

### Prerequisites

- Node.js v18+
- A Clover sandbox developer account: https://sandbox.dev.clover.com

### 1. Create a Clover Sandbox App

1. Log in to the Clover sandbox developer dashboard
2. Create a new app
3. Under **App Settings**, set the OAuth redirect URL to:
   ```
   http://localhost:3000/auth/callback
   ```
4. Under **Requested Permissions**, enable: `Orders`, `Payments`, `Merchant`
5. Install the app on your test merchant

### 2. Generate Ecommerce API Tokens

In your test Merchant Dashboard:

```
Settings → View All Settings → Ecommerce → Ecommerce API Tokens → Create (API type)
```

This gives you two tokens:
- **Public token** — used in the `apikey` header for card tokenization (`POST /v1/tokens`)
- **Private token** — used as the Bearer token for payment calls (`POST /v1/orders/{orderId}/pay`)

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Fill in the following values in `.env`:

```env
CLOVER_APP_ID=your_app_id
CLOVER_APP_SECRET=your_app_secret
CLOVER_ECOM_PUBLIC_TOKEN=your_ecommerce_public_token
CLOVER_ECOM_PRIVATE_TOKEN=your_ecommerce_private_token
REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=replace-with-a-long-random-string
PORT=3000
```

> `CLOVER_API_TOKEN` is optional. When set, it is used for Platform REST API calls (`/v3/...`) instead of the OAuth session token.

### 4. Install Dependencies and Run

```bash
npm install
npm start
```

Or for development with auto-restart:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Usage

1. Open `http://localhost:3000`
2. Click **Login with Clover** — you will be redirected to the Clover OAuth login page
3. Approve the app with your sandbox merchant credentials
4. You are redirected back to the checkout page
5. Enter an **amount** and **description**, then click **Submit Payment**
6. The payment result is displayed on screen and logged locally under `logs/transactions.log`

---

## Application Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/auth/login` | Redirect to Clover OAuth login |
| GET | `/auth/callback` | Exchange authorization code for access token |
| GET | `/auth/status` | Return current session authentication status |
| GET | `/auth/logout` | Destroy session |
| POST | `/api/checkout` | Full payment flow: order → line item → tokenize → pay |
| POST | `/api/orders` | Create an empty order |
| GET | `/api/orders/:id` | Fetch order with line items and payments |
| POST | `/api/orders/:id/items` | Add a line item to an existing order |
| POST | `/api/payments` | Tokenize test card and pay an existing order |
| GET | `/api/payments/:id` | Fetch payment status and details |
| GET | `/health` | Server health check |

---

## Project Structure

```
clover-checkout/
├── src/
│   ├── server.js              # Express app entry point
│   ├── routes/
│   │   ├── auth.js            # OAuth2 routes
│   │   └── payments.js        # Payment and order routes
│   ├── services/
│   │   └── cloverService.js   # All Clover API calls
│   ├── middleware/
│   │   └── requireAuth.js     # Session auth guard
│   └── utils/
│       └── logger.js          # Winston logger
├── public/
│   └── index.html             # Checkout UI
├── logs/
│   └── transactions.log       # Local transaction log
├── .env.example
├── package.json
└── README.md
```

---

## Security Notes

- OAuth access tokens and Ecommerce private tokens are stored server-side only — never exposed to the browser
- The browser receives only an HTTP-only session cookie
- Card data is never stored — the sandbox test card is tokenized on each request and the single-use `clv_...` token is discarded after payment
- No real card is charged — all transactions use the official Clover sandbox test card

---

## Requirement Mapping

| Requirement | Implementation |
|---|---|
| OAuth2 authentication | `/auth/login` → `/auth/callback` → session |
| Secure token storage | Server-side express-session + `.env` |
| Create a new order | `POST /v3/merchants/{mId}/orders` |
| Add a line item | `POST /v3/merchants/{mId}/orders/{orderId}/line_items` |
| Initiate payment using test token | Tokenize via `/v1/tokens` → pay via `/v1/orders/{orderId}/pay` |
| Display payment status | Checkout response + frontend UI |
| Log transaction details locally | Winston file logger → `logs/transactions.log` |
| Basic frontend UI | `public/index.html` — Amount, Description, Submit |
| Error handling | Try/catch on all API calls with structured error responses |



## Use below card details to test the scenarios
Scenario 1 — Successful payment 
CLOVER_TEST_CARD_NUMBER=4242424242424242
CLOVER_TEST_CARD_BRAND=VISA

Scenario 2 — Declined payment
CLOVER_TEST_CARD_NUMBER=4264281511117771
CLOVER_TEST_CARD_BRAND=VISA


Scenario 3 — Invalid CVV error
CLOVER_TEST_CARD_NUMBER=4242424242424242
CLOVER_TEST_CARD_CVV=99
