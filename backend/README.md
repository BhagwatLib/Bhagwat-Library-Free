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

### Health Check
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

## 🌐 Local Architecture

The backend runs locally on your PC at `http://localhost:5000`:

```
Frontend (localhost:5173)  ──►  Local Backend (localhost:5000)  ──►  WhatsApp Web.js
                                                                    └──►  MongoDB Atlas (RemoteAuth)
```

### Running Locally

1. Start the backend:
   ```bash
   npm start
   # or: cd backend && npm start
   ```

2. Start the frontend:
   ```bash
   npm run dev
   ```

---

## 🛡 Security Notes

- Never commit `.env` — it is in `.gitignore`
- Never commit `.wwebjs_auth/` — it contains your WhatsApp session
- Set `ALLOWED_ORIGINS` to your frontend URL(s) or leave empty for open development

---

## 📋 Requirements

- Node.js >= 18
- npm >= 9
- Google Chrome or Microsoft Edge installed on the local system

