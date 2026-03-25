# Deployment Guide (Frontend + API)

This project deploys as:

- static frontend from `dist/index.html` (Vite single file build)
- Node.js API (`server/index.js`)
- SQLite DB file (`data/mwpanel.sqlite`)
- Nginx reverse proxy for `/api`
- PM2 process manager for API

## 1) Server requirements

- Linux VPS (Ubuntu 22.04+ recommended)
- Node.js 22+
- npm
- nginx
- pm2

Example install:

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## 2) Build release locally

Run on your local/dev machine:

```bash
npm ci
npm run typecheck
npm run build
```

Then upload project files to server (minimum required):

- `dist/`
- `server/`
- `data/` (or at least `data/mwpanel.sqlite`)
- `package.json`
- `package-lock.json`
- `.env` (based on `.env.example`)
- `deploy/pm2/ecosystem.config.cjs`

## 3) Configure environment

Copy `.env.example` to `.env` and set real values:

- `API_PORT` (default `8787`)
- `API_TOKEN` (must be strong in production, min 32 chars)
- `JWT_SECRET` (must be strong in production, min 32 chars)
- `JWT_EXPIRES_IN_SECONDS` (for example `28800` for 8 hours)
- `BOOTSTRAP_ADMIN_EMAIL` (initial admin account email)
- `BOOTSTRAP_ADMIN_PASSWORD` (initial admin password; required in production)
- `DB_PATH` (for example `data/mwpanel.sqlite`)
- `HEALTHCHECK_URL` (for example `http://127.0.0.1:8787/api/health`)

Note:

- Do not set `NODE_ENV` in `.env` (Vite reads this file and warns).
- `NODE_ENV=production` is set in PM2 config (`deploy/pm2/ecosystem.config.cjs`).

## 4) Install production dependencies on server

```bash
npm ci --omit=dev
```

## 5) Start API with PM2

Use ready config:

- `deploy/pm2/ecosystem.config.cjs`

Adjust `cwd` and secrets, then:

```bash
pm2 start deploy/pm2/ecosystem.config.cjs
pm2 save
pm2 startup
```

## 6) Configure Nginx

Ready config file:

- `deploy/nginx/mwpanel.conf`

Install it:

```bash
sudo cp deploy/nginx/mwpanel.conf /etc/nginx/sites-available/mwpanel.conf
sudo ln -s /etc/nginx/sites-available/mwpanel.conf /etc/nginx/sites-enabled/mwpanel.conf
sudo nginx -t
sudo systemctl reload nginx
```

By default config serves frontend from:

- `/var/www/mwpanel-crm-system-development/current/dist`

and proxies API to:

- `http://127.0.0.1:8787`

Adjust paths/domain before enabling config.

## 7) Health and diagnostics

Health endpoint is public:

```bash
curl http://127.0.0.1:8787/api/health
```

API healthcheck command:

```bash
npm run healthcheck:api
```

PM2 logs:

```bash
pm2 logs mwpanel-api
```

## 8) Backups

SQLite backup command:

```bash
npm run backup:db
```

Backups are stored under `data/backups`.

## 9) Security notes

- Login endpoint is `POST /api/auth/login`; app clients should use JWT via `Authorization: Bearer <token>`.
- Service-to-service calls can use `x-api-token` with a strong `API_TOKEN`.
- All `/api/*` routes (except `/api/health` and `/api/auth/login`) require authentication.
- Use firewall rules to expose only Nginx ports externally.

## 10) Response contract

Success:

```json
{
  "ok": true,
  "data": {},
  "requestId": "..."
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": []
  },
  "requestId": "..."
}
```
