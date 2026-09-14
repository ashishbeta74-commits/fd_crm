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
2. **Region: US East (Ohio / Virginia).** Atlas and the team are on the East Coast; Oregon adds a round
   trip to every one of the ~15 queries a dashboard load makes. Render cannot move a service, so create a
   new one in the right region and point Netlify's `NEXT_PUBLIC_API_BASE` at it.
3. **`SHEET_SYNC_MINUTES=30`** on the API. Each cycle downloads and parses all 11 linked workbooks; at 1 or
   5 minutes that is a permanent background load on a small instance (Google throttles it too).
4. The code side is done: dashboard stats, meta, and daily reports are memoised for 10-60 s and shared
   by every open tab, "recent activity" only unwinds the 150 most recently touched contacts, history
   entries are indexed by time, and pages poll once a minute instead of every 15-30 s (a tab that regains
   focus refreshes immediately regardless).
