# Bhagwat Library — Backend API

Express.js backend powering WhatsApp messaging, automated reminders, PDF invoice generation, and the scheduling engine for the Bhagwat Library Management System.

---

## 🗂 Folder Structure

```
backend/
├── controllers/          # Route handler logic (invoiceController, reminderController, whatsappController)
├── middleware/           # errorHandler, rateLimiter
├── routes/               # Express routers (invoice.js, reminders.js, whatsapp.js)
├── services/             # Business logic (whatsappService, reminderService, schedulerService, pdfService)
├── utils/                # Shared utilities (logger)
├── logs/                 # Runtime log files (auto-created, gitignored)
├── uploads/              # Generated PDF invoices (gitignored)
├── .wwebjs_auth/         # WhatsApp session data (gitignored)
├── app.js                # Express app factory (middleware + routes)
├── server.js             # HTTP server entrypoint (binds PORT, handles shutdown)
├── .env                  # Local environment variables (gitignored)
├── .env.example          # Template — copy to .env and fill in values
└── package.json
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

| Variable               | Required | Description                                       |
|------------------------|----------|---------------------------------------------------|
| `PORT`                 | Yes      | HTTP port (default: `5000`)                       |
| `HOST`                 | No       | Bind host (default: `0.0.0.0`)                   |
| `NODE_ENV`             | No       | `development` or `production`                    |
| `ALLOWED_ORIGINS`      | No       | Comma-separated frontend URLs for CORS whitelist |
| `API_KEY`              | No       | Protects all `/api/*` routes if set              |
| `WHATSAPP_SESSION_PATH`| No       | Custom path for WhatsApp LocalAuth session       |
| `FIREBASE_PROJECT_ID`  | No       | Firebase project (if backend uses Firestore)     |
| `FIREBASE_CLIENT_EMAIL`| No       | Firebase service account email                   |
| `FIREBASE_PRIVATE_KEY` | No       | Firebase service account private key             |
| `CLOUDINARY_*`         | No       | Cloudinary credentials for cloud media storage   |
| `JWT_SECRET`           | No       | Secret for future JWT-based authentication       |

---

## 🚀 Quick Start

### Development

```bash
cd backend
npm install
npm run dev
```

### Production

```bash
cd backend
npm install --omit=dev
npm start
```

The server starts at `http://localhost:5000` by default.

---

---

## 🩺 Health & Root Checks

### Root URL Check
```
GET /
```
Response:
```json
{
  "success": true,
  "message": "Bhagwat Library Backend Running 🚀"
}
```

### Health Check (for Render / Koyeb / Railway health monitor)
```
GET /health
```
Response:
```json
{
  "status": "ok",
  "service": "Bhagwat Library Backend",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 120,
  "timestamp": "2026-08-08T17:00:00.000Z"
}
```

---

## 📡 API Endpoints

### WhatsApp

| Method | Endpoint                       | Description                        |
|--------|--------------------------------|------------------------------------|
| GET    | `/api/whatsapp/status`         | Connection status + QR code        |
| POST   | `/api/whatsapp/reconnect`      | Force re-connect / new QR          |
| POST   | `/api/whatsapp/send-message`   | Send a WhatsApp message            |
| POST   | `/api/whatsapp/refresh-qr`     | Refresh QR code                    |

### Reminders

| Method | Endpoint                        | Description                        |
|--------|---------------------------------|------------------------------------|
| GET    | `/api/reminders/settings`       | Fetch scheduler settings           |
| POST   | `/api/reminders/settings`       | Save scheduler settings            |
| POST   | `/api/reminders/trigger`        | Trigger an immediate reminder scan |
| GET    | `/api/reminders/logs`           | Fetch reminder logs                |
| GET    | `/api/reminders/scheduler-status` | Cron scheduler status            |

### Invoices

| Method | Endpoint                       | Description                        |
|--------|--------------------------------|------------------------------------|
| POST   | `/api/invoice/generate`        | Generate a PDF invoice             |

---

## ☁️ Render Deployment Guide

1. In the **Render Dashboard**, click **New +** -> **Web Service**.
2. Connect your GitHub repository.
3. Set the **Root Directory**: `backend` (if deploying just the backend folder).
4. Set the **Build Command**:
   ```bash
   npm install && npx puppeteer browsers install chrome
   ```
5. Set the **Start Command**:
   ```bash
   npm start
   ```
6. Set the **Health Check Path**: `/health`
7. In **Environment Variables**, add:
   - `NODE_ENV`: `production`
   - `PORT`: `5000` (Render will override automatically or use default)
   - `ALLOWED_ORIGINS`: `https://your-frontend.vercel.app` (your frontend domain)
   - `PUPPETEER_CACHE_DIR`: `/opt/render/.cache/puppeteer` (optional, for persistent browser caching)
8. Click **Deploy Web Service**.

---

## ☁️ Koyeb Deployment

1. Push this repository to GitHub.
2. Create a new Koyeb **Web Service**.
3. Set the **Run command**: `npm start`
4. Set the **Build command**: `npm install && npx puppeteer browsers install chrome`
5. Set the **Health check path**: `/health`
6. Add environment variables from `.env.example`.
7. Set `NODE_ENV=production` and `ALLOWED_ORIGINS=https://your-frontend-domain.vercel.app`.


---

## 🛡 Security Notes

- Never commit `.env` — it is in `.gitignore`
- Never commit `.wwebjs_auth/` — it contains your WhatsApp session
- Set `API_KEY` to a strong random string in production
- Set `ALLOWED_ORIGINS` to your exact frontend URL in production (never leave it empty in production)

---

## 📋 Requirements

- Node.js >= 18
- npm >= 9
- Google Chrome / Chromium (for WhatsApp — auto-installed by Puppeteer)
