# CRM

Contact / lead pipeline CRM with Excel import.

- **Frontend**: Next.js (App Router, JavaScript) + Tailwind CSS + shadcn/ui, in `client/`
- **Backend**: Node.js + Express, in `server/`
- **Database**: MongoDB (embedded zero-install MongoDB by default, or your own / Atlas)

## Quick start

```bash
npm install          # installs server + client (one lockfile at the root)
npm run sample       # optional: writes samples/sample-contacts.xlsx (3 sheets) to try the import
npm run dev          # starts MongoDB (embedded), the API on :4000 and the web app on :3000
```

Open http://localhost:3000, go to **Import**, choose the Excel file, check the column mapping per sheet and import.

The first `npm run dev` downloads the MongoDB binary (about 600 MB, once). Data is stored in `.data/mongo` at the repo root and survives restarts.

### How the web app reaches the API

By default the web app calls relative `/api/...` URLs and `client/next.config.mjs` proxies them to `http://localhost:4000` (set `API_URL` to change the target). `client/.env.local` can instead set `NEXT_PUBLIC_API_BASE=http://localhost:4000/api` so the browser talks to the API directly; the API allows CORS. If you edit `next.config.mjs` while `next dev` is running, restart it.

## Using your own MongoDB (local install or Atlas)

Edit `server/.env`:

```
MONGODB_URI=mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/crm
```

`npm run dev` notices the external URI and skips the embedded database. For Atlas, the machine's public IP must be on the
cluster's **Network Access** list (Atlas → Network Access → Add IP Address), otherwise the API logs
"Could not connect to any servers in your MongoDB Atlas cluster" and keeps retrying. To go back to the embedded database set
`MONGODB_URI=mongodb://127.0.0.1:27017/crm`.

To move data already imported into the embedded database over to Atlas (once it is reachable), start the embedded database
(`npm run db -w server` with `MONGODB_URI` temporarily pointing at `mongodb://127.0.0.1:27017/crm`, or just leave it running) and run:

```bash
npm run copy-db -w server -- mongodb://127.0.0.1:27017/crm "mongodb+srv://user:password@cluster.../crm"
```

It copies the `contacts` and `importbatches` collections. If the target already has data, add `--merge` to keep it and only add
the documents it does not have yet (use `--skip-list="Fora Travel"` to leave out a list the target already imported), or
`--force` to replace everything in the target.

**Which database the app uses is decided by `MONGODB_URI` in `server/.env` at start-up.** Sheets imported while the API
pointed at the embedded database live in `.data/mongo`, and sheets imported while it pointed at Atlas live in Atlas; if the
setting changes between restarts the other database's sheets seem to vanish. Keep one setting (Atlas now) and use
`copy-db --merge` to bring data over.

## Importing from a Google Sheet link (integration)

On the **Import** page paste a Google Sheets link (for example `https://docs.google.com/spreadsheets/d/<id>/edit?gid=0#gid=0`).
The sheet must be shared as **Anyone with the link – Viewer** (Share → General access). The tab the link points to is imported;
other tabs are shown but switched off. The column mapping is suggested automatically and can be adjusted before importing.

Linked sheets are remembered: **Sync now** (Import page → Linked sheets, or on the import result) re-reads the sheet,
adds new rows, updates existing contacts and adds new call rounds. With `SHEET_SYNC_MINUTES=30` in `server/.env`
the server also re-syncs every linked sheet automatically every 30 minutes while it is running (set `0` to turn that off).

What a sync does and does not do:
- matches rows to contacts by email (else name + company, else name + phone); new rows become contacts, existing ones get the sheet's non-empty values, notes are appended;
- tabs that are **not** imported (the "RAW" Seamless exports next to a "Cleaned" calling tab, for example) still fill in empty fields of the imported contacts - title, location, website, company phone, second email, LinkedIn, company info - matched the same way; nothing already filled in is overwritten (the import result shows an "enriched" count per tab);
- columns added to a tab after it was imported are mapped automatically on the next sync, the way a fresh import would map them, as long as the field is not already mapped to another column;
- a newly filled follow-up date + status becomes a call in the contact's history and moves the stage (Connected / Voice Mail / Wrong Number / Prospect …);
- stages you set in the CRM (Ready, Converted, Done, Future Booking) are kept; the sheet only moves contacts that are still New, Started, Connected, Voice Mail or Wrong Number;
- nothing is deleted - rows removed from the sheet stay in the CRM (undo the import if you want them gone).

