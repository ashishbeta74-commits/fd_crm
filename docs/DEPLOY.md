# Deploying

The CRM is two apps in one repo:

| Part | Folder | Where it runs |
|---|---|---|
| Web app (Next.js) | `client/` | **Netlify** |
| API (Express + timers) | `server/` | a Node host with a long-lived process: **Render**, **Railway** or **Fly.io** |
| Database | – | **MongoDB Atlas** (already in use) |

The API cannot run on Netlify: Netlify only runs short serverless functions, while the API keeps
timers alive (Google Sheet re-sync and write-back, push reminders and the daily digest, the daily
progress-report capture), holds uploads in memory between the preview and the commit step, and
accepts spreadsheet uploads larger than Netlify's function body limit.

## 1. The API (Render example)

1. Push the repo to GitHub (see "Git" below).
2. On Render: **New → Web Service**, pick the repo.
   - Root directory: `server`
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance: the free tier sleeps after 15 min idle, which pauses the sheet syncs and reminders; the cheapest paid tier keeps it awake.
3. Environment variables: copy the keys from `server/.env.example`. Required:
   - `MONGODB_URI` – your Atlas string (allow Render's outbound IPs in Atlas, or `0.0.0.0/0`).
   - `APP_URL` – the Netlify URL of the web app (used in push notifications and emails).
   - `MONGOMS_DISABLE_POSTINSTALL=1` – skips downloading the embedded-MongoDB binary.
   - plus SMTP / VAPID / Google keys as in your local `.env`. `SESSION_SECRET` is optional (generated once and stored in the database when unset).
4. Note the service URL, e.g. `https://famousdrive-crm-api.onrender.com`. Check `https://…/api/health` returns `"ok": true`.

Railway and Fly.io work the same way (root directory `server`, start `npm start`, same variables).

## 2. The web app (Netlify)

1. On Netlify: **Add new site → Import an existing project**, pick the repo. `netlify.toml` at the repo root already sets the base directory (`client`), the build command and Node 22; Netlify adds its Next.js runtime automatically.
2. Environment variables (Site settings → Environment variables):
   - `NEXT_PUBLIC_API_BASE` = `https://<your-api-host>/api` – the browser calls the API directly (the API allows CORS and the session token travels as a Bearer header). This keeps uploads and long imports off Netlify's function limits.
   - Do **not** set `API_URL`; that proxy route is only for local development.
3. Deploy. Sign in with a user from `server/initial-passwords.txt` (created on the API's first start; change the passwords from the user menu).

Custom domain: add it to the Netlify site, then set `APP_URL` on the API to the same URL.

## 3. Git

Git is installed at `C:\Program Files\Git\cmd`; if PowerShell cannot find it, add that folder to your PATH.

```powershell
git init
git add .
git commit -m "CRM"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.gitignore` keeps `server/.env` (credentials), `server/initial-passwords.txt`, `node_modules`, `.next` and the embedded DB out of the repo. Commit `server/.env.example` instead.

## Checks after the first deploy

- `https://<api>/api/health` → `{ "ok": true, "dbState": "connected" }`
- Web app loads, sign-in works, the dashboard shows your contacts.
- Import page → "Sync now" on a linked sheet finishes; the server log shows `[sync]` lines every `SHEET_SYNC_MINUTES`.
- Reminders bell: allow notifications once; push needs the VAPID keys on the API.

## Speed

Measured from India against a Render **free** instance in Oregon, the dashboard took about 2 s and busy
moments queued requests for 8 s or more. What helps, most effective first:

1. **Instance type: Starter, not Free.** Free gives a tenth of a CPU and sleeps after 15 min idle; every
   request then waits behind the sheet sync or the next report capture. Starter removes both problems.
2. **Region: Singapore.** The Atlas cluster (`crm.ajxxnnz`) is in **Mumbai** and the team works from India.
   From Oregon every one of the ~15 queries a dashboard load makes crosses the Pacific twice: a bare
   `/api/health` (one ping) measured 0.55 s. Render cannot move a service, so create a new Web Service in
   Singapore with the same settings and variables, check its `/api/health`, then point Netlify's
   `NEXT_PUBLIC_API_BASE` at the new URL and delete the Oregon one. (If the cluster ever moves to the US,
   move the API with it: the two must sit in the same part of the world.)
3. **`SHEET_SYNC_MINUTES=30`** on the API. Each cycle downloads and parses all 11 linked workbooks; at 1 or
   5 minutes that is a permanent background load on a small instance (Google throttles it too).
4. The code side is done: dashboard stats, meta, and daily reports are memoised for 10-60 s and shared
   by every open tab, "recent activity" only unwinds the 150 most recently touched contacts, history
   entries are indexed by time, the per-request user lookup behind the session token is cached for 30 s,
   and pages poll once a minute instead of every 15-30 s (a tab that regains focus refreshes immediately
   regardless).

### What the code now does (2026-09-16)

Measured against the live Render service, a cold `GET /api/stats` took **7.3 s** and `/api/meta` **4.8 s**,
while a bare `/api/health` (one database ping) took 0.55 s. So two things were in play: too many
collection scans per request, and every one of them crossing the Pacific.

- **One pass instead of eleven.** `/api/stats` ran 19 queries, eleven of them full scans of the contacts
  collection (counts per stage, per priority, per sheet, the follow-up buckets, calls today, and the four
  "entered today" counts). They are now a single `$facet` aggregation over a projected document, so the
  collection is read once. `/api/meta` went from six scans to one the same way. Every number was
  compared against the old queries before the change shipped.
- **Nothing waits for the database.** The cache serves a value immediately and refreshes behind it
  (stale-while-revalidate), and a background timer keeps `stats` and `meta` warm, so a page load reads
  them from the API's memory.
- **The session check is off the critical path.** The browser used to render nothing until
  `GET /api/auth/me` came back, so every page load paid one full round trip before it even asked for its
  own data. The signed-in user is now remembered next to the token, the app renders from it at once and
  re-checks the session in the background. A token the server rejects still lands on the sign-in screen.
- Indexes for the list's sorts (`createdAt`/`updatedAt`/`lastContactedAt` with `_id`), and an unfiltered
  list reads the collection's own count instead of scanning.

What is left is the ~0.5 s floor on every request: India → Oregon and Oregon → Mumbai. Only moving the
API next to the database fixes that (step 2 above). Responses are already compressed by Render
(29 KB of contacts travels as 2.6 KB), so payload size is not worth chasing.
