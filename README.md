# Clover Checkout — Payment Gateway Integration

A web-based checkout application that integrates with the **Clover REST API** to process payments in the sandbox environment. Users can enter a payment amount and item description, and the app creates an order, adds a line item, and processes the payment via Clover's APIs.

---

## Project Structure

```
clover-checkout/
├── src/
│   ├── server.js                 # Express app — middleware, routes, error handling
│   ├── routes/
│   │   ├── auth.js               # OAuth2 routes (login, callback, status, logout)
│   │   └── payments.js           # Payment API routes (checkout, orders, payments)
│   ├── services/
│   │   └── cloverService.js      # All Clover REST API calls in one place
│   ├── middleware/
│   │   └── requireAuth.js        # Session guard — blocks unauthenticated requests
│   └── utils/
│       └── logger.js             # Winston logger (console + file)
├── public/
│   └── index.html                # Checkout UI (Amount + Description + Pay Now)
├── logs/
│   └── transactions.log          # Local transaction audit trail (auto-created)
├── .env.example                  # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

---

## Setup

### 1. Clover Sandbox Developer Account

1. Go to [https://sandbox.dev.clover.com/developers](https://sandbox.dev.clover.com/developers)
2. Create a new app — note the **App ID** and **App Secret**
3. Under **App Settings → Requested Permissions**, enable:
   - Customers (Read/Write)
   - Employees (Read/Write)
   - Inventory (Read/Write)
   - Merchant (Read/Write)
   - **Orders (Read/Write)**
   - **Payments (Read/Write)**
   - Ecommerce → Enable online payments
4. Under **Web Configuration**, set:
   - **Site URL**: `http://localhost:3000`
   - **CORS Domain**: `http://localhost:3000`
5. REST Configuration
   - Site URL: http://localhost:3000
   - Alternate Launch Path: /api/oauth/callback

6. Install the app on your test merchant

### 2. Environment Variables

```bash
cp .env.example .env
```

Fill in your `.env`:

```env
CLOVER_APP_ID=your_app_id
CLOVER_APP_SECRET=your_app_secret
PORT=3000
REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=any-long-random-string
```

### 3. Install & Run

```bash
npm install
npm run dev     # with auto-reload (nodemon)
# or
npm start       # plain node
```

Open [http://localhost:3000](http://localhost:3000)

---

## OAuth2 Authentication Flow

This app implements the **Authorization Code Flow**:

```
Browser                  Express Server               Clover Sandbox
  │                           │                             │
  │── GET /auth/login ──────> │                             │
  │                           │── redirect ───────────────> │
  │                           │                             │ (merchant logs in
  │                           │                             │  and approves app)
  │                           │ <── redirect with ?code= ── │
  │                           │                             │
  │                           │── GET /oauth/token ───────> │
  │                           │ <── { access_token } ────── │
  │                           │                             │
  │ <── redirect to / ─────── │ (token stored in session)   │
```

**Security**: The access token is stored server-side in an `express-session`. The browser only receives a `connect.sid` session cookie with `httpOnly: true`, so JavaScript cannot read the token.

---

## Payment Flow

When the user clicks **Pay Now**, the `/api/checkout` endpoint runs three API calls in sequence:

```
1. POST /v3/merchants/{mId}/orders
   → Creates an empty order
   ← Returns orderId

2. POST /v3/merchants/{mId}/orders/{orderId}/line_items
   → Attaches the product name and price to the order
   ← Returns lineItemId

3. POST /v3/merchants/{mId}/payments
   → Processes the payment with a sandbox test card (Visa 4111...1111)
   ← Returns paymentId + result (SUCCESS/FAIL)
```

All amounts are sent in **cents** ($22.00 → 2200). The sandbox test card is used automatically — no real card is charged.

---

## API Reference

### Authentication

| Method | Path            | Description                              |
|--------|-----------------|------------------------------------------|
| GET    | `/auth/login`   | Redirects to Clover OAuth login page     |
| GET    | `/auth/callback`| Clover redirects here with `?code=`      |
| GET    | `/auth/status`  | Returns `{ authenticated, merchantId }`  |
| GET    | `/auth/logout`  | Destroys the session                     |

### Payments (require active session)

| Method | Path                     | Body                                    | Description                        |
|--------|--------------------------|-----------------------------------------|------------------------------------|
| POST   | `/api/checkout`          | `{ amount, description }`               | Full flow: order + item + payment  |
| POST   | `/api/orders`            | —                                       | Create an empty order              |
| GET    | `/api/orders/:id`        | —                                       | Get order with line items          |
| POST   | `/api/orders/:id/items`  | `{ amount, description }`               | Add a line item to an order        |
| POST   | `/api/payments`          | `{ orderId, amount }`                   | Create payment against an order    |
| GET    | `/api/payments/:id`      | —                                       | Get payment status                 |

### Postman Testing

1. Login via browser at `http://localhost:3000/auth/login`
2. Copy the `connect.sid` cookie from browser DevTools → Application → Cookies
3. In Postman, go to **Cookies** → add domain `localhost` → add `connect.sid` value
4. All endpoints will now work with the session cookie attached

---

## Error Handling

- **Missing fields**: Returns 400 with a list of required fields
- **Invalid amount**: Returns 400 with a descriptive error message
- **Unauthenticated**: Returns 401 with a link to `/auth/login`
- **Expired token**: Returns 401, destroys the session, and prompts re-login
- **Clover API errors**: Logged via Winston and returned with details

---

## Transaction Logging

Every significant event is logged to both the console and `logs/transactions.log`:
- OAuth token exchanges
- Order creation
- Line item additions
- Payment results (success/failure)
- All errors with full context

---

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: HTML + CSS + vanilla JavaScript
- **HTTP Client**: Axios (for Clover API calls)
- **Session**: express-session (server-side, cookie-based)
- **Logging**: Winston (console + file transports)
- **API Testing**: Postman