Each import gets a **list name** (defaults to the sheet title; "Travel Advisors" used twice becomes "Travel Advisors 2", and a
workbook with several tabs selected becomes "List - Tab"). Contacts carry it, and the Contacts page filters by
**All sheets** or a list name. By default rows **without a Contact Phone 1 are not imported** ("Skip rows without a contact phone",
counted as "No phone" in the result).

### Two-way sync (write CRM changes back into the sheet)

With a Google **service account** the CRM can write its own state into each linked sheet, so the team sees stage,
priority, tags, follow-up, booking, last call, status and notes next to their own columns:

1. In Google Cloud create a service account (APIs & Services → Credentials), download its JSON key, and enable the
   **Google Sheets API** and **Google Drive API** for the project.
2. Save the key as `server/google-service-account.json` (git-ignored) and set `GOOGLE_SERVICE_ACCOUNT_FILE=./google-service-account.json`
   in `server/.env` (or put the JSON inline in `GOOGLE_SERVICE_ACCOUNT_JSON`), then restart the API.
3. Share each calling sheet with the account's `client_email` as **Editor** (the Import page shows the address with a copy button).
4. On the Import page switch on **Two-way** for the sheet. **Push now** writes every contact of the sheet; afterwards every change
   made in the CRM is pushed automatically about 20 s later (`SHEET_WRITEBACK_SECONDS`).

The CRM writes a block of `CRM …` columns (`CRM Stage`, `CRM Priority`, `CRM Tags`, `CRM Follow-up`, `CRM Follow-up Note`,
`CRM Booking`, `CRM Last Call`, `CRM Status`, `CRM Notes`, `CRM Link`, `CRM Updated`) at the right end of the imported tab, creating
them when missing. Those columns are ignored on import and do not count as a sheet change for the auto-sync, so the team's own
columns are never touched. The optional **mapped cols** switch additionally overwrites the sheet's mapped Stage / Next follow-up /
Booking / Priority / Tags columns (never the calling rounds or remarks). Rows are located by the row number remembered at import
(checked against the row's email / name) and otherwise by email, name + company or name + phone, so inserted or re-sorted rows still
match; contacts that only exist in the CRM are reported as "unmatched" and are not appended. With the service account configured,
private sheets shared with it also import and sync without being made public.

### Priority, tags and reminders

- Every contact has a **priority** (Urgent / High / Medium / Low / none) and free-form **tags**. Both are editable on the contact page,
  in the edit form, and in bulk from the Contacts list (set priority, add / remove tags); the list and the export
  show them, and the Contacts filters / sort include them (`?priority=urgent,high&tag=VIP&sort=priorityRank`). Spreadsheet columns
  named Pri / Priority and Tags / Category / Labels are imported (values like `P1`, `high`, `A` are understood).
- **Reminders** are dated (date + time) notes on a contact with their own priority, which defaults to the contact's priority.
  Set one with *Remind me* on the contact page. Due reminders appear in the **bell** in the sidebar (most urgent first, with Done /
  Snooze), on the **Follow-ups** page and on the dashboard; the bell can also raise browser notifications when a reminder comes due
  while the app is open. Urgent / High contacts without a follow-up date or open reminder are flagged on the contact page and counted
  on the dashboard.

### LinkedIn CRM (second pipeline on the same contacts)

**LinkedIn CRM** (sidebar, and the blue button on the dashboard) is a separate workspace modelled on the team's
`FamousDrive_LinkedIn_Dashboard.xlsx` workbook. It uses the same contacts (everyone with a LinkedIn profile URL, or every
contact with *Show: Every contact*) but its own status: the Playbook's 16 stages in four groups - Warm-Up (Identified, Followed,
Engaged With Content), Connect (Request Sent, Connected, Welcome Sent, In Conversation), Convert (Need Identified, Offer Sent,
Trial Ride Booked, Client Won) and Parked / Closed (Nurture - Not Now, No Response, Not A Fit, Declined, Withdrew Request).

