# Deployment and /health monitoring

**Status: NOT deployed. No Asniher monitor exists yet. There is no monitor screenshot, and none is faked.**

## Can Asniher host this Node.js + PostgreSQL app? No.
Checked on https://asniher.com/ (home, /pricing, /docs, /docs/http-monitors, /api-monitoring) on 2026-11-05:
- Asniher is an **uptime monitoring and status-page service**: HTTP(S), keyword, SSL and cron-heartbeat monitors,
  alerts, status pages, badges.
- None of its plans (Free / Pro / Team) include app hosting, servers, containers, a Node.js runtime or PostgreSQL
  databases. Its docs list no deployment or database sections. The "Node.js", "Docker" and "Kubernetes" docs pages
  are about *adding monitoring to* your own services (health endpoints, heartbeat pings), not running them.
- Monitors can only target **public** URLs (private/localhost addresses are rejected), so the app must already be
  online somewhere before Asniher can check it.

So the professor's "deploy and monitor on Asniher" is only achievable as: **host the app on any Node + PostgreSQL
host, and use Asniher to monitor `GET /health`.** I have not deployed to any host and have not picked one (you asked
me not to use Railway or Fly.io). If the assignment text says the app itself must run on Asniher, ask your professor or
support@asniher.com how, since nothing on their site indicates it is possible. Keep a copy of this section as evidence.

## Files prepared
- `Dockerfile` + `.dockerignore`: host-neutral image (any Docker/container host, VPS, or a school server). On start it
  runs migrations + seed, then the web server; the email worker runs inside it. Untested here: Docker is not
  installed on this PC. The same app was tested without Docker (`npm start`).
- Without Docker, any Node 20+ host works: build `npm ci --omit=dev`, start `npm run db:setup && npm start`.
- `/health` (already built): 200 + `{"status":"ok",...,"database":{"status":"up"}}`, 503 if PostgreSQL is down.
- `.env.example`: all variables, placeholders only.

## What you need to do
1. **Choose/obtain a host** with Node 20+ and a PostgreSQL database and a public HTTPS URL (what your professor/school
   allows). Set these environment variables on it (never commit them): `DATABASE_URL` (or `PG*`), `PGSSL=true` if the
   database requires TLS, `RESEND_API_KEY`, `EMAIL_FROM`, `STAFF_API_KEY`, optional `NOTIFY_EMAIL`.
2. **Resend**: resend.com → API Keys → create `re_...`. Sender: `TableFlow <onboarding@resend.dev>` (delivers only to
   your own Resend account email) or a verified domain address.
3. **Git/GitHub** (Git is not installed on this PC) if the host deploys from a repository:
   `git init && git add -A && git commit -m "TableFlow"` then push. Check `.env` is not committed.
4. **Verify the deployment**: open `https://<your-app>/health` → expect HTTP 200 and `"database":{"status":"up"}`;
   open `https://<your-app>/?table=7`, place an order with your own email, confirm the Resend email arrives.
5. **Asniher monitor**: sign up at https://asniher.com/signup (Free: 5 monitors, 5-minute checks, no card).
   Create an **HTTP(S) monitor**: URL `https://<your-app>/health` · Method `GET` · Interval `5m` · Timeout `10s` ·
   Expected status `200` (default `200-299` also fine). Optional: a keyword monitor for `"status":"ok"` (case sensitive).
   Wait until it shows **Up**.
6. **Screenshot**: capture the real monitor page (URL + Up/200 status) and save it as `docs/asniher-monitor.png`.
   Never substitute a mock-up.

I can do the browser steps with you in the built-in browser after you log in to the host and Asniher yourself; I will
not type passwords or API keys for you.
