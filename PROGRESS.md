# TableFlow — Progress

## Phase 1: Customer demo — COMPLETE
QR table entry, menu, item options, cart, order submission, order tracking, mobile-first UI (now in `public/`).

## Phase 2: Backend — COMPLETE except deployment (2026-11-02)

### Architecture (`src/`, Node + Express + PostgreSQL, 4 layers; each only calls the layer below)
| Layer | Folder | Responsibility |
|---|---|---|
| api | `src/api` | routes, request validation (`validators.js`), staff auth, HTTP responses/errors |
| services | `src/services` | pricing/order rules, payments (simulated), email templates + queue, email worker, health |
| data | `src/data` | **all SQL**: pool/transactions, migration runner, repositories, seed |
| models | `src/models` | constants, `AppError`, entity→DTO mappers |

`src/server.js` is the composition root (HTTP + email worker + demo status ticker). `test/layering.test.js` enforces the import rules and "SQL only in data".

### Requirements checklist
1. **PostgreSQL, migrations, seed, env config** — DONE. `src/data/migrations/001_init.sql`, `npm run migrate`, `npm run seed`, `npm run db:setup` (idempotent). Config via env / `.env` (`.env.example`, placeholders only).
2. **Resend email queue** — DONE and tested with a fake sender; **real Resend delivery NOT verified (no API key)**. Endpoints enqueue (`email_jobs`, in the same DB transaction as the order); worker leases jobs (`FOR UPDATE SKIP LOCKED`), sends via Resend REST API, stores `pending/sent/failed`, attempts, last error. 4 attempts max (first try + 3 retries), exponential backoff. Without a key the job honestly ends `failed` (observed).
3. **GET /health** — DONE. 200 `{status:"ok", app, database:{status:"up"}}`; 503 `{status:"unhealthy", database:{status:"down"}}` when the DB is unreachable (tested by pointing at a dead port). DB check has a 2s timeout.
4. **Deploy + monitor** — **NOT DONE (needs your accounts and a decision).** Asniher (asniher.com) turned out to be an uptime-monitoring/status-page service, **not a host**, so the app needs a separate host and Asniher then monitors its `/health`. Verified on asniher.com (home, pricing, docs, API-monitoring pages, 2026-11-05): no hosting, Node runtime or PostgreSQL on any plan. A host-neutral `Dockerfile` and `DEPLOYMENT.md` (exact host + monitor steps) are ready; no host chosen, nothing deployed (Railway and Fly.io excluded by you). The Dockerfile is untested (no Docker on this PC). No screenshot exists; none was faked (`docs/asniher-monitor.png` must come from the real monitor).
5. **Demo connected to backend** — DONE. Menu from `GET /api/menu`, orders via `POST /api/orders`, tracking polls `GET /api/orders/:id`. Server recomputes all prices. Added optional receipt email + payment choice in the cart, and `kitchen.html` (staff view, needs `STAFF_API_KEY`).
6. **Payments simulated** — DONE. "Pay at table" or "Pay online (simulated)"; UI says simulated; no card fields; the API rejects card-like fields; `payments` table accepts only provider `simulated`.

### API
`GET /health` · `GET /api/menu` · `POST /api/orders` · `GET /api/orders/:id` · staff (header `X-Staff-Key`): `GET /api/staff/orders`, `PATCH /api/staff/orders/:id/status`, `GET /api/staff/email-queue`.
Order status is simulated by age when `DEMO_AUTO_ADVANCE=true` (default); staff can also set it from `/kitchen.html`.

### Tested
`npm test`: 19/19 pass (16 at the time of phase 2) against a real PostgreSQL 18 (health 200/503, menu, pricing, validation, card rejection, staff auth, atomic email enqueue, worker sent/retry/failed, layering rules). Browser-tested the full customer flow against the live backend (order placed, status advanced live, no console errors).
Not tested: real Resend delivery, real phones/camera QR scan, production deployment, Safari.

### Run it (see README.md)
```
npm install
copy .env.example .env         # edit: PGPASSWORD=tableflow_dev, STAFF_API_KEY=..., RESEND_API_KEY=..., EMAIL_FROM=...
npm run dev                    # local PostgreSQL + migrate + seed + app in one terminal; keep it open
npm test                       # (DB must be running)
```

## Phase 3: Resend, offline fix, deployment prep (2026-11-05)
- **"Offline demo / backend unreachable" fixed.** Cause: the app and the dev database are plain processes; when they are not running (PC/session restart, closed terminal), or the page is opened from a file or another dev-server port, the UI silently fell back to fake local data. Now: no fake mode at all. The UI retries the API (same origin, `?api=`/`window.TF_API_BASE`, then `http://localhost:5173`), and otherwise shows a "Can't reach the server" screen with Try again. CORS enabled (`CORS_ORIGIN`). `npm run dev` starts DB + app together. Verified: an order placed from the browser is stored in PostgreSQL (order #136, table 7) with its email job queued.
- **Resend.** Already queue-based; now also covered by tests: request shape to `https://api.resend.com/emails` (Bearer key, from, to, subject), API error surfacing, and "placing an order never calls Resend from the request path". `npm test`: 19/19 pass. `RESEND_API_KEY` and `EMAIL_FROM` are env-only; `.env.example` has placeholders; `.env` is in `.gitignore` (the local `.env` holds only dev values).
- **Still not done:** real Resend delivery (no API key), hosting, Asniher monitor + screenshot. Git is still not installed.

## GitHub-only submission prep (2026-11-05)
All hosting / paid-service setup stopped. Nothing is deployed and no accounts were created. Secret audit: only the local, git-ignored `.env` holds a (dev-only) database password; `.env.example` has placeholders only; no API keys anywhere. `.gitignore` excludes `.env`, `.env.*` (except `.env.example`), `node_modules/`, `.pgdata/`, `.claude/`, logs. README has a Quick start. No project files were deleted or replaced. Hosting/monitoring remain documented in `DEPLOYMENT.md` but are out of scope for the free GitHub submission.

## Next steps (exact)
1. Get a host with Node 20+ and PostgreSQL from your professor/school (Asniher cannot host; ask them if the brief truly says it can). Install Git, push to GitHub (never commit `.env`).
2. Create a Resend API key + sender; put them in `.env` locally and in the host's env settings; send one real receipt to your own address.
3. Deploy per `DEPLOYMENT.md`; confirm `https://<app>/health` returns 200.
4. Create the Asniher HTTP monitor on that URL, wait for Up/200, save a real screenshot as `docs/asniher-monitor.png`.
4. Optional hardening: real auth for staff, WebSocket/SSE instead of polling, idempotency keys on order POST, unguessable table tokens in QR URLs, more tests (HTTP-level email failure from Resend).

## Visual redesign (2026-11-02)
Charcoal/graphite theme across the customer app, QR sheet and kitchen page (`public/styles.css`): neutral grays, white text, hairline borders, serif headings, no emoji or colorful accents (menu items use neutral monogram tiles; emoji data is no longer displayed). Only visual changes; all features unchanged. Also fixed the missing restaurant tagline from the API. Checked at 375px width in the browser (menu, item sheet, cart, tracking, kitchen, QR); not checked on a physical phone or Safari.