Like the workbook, the stage is **calculated from the dates you log**: click *Followed the profile*, *They accepted*, *Client won*…
(the button always shows the next playbook step; *More* lists all of them) and the contact moves on, the connection status is set,
and the playbook's suggested next action and due date are filled in (comment in 2 days, request in 3, welcome the day after
acceptance, withdraw check after 14 days…). *Need identified* asks for the use case and *Client won* for the estimated monthly
value. The outcome override parks or closes a prospect. Every step is logged on the contact's timeline, and the contact page has a
"LinkedIn outreach" card with the same actions.

The page's top shows the workbook's Dashboard numbers for a period (by date followed): followed, requests, accepted and
acceptance rate, replies and reply rate, needs, offers, trial rides, clients won and win rate, won / open monthly value, overdue and
due-this-week actions, no-next-action and not-yet-followed counts. Filters cover group, stage, persona, connection status,
priority, action flag and list; bulk actions log a step, set a persona or park/close many prospects; *Export* downloads the view in the
workbook's Data-tab layout. The **Playbook** tab holds the 12 steps with what to do, what to say (copy button), what to log and what
to watch out for, plus the daily rhythm and guardrails.

### Sign-in and team access

Only the ten team accounts can use the app (FD-001 Charan, super admin; FD-002 Haroon; FD-003 Abdul; FD-004 Munish; FD-005 Jasleen;
FD-006 Gurleen; FD-007 Azam; FD-008 Sukhpreet; FD-009 Ashish; FD-010 Sameer). Usernames are the first names in lower case. The
accounts are created on first start with a generated password each, printed in the API log and written to
`server/initial-passwords.txt` (git-ignored): hand them out, then delete the file. Everyone can change their own password from the
account menu at the bottom of the sidebar. The super admin's only extra powers are managing email templates (create / edit / delete /
restore) and **Team access** in the account menu: reset someone's password (a new one is shown once) or switch their access off.

Every API call needs `Authorization: Bearer <token>` from `POST /api/auth/login` (the web app stores it in the browser; sessions last 30
days and end when the password changes). For scripts (`import:links`, the smoke tests) set `API_TOKEN=<any long secret>` in `server/.env`
and they send it automatically. `SESSION_SECRET` signs the tokens; when unset one is generated once and kept in the database.

### Email templates

**Email templates** (sidebar, and a card on the dashboard) holds reusable emails with merge fields such as `{{firstName}}`,
`{{company}}`, `{{bookingDate}}`, `{{bookingTime}}`, `{{senderName}}` and `{{companyName}}`. Eight built-in templates are seeded on
first start (intro for travel advisors / executive assistants, after-voicemail follow-up, quote follow-up, booking confirmation,
day-before reminder, thank-you, re-engagement); edit, duplicate or delete them and restore the missing built-ins any time.

The **Email** button on a follow-up row, on a contact page and in the contact "…" menu opens a dialog: pick a template, it is filled
in with that contact's details (fields that are blank on the contact are listed as a warning), adjust the text, then either
**Open in mail app** (a `mailto:` link, always available) or **Send now** (when sending is configured). Both are logged on the contact's
timeline, update "last contacted" and count template usage.

Sending set-up in `server/.env` (optional): for Gmail set `GMAIL_USER` and `GMAIL_APP_PASSWORD` (an App Password from Google Account →
Security → 2-Step Verification), or use any SMTP server with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Set
`SENDER_NAME`, `SENDER_PHONE` and `COMPANY_NAME` so the signature merge fields fill in. Restart the API after changing `.env`.

### Saved views

The Contacts page's search, filters and sort can be saved as a named **view** (Views menu → *Save current view…*). Views are stored
in the database, can be applied from the menu, renamed, updated with the current filters, deleted, and pinned so they show in the
sidebar under Contacts.

### Duplicates

The **Duplicates** page groups contacts that look like the same person: same email (any of the three email fields), same contact
phone together with a shared name word (so office switchboard numbers do not link colleagues), same name + company, and optionally
the same full name only. Pick which contact to keep and **Merge**: the kept contact's values win, empty fields are filled from the
others, notes / tags / call history / reminders are combined and the others are deleted. Every merge can be undone (toast action or
*Recent merges*). **Not duplicates** remembers a group so it is never shown again. Two to ten contacts selected in the Contacts list
can also be merged from the bulk bar.

### Bulk import / re-sync of the team's calling sheets

`server/sheets.json` lists the calling sheets (name, `date`, link, optional `tab`/`tabs`, `note`). With the API running:

```bash
npm run import:links -w server            # import new sheets, re-sync the ones already linked
npm run import:links -w server -- --dry   # preview only: rows, mapped columns, unmapped headers
```

Private sheets fail with 403 until they are shared as "Anyone with the link"; the ones already imported from a downloaded
copy are linked to their URL, so they start syncing as soon as sharing is enabled.

The script first saves the list itself in the database (`POST /api/sheets/bulk`), so the sheets, their dates and links survive
restarts and show under **Linked sheets** on the Import page even before they are imported ("Not imported yet"). The same page has
an **Add sheet** form (name, date, link); pasting a link that is already listed updates its name or date. Every import from a link
adds the sheet to this list automatically. `GET /api/sheets`, `POST /api/sheets`, `DELETE /api/sheets/:id` manage it (deleting an
entry keeps the imported contacts and history).

## What gets imported

Each sheet of a workbook is imported separately. Columns are matched to these fields automatically (you can change the mapping before importing):

Name, Email (Email 1), Title, Company Name, Website, Primary Email, Second Email, Contact LI (LinkedIn profile URL), Company Info, Company No (Company Phone 1), Contact Main (Contact Phone 1), Location (city + state are joined), Status, Date of calling, Follow-up 1 date + status, Follow-up 2 date + status, Next follow-up, Stage (a "Started" / call-result column maps here too), Booking Date, Booking Time, Notes / Remarks.

The team's calling-sheet layout (`Date Of Calling | Status | Follow Up 1 | Status | Follow Up 2 | Status | Remarks`) is understood:
every round with a result becomes a call in the contact's activity history, the decisive result sets the stage
(a plain "voicemail" on a later round does not override an earlier "dont need" / "wrong number" / "prospect"), and a follow-up date
without a result becomes the next follow-up.

Columns that are not mapped are kept on the contact under "Other columns", so nothing is lost.

Free-text status values are understood, for example `voicemail`, `not in service`, `dont need`, `hung up`, `wrong number`, `faulty number`,
`busy said to call back`, `prospect`, `Connected`, `Not interested`, `Ready`, `Converted`, `Done`, `Booked`.

### Pipeline

`New → Started → Connected / Voice Mail / Wrong Number → Prospect → Ready → Converted → Done` or `Future Booking` (with date, time and note).

### Duplicates

Contacts are matched by email (otherwise name + company, otherwise name + phone). When importing you choose to **skip** existing contacts or **update** them with the new values. Rows that were added by an import can be undone from the Import page.

## Scripts

| command | what it does |
|---|---|
| `npm run dev` | embedded MongoDB + API + web app |
| `npm run dev:app` | API + web app only (use with `MONGODB_URI`) |
| `npm run db` / `npm run server` / `npm run client` | each part on its own |
| `npm run sample` | generate `samples/sample-contacts.xlsx` |
| `npm run smoke -w server` | end-to-end API test against the sample workbook (**drops the database first**, then leaves the sample data imported) |
| `node client/scripts/check-routes.mjs` | fetch every page from the running dev server and report compile errors |
| `npm run build` | production build of the web app |
| `npm start` | run everything in production mode |

Note for OneDrive users: the project lives inside OneDrive, so installs are slow and the API's file watcher occasionally restarts when OneDrive touches a file. Both are harmless.

## API

See [docs/API.md](docs/API.md).

## Project layout

```
client/   Next.js app (src/app = pages, src/components, src/lib/api.js = API client)
server/   Express API (src/routes, src/services/importer.js = Excel import, src/models)
docs/     API contract
samples/  generated sample workbook
```
