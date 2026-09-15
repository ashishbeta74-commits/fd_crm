# CRM API contract

Base URL: `http://localhost:4000/api` (the Next.js client proxies `/api/*` to it, so client code calls relative `/api/...`).
All responses are JSON unless noted. Errors: `{ "error": "message", "details"?: any }` with 4xx/5xx status.

## Domain model

### Pipeline stages (`stage`)
| key | label | meaning |
|---|---|---|
| `new` | New | imported, not contacted yet |
| `started` | Started | called at least once |
| `connected` | Connected | spoke with the contact |
| `voicemail` | Voice Mail | left a voicemail / no answer |
| `wrong_number` | Wrong Number | number was wrong or out of service |
| `hung_up` | Hung Up | picked up and hung up / cut the call |
| `not_interested` | Not Interested | spoke, but they do not need the service ("dont need", "declined", "DNC" in the sheets) |
| `prospect` | Prospect | showed interest |
| `ready` | Ready | ready to convert |
| `converted` | Converted | became a customer |
| `done` | Done | completed / closed |
| `future_booking` | Future Booking | booked for a later date/time (see `booking`) |


### Contact document
```jsonc
{
  "_id": "…",
  "name": "", "email": "", "title": "", "companyName": "", "website": "",
  "primaryEmail": "", "secondaryEmail": "", "contactL1": "",   // contactL1 = LinkedIn profile URL ("Contact LI Profile URL")
  "companyInfo": "",
  "companyNo": "", "contactMain": "", "location": "",
  "status": "",                 // raw status text from the sheet
  "followUp": "2026-09-15T00:00:00.000Z" | null,   // calendar date stored as UTC midnight
  "followUpNote": "",
  "followUpCount": 0,           // follow-up rounds done (POST activities type "followup" adds one); the next one is #count+1
  "stage": "new",
  "booking": { "date": null | "2026-09-22T00:00:00.000Z", "time": "10:30", "note": "", "bookedAt": null | "2026-09-12T14:03:00.000Z" },  // bookedAt = when the date was set / last moved
  "notes": "",
  "activities": [ { "_id", "type": "import|note|call|stage|booking|edit", "message", "fromStage", "toStage", "at" } ],
  "source": { "fileName": "", "sheetName": "", "row": 12, "batchId": "…" | null },
  "importBatchIds": ["…"],
  "extra": { "Unmapped Column": "value" },   // spreadsheet columns that were not mapped
  "dedupeKey": "e:jane@example.com",
  "lastContactedAt": null | "2026-09-10T12:00:00.000Z",
  "createdAt": "…", "updatedAt": "…"
}
```
Date-only values (`followUp`, `booking.date`) are UTC midnight. Display them with the UTC date parts (e.g. `toISOString().slice(0,10)`), never with local getters.
When sending dates to the API, send `"YYYY-MM-DD"` strings (or `null` to clear).

## Endpoints

### `GET /api/health` → `{ ok, db, time }`

### `GET /api/meta`
`{ stages: [{key,label,description}], fields: [{key,label,type,group,aliases}], activityTypes: [], sheets: ["Leads", …], db: "mongodb://…" }`
`fields` lists everything a spreadsheet column can be mapped to (used by the import mapping UI).

### `GET /api/contacts`
Query params (all optional): `q` (text search over name/emails/company/title/location/phones/website/status/notes),
`stage` (comma list of stage keys), `sheet` (source sheet name),
`batch` (import batch id), `followUp` (`any|overdue|today|week|none`), `booking` (`any|upcoming|none`),
`page` (1-based, default 1), `limit` (default 25, max 500),
`sort` (`updatedAt|createdAt|name|companyName|stage|category|followUp|booking.date|lastContactedAt|location|title|priorityRank`, default `createdAt`), `dir` (`asc|desc`, default `asc`). The default is insertion (calling-sheet) order, which stays put while contacts are edited; the old `updatedAt desc` default moved a contact to the top whenever its stage changed.
Response: `{ items: Contact[] (without activities), total, page, limit, pages }`

### `GET /api/contacts/export?…same params…`
Returns an `.xlsx` file (Content-Disposition attachment). Use a plain `<a href>` / `window.open`.

### `POST /api/contacts`  (201)
Body: any subset of the editable fields below. Returns the created contact.
Editable fields: `name email title companyName website primaryEmail secondaryEmail contactL1 companyInfo companyNo contactMain location status followUpNote notes` (strings),
`followUp` ("YYYY-MM-DD" | null), `followUpCount` (integer ≥ 0, rounds done), `stage`, `booking: { date, time, note }`, `extra: { [col]: string }`, `allowDuplicate: boolean`.
409 with `details.existing` when a contact with the same email (or name+company) exists and `allowDuplicate` is not true.

### `GET /api/contacts/:id` → full contact incl. `activities` sorted newest first.
### `PATCH /api/contacts/:id` → updated contact. Same body as POST. Stage / booking changes are logged as activities automatically.
### `DELETE /api/contacts/:id` → `{ ok: true }`

### `POST /api/contacts/:id/activities` → updated contact
- Log a call: `{ "type": "call", "message"?: "…", "stage"?: "connected" | "voicemail" | "wrong_number" | "hung_up" | "not_interested" | any stage, "followUp"?: "YYYY-MM-DD", "followUpNote"?: "…", "booking"?: {date,time,note} }`. Without `stage`, a `new` contact moves to `started`.
- Add a note: `{ "type": "note", "message": "…", "stage"?: "…", "followUp"?: …, "booking"?: … }`
- Add a follow-up (one round done): `{ "type": "followup", "message"?: "what happened", "followUp"?: "YYYY-MM-DD" (the next one; omitted = nothing further, the date is cleared), "followUpNote"?: "…", "stage"?: "…" }` → `followUpCount` + 1, `lastContactedAt` = now, activity `Follow-up #N done - next on …`.
### `DELETE /api/contacts/:id/followups/last` → updated contact
Takes back the most recent "Add follow-up": its history entry is deleted, `followUpCount` drops by one and `lastContactedAt` is recomputed. A counter with no entry behind it (set by hand or by import) just drops by one. 400 when there is nothing to remove.
### `DELETE /api/contacts/:id/activities/:activityId` → updated contact
Only entries logged in the app can be deleted; entries a sheet import wrote (`fromImport: true` on `GET /contacts/:id`, i.e. `source: "import"` or, for older data, type `import` / messages ending in `(import)` / the sheet's call history like `1st call: …`) answer 400. Deleting takes back what the entry recorded: a logged LinkedIn step (`LinkedIn: Followed the profile …`) clears the date it set, so the stage and the LinkedIn counters drop by one; a call or email recomputes `lastContactedAt` from what is left.

### `POST /api/contacts/bulk`
`{ ids: string[], action: "stage" | "delete", stage?: key }` → `{ matched, updated, errors }` or `{ deleted }`

### Import (two steps)
1. `POST /api/imports/preview` — multipart form, field `file` (.xlsx/.xlsm/.csv, max 30 MB); optional field `sourceUrl` (a Google Sheets link the file was exported from → the import is recorded as a linked sheet and can be re-synced once that sheet is shared by link).
   Response:
   ```jsonc
   { "uploadId": "uuid", "fileName": "leads.xlsx", "source": { "type": "file" },
     "sheets": [ { "name": "Leads", "headers": ["Name","Email",…], "rowCount": 120, "headerRow": 1, "include": true,
                   "sample": [ { "Name": "Jane", "Email": "…" }, … up to 5 ],
                   "suggestedMapping": { "Name": "name", "Email": "email", "Sr No": "" } } ] }
   ```
   **Or from a Google Sheets link** — `POST /api/imports/link/preview` with `{ "url": "https://docs.google.com/spreadsheets/d/<id>/edit?gid=0#gid=0" }`.
   The sheet must be shared as "Anyone with the link" (Viewer); otherwise 403 with an explanatory message. Same response shape plus
   `"source": { "type": "google-sheet", "url", "spreadsheetId", "gid", "title" }` and `"linkedSheet": "Sheet1"` (the tab the link's `gid` points to;
   only that tab has `include: true` by default, other tabs are returned with `include: false`).
   Mapping notes: fields marked `multi` in `/api/meta` (`location`, `notes`, `companyInfo`, `followUpNote`, `tags`) may receive several columns (values are joined);
   `stage` may take two columns too (a "Stage" and a "Started" / call-result column: a pipeline stage beats a plain call result);
   every other field accepts one column. Calling-sheet columns map to `calledOn` (Date Of Calling), `status` (its result), `followUp1`/`followUp1Status`,
   `followUp2`/`followUp2Status`; each round with a result becomes a `call` activity, the decisive result sets the `stage` (Connected / Voice Mail / Wrong Number / Prospect …), and a follow-up date
   without a result becomes the next `followUp`. `contactL1` is the contact's LinkedIn profile URL.
2. `POST /api/imports/commit`
   ```jsonc
   { "uploadId": "uuid", "duplicateStrategy": "skip" | "update", "updateStage": false,
     "listName": "Fora Travel",      // optional display name of the list; default = sheet title / file name; a taken name gets " 2", " 3"... appended
     "requirePhone": true,           // default true: rows without a contact phone (contactMain) are not imported (counted as noPhone)
     "sheets": [ { "name": "Leads", "include": true, "mapping": { "Name": "name", "Email": "email", "Sr No": "" }, "defaultStage"?: "new" } ] }
   ```
   Imported contacts get `source.sheetName` = the list name (or "List - Tab" when several tabs are included) and `source.tabName` = the workbook tab.
   `GET /api/imports/list-names` → `{ items: ["Fora Travel", "Travel Advisors", …] }` (names already in use). Sheet result / totals also carry `noPhone`.
   Response = ImportBatch:
   ```jsonc
   { "_id", "fileName", "strategy", "updateStage", "status": "done",
     "sheets": [ { "name", "included", "rows", "created", "updated", "skipped", "blank", "merged", "errorCount", "errorSamples": [{row,message}], "error"?: "sheet-level error text" } ],
     "totals": { "rows", "created", "updated", "skipped", "blank", "merged", "errorCount" }, "undoneAt": null, "deletedOnUndo": 0, "createdAt" }
   ```
   Duplicates are detected by email (else name+company, else name+phone). `skip` keeps the existing contact untouched; `update` fills/overwrites its fields with non-empty sheet values. `updateStage: true` also moves existing contacts to the stage the sheet says.
   Uploads expire after 60 minutes (410).
   ImportBatch also carries `"source": { type: "file" | "google-sheet", url, spreadsheetId, gid, title }`, `"resyncOf"` (batch id when it was a re-sync) and `"syncedAt"`.
- `GET /api/imports` → `{ items: ImportBatch[] }` (newest first, without `plans`)
- `GET /api/imports/:id` → ImportBatch (with the stored `plans`)
- `GET /api/imports/sources` → `{ items: [ { spreadsheetId, gid, url, title, lastBatchId, lastSyncedAt, totals, strategy, updateStage } ] }` — linked Google Sheets (latest batch per sheet)
- `POST /api/imports/:id/resync` body `{ duplicateStrategy?: "skip"|"update" (default update), updateStage?: boolean (default false), requirePhone?: boolean }` → re-fetches the linked sheet and re-imports with the stored mapping → new ImportBatch (`resyncOf` = id). 400 if the batch did not come from a link.
  With `updateStage: false` (the sync default) stages chosen in the CRM are kept: the sheet only moves contacts that are still in a call-progress stage (`new`, `started`, `connected`, `voicemail`, `wrong_number`, `hung_up`, `not_interested`), and new call rounds always add activities. Nothing is ever deleted by a sync.
  The server also re-syncs every linked sheet on a timer when `SHEET_SYNC_MINUTES` > 0.
- `GET /api/imports/template` → .xlsx template with the expected column names
- `DELETE /api/imports/:id` → undo: deletes contacts created by that import → `{ deleted, batch }`

### `GET /api/stats`
```jsonc
{ "total": 120,
  "byStage": { "new": 40, "started": 20, "connected": 8, "voicemail": 10, "wrong_number": 2, … },
  "bySheet": [ { "sheet": "Leads", "count": 60 } ],
  "followUps": { "overdue": 3, "today": 2, "week": 9 },
  "contactedToday": 4,          // lastContactedAt since midnight: calls / emails logged, or moved out of New
  "prospectsToday": 2,          // contacts that entered the Prospect stage since midnight and are still in it
  "todayByStage": { "prospect": 2, "voicemail": 40, "hung_up": 3, "not_interested": 5 },   // same rule, per call-result stage
  "upcomingBookings": [ { _id, name, companyName, stage, booking } ],   // next 8
  "dueFollowUps": [ { _id, name, companyName, stage, followUp, followUpNote } ],   // overdue + this week, 8
  "recentActivity": [ { contactId, name, companyName, activity: { type, message, fromStage, toStage, at } } ],
  "recentImports": [ { _id, fileName, totals, status, createdAt, undoneAt } ] }
```

### Daily Progress Report `GET /api/stats/daily?date=YYYY-MM-DD`
One day's work (New York calendar; default today) plus where the pipeline stood at the end of it:
```jsonc
{ "date": "2026-09-14", "isToday": true, "final": false,
  "metrics": { "calls", "contactsCalled", "contactsWorked", "emails", "followUpsDone", "notes", "bookings", "linkedinSteps",
               "stageChanges", "prospects", "connected", "converted", "stageMoves": { "<stage>": n }, "newContacts",
               "imports", "importedRows", "importUpdatedRows", "remindersDone", "remindersSet" },
  "snapshot": { "total", "byStage", "followUps": { "overdue", "today" }, "reminders": { "open", "overdue" }, "upcomingBookings" } | null,
  "capturedAt": "…", "today": "2026-09-14", "prev": "2026-09-13", "next": null }
```
`metrics` are counted from the contacts' history (calls a sheet sync wrote count on their sheet calling date; only the "Imported from …" entries are skipped), so any past day works. The `snapshot` is captured
every 5 minutes for the current day and kept as that day's end-of-day state (`dailyreports` collection); days before the feature
existed have `snapshot: null`. Past days are `final` once closed and are served from the saved report.
`GET /api/stats/daily/history?days=14` → `{ today, days: [{ date, calls, contactsWorked, prospects, activities }] }` (oldest first).
`GET /api/stats/daily/range?from=YYYY-MM-DD&to=YYYY-MM-DD` (max 366 days; `to` defaults to today, `from` to 6 days before `to`) →
`{ from, to, days, metrics, perDay: [{ date, calls, contactsWorked, prospects, connected, followUpsDone, emails, stageChanges, activities }], today }`.
`metrics` has the same shape as one day's, counted over the whole span (`contactsCalled` / `contactsWorked` are distinct across the span).
The dashboard keeps the selection in the URL: `/?day=…` for one day, `/?from=…&to=…` for a range.

### `GET /api/followups`
`{ overdue: Entry[], today: Entry[], week: Entry[], later: Entry[], past: Entry[] }` where
`Entry = { kind: "followUp" | "booking", date, time?, note, contact: Contact }` (sorted by date/time; `past` holds bookings whose date already passed).

## Priority, tags, saved views, reminders, duplicates, two-way sync

### Contact fields added
- `city`, `state`, `country` (2026-09-15): the filterable parts of where a contact is; `location` stays the display line. Imports map "Company City" / "Company State" / country columns to them and split a free-text location otherwise (`lib/geo.js`: "Albany, New York" -> Albany / New York / United States, US state abbreviations expanded, country inferred from the state or well-known cities); editing the parts refreshes `location` unless it was edited too. A start-up migration split existing contacts once. Filters: `GET /api/contacts?country=United%20States&state=New%20York,Texas&city=Houston` (comma lists, exact case-insensitive; `none` = not set); the search `q` matches them too; the export has City / State / Country columns. `GET /api/meta` returns `countries`, `states`, `cities` as `[{ name, count }]`.
- `leadQuality` (2026-09-15): what the call revealed, kept beside the stage. Free text (≤ 40 chars); presets "Money minded", "Cheap rate", "Services" and "Other…" in the UI for the team's own labels. Filter `GET /api/contacts?leadQuality=Money%20minded,Services` (`none` = unset), sort `sort=leadQuality`, bulk `POST /api/contacts/bulk { action: 'leadQuality', leadQuality }`, import field `leadQuality` (aliases quality / lead type / budget), export column "Lead Quality". `GET /api/meta` returns `leadQualities` (presets) and `leadQualityCounts: [{ name, count }]`. Changes are logged on the contact ("Lead quality set to …").
- Follow-up way (2026-09-15): `POST /api/contacts/:id/activities { type: 'followup', channel: 'call' | 'message' | 'email', … }` stores `channel` on the history entry and words the summary "Follow-up #2 done by email - next on …".
- `category` (shown as "Type"): `'' | 'travel_advisor' | 'executive_assistant' | 'other'`. Set on import from the sheet plan's `category`, else guessed from the list name and the job title (`guessCategory` in `fields.js`); a sync only fills an empty type, never overwrites one. Existing contacts were backfilled once by a start-up migration. Filter with `GET /api/contacts?category=travel_advisor,executive_assistant` (`none` = not set), sort with `sort=category`, bulk-set with `POST /api/contacts/bulk { action: 'category', category }`. `GET /api/meta` lists `categories`.
- `priority`: `'' | 'urgent' | 'high' | 'medium' | 'low'` (`priorityRank` 0-4 mirrors it for sorting; `sort=priorityRank&dir=desc`).
- `tags`: `string[]` (trimmed, de-duplicated case-insensitively, max 30 × 40 chars).
- `GET /api/contacts` extra params: `tag=VIP,NJ` (any of, case-insensitive; `none` = untagged), `priority=urgent,high` (`none` = unset).
- `POST /api/contacts/bulk` extra actions: `priority` (`{ priority }`), `addTags` / `removeTags` (`{ tags: [...] }`).
- `GET /api/contacts/:id` also returns `reminders` (open ones first, then the last 10 done).
- `GET /api/meta` also returns `priorities` and `tags: [{ tag, count }]`.
- Import fields `priority` (aliases Pri / Priority / Importance…; values such as `P1`, `high`, `A`, `urgent`) and `tags` (Tags / Category / Labels…, split on `, ; | /`).

### Saved views `GET|POST /api/views`, `PATCH|DELETE /api/views/:id`, `POST /api/views/reorder`
`{ name, params, pinned, order }`. `params` = the `GET /api/contacts` filter/sort keys (`q, stage, sheet, batch, tag, priority, followUp, booking, sort, dir`); defaults and empties are dropped. Names are unique (case-insensitive → 409).

### Reminders
- `GET /api/reminders?scope=open|done|all` → `{ overdue, today, week, later, done }`, each `[{ ...reminder, overdue, contact }]`, most urgent first then soonest.
- `GET /api/reminders/due` → `{ overdue, today, byPriority, items (due today or earlier, ≤25), unnotified, now }` – what the bell shows.
- `POST /api/reminders` `{ contactId, at, note?, priority? }` (201). `at` = ISO date-time, or `YYYY-MM-DD` = that day 09:00 local. `priority` defaults to the contact's. Logs a `reminder` activity on the contact.
- `PATCH /api/reminders/:id` `{ at?, note?, priority?, done? }` · `POST /api/reminders/:id/snooze` `{ minutes }` or `{ until }` · `DELETE /api/reminders/:id`.
- `POST /api/reminders/notified` `{ ids }` – marks reminders as shown (browser notification fired).
- `GET /api/followups` now also lists open reminders as `{ kind: 'reminder', reminderId, date, time, at, overdue, priority, note, contact }`; entries on the same day are ordered by priority.
- `GET /api/stats` adds `byPriority` and `reminders: { overdue, today, unscheduledPriority }` (urgent/high contacts with neither a follow-up nor an open reminder).

### Phone scripts & Q&A (2026-09-15)
The calling playbook, collection `scripts`: `{ kind: 'script' | 'qa', title, body, category, order, builtIn, builtInKey, createdBy, updatedBy }`. For `script`, title = name and body = the script; for `qa`, title = the question / objection and body = the answer. Any signed-in user may add, edit or delete.
- `GET /api/scripts` → `{ items (both kinds, by kind then order), builtInCount }`
- `POST /api/scripts` `{ kind, title, body?, category?, order? }` (201) · `PATCH /api/scripts/:id` (partial) · `DELETE /api/scripts/:id`
- `POST /api/scripts/restore` → re-adds deleted built-ins → `{ added, items }`
Built-ins (5 scripts, 10 Q&A) are seeded on first start from `server/src/services/scripts.js`; page `/scripts` in the web app.

### Duplicates
- `GET /api/duplicates?by=email,phone,name_company[,name]&sheet=&q=&page=&limit=` → `{ items: [{ key, reasons, confidence, suggestedPrimaryId, contacts }], total, contactsInGroups, scanned, page, pages }`. Contacts are linked by union-find across the enabled criteria; `phone` only links when the names share a word; pairs marked "not duplicates" never link.
- `POST /api/duplicates/merge` `{ primaryId, mergeIds }` → `{ contact, mergeId, merged }`. Primary values win, gaps are filled, notes/tags/history/import batches/reminders are combined, the others are deleted.
- `GET /api/duplicates/merges` → recent merges · `POST /api/duplicates/merges/:id/undo` restores the merged contacts and the primary as it was (409 if already undone).
- `POST /api/duplicates/ignore` `{ ids }` marks every pair among `ids` as not duplicates · `DELETE /api/duplicates/ignore` `{ ids }` · `GET /api/duplicates/ignore`.

### Two-way Google Sheet sync
- `GET /api/sheets/writeback` → `{ configured, email, error, debounceSeconds, columns, appUrl }` (also embedded as `writeBack` in `GET /api/imports/sources`; each source row carries its own `writeBack` settings + last push status).
- `PATCH /api/sheets/:id` accepts `writeBack: { enabled?, updateMappedColumns? }`.
- `POST /api/sheets/rename` `{ from, to, sheetId? }` → `{ from, to, contacts, batches, sheets, views }` – renames a list everywhere: the contacts' `source.sheetName` (including `"<list> - <tab>"` sub-lists), the import batches' `listName` (so the next sync keeps the new name), the saved sheet entry (`sheetId` also renames that entry when its name differs) and saved views filtering on it. 409 when another list already has that name.
- `POST /api/sheets/:id/push` → `{ spreadsheetId, contacts, matched, unmatched, tabs: [{ name, matched, addedColumns | error }] }` – writes every contact of the sheet now. Needs `GOOGLE_SERVICE_ACCOUNT_FILE` (or `_JSON`) and the sheet shared with the service account as Editor; 400 when not configured, 403 when the sheet is not shared.
- Automatic: contacts saved in the CRM are pushed to their sheet `SHEET_WRITEBACK_SECONDS` (default 20) later when the sheet has `writeBack.enabled`.

### Email templates and sending
- `GET /api/templates` → `{ items, mergeFields: [{ key, label }], sender: { name, phone, company }, builtInCount }`. Template: `{ name, subject, body, category: outreach|follow-up|booking|other, builtIn, order, usedCount, lastUsedAt }`. Names are unique (case-insensitive → 409).
- `POST /api/templates` (201) · `PATCH /api/templates/:id` · `DELETE /api/templates/:id` · `POST /api/templates/restore` re-adds missing built-ins.
- `POST /api/templates/render` `{ templateId | subject+body, contactId }` → `{ subject, body, missing: [fieldKeys], to: [candidate addresses] }`. Merge fields: `firstName, name, company, title, email, phone, location, followUpDate, bookingDate, bookingTime, bookingNote, senderName, senderPhone, companyName, today` (`{{key}}`, case-insensitive; unknown placeholders are left as-is).
- `GET /api/email/status` → `{ configured, from, kind: gmail|smtp|none, sender }`.
- `POST /api/email/send` `{ contactId, templateId?, to, subject, body }` sends via Gmail / SMTP (400 when not configured, 502 when the server rejects it) and logs an `email` activity on the contact (also bumps `lastContactedAt` and the template's `usedCount`).
- `POST /api/email/log` same body: for the `mailto:` path - logs the activity and usage without sending.
- Activity type `email` added to `ACTIVITY_TYPES`.

### Browser push notifications `/api/push`
Reminders are pushed to the browsers of whoever set them (reminders without a creator go to every subscribed browser) the minute they come due, plus a daily "your day" summary at `PUSH_DIGEST_AT` (New York time, default 08:30; empty disables it). Works with the app closed: the web app registers `/sw.js` and subscribes with the VAPID public key. Keys come from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` or are generated once and stored in the settings collection.
- `GET /api/push/key` → `{ publicKey }`
- `POST /api/push/subscribe` `{ subscription: PushSubscriptionJSON }` → 201; the browser is bound to the signed-in user
- `DELETE /api/push/subscribe` `{ endpoint }` → `{ ok }`
- `POST /api/push/test` → `{ sent }` – a test notification to the caller's browsers (400 when none subscribed)
- `GET /api/push/status` → `{ subscriptions }`
Reminder documents gained `createdBy` and `pushedAt`.

### Authentication
Every endpoint except `GET /api/health` and `POST /api/auth/login` requires `Authorization: Bearer <token>` (401 otherwise). The static `API_TOKEN` from `server/.env` is also accepted (acts as super admin, for scripts).
- `POST /api/auth/login` `{ username, password }` → `{ token, user }` (401 wrong credentials; 429 after 5 failures for 30 s). Tokens last 30 days and stop working once the user's password changes or access is switched off.
- `GET /api/auth/me` → `{ user: { _id, username, displayName, userId, role: admin|agent, active, lastLoginAt } }` · `POST /api/auth/logout` (no-op; the client forgets the token).
- `POST /api/auth/change-password` `{ currentPassword, newPassword (≥ 8) }` → `{ token, user }` (a fresh token; older sessions are invalidated).
- Super admin only (403 otherwise): `GET /api/auth/users`, `POST /api/auth/users/:id/reset-password` → `{ user, password }` (shown once), `PATCH /api/auth/users/:id` `{ active?, displayName? }`.
- Super admin only: `POST|PATCH|DELETE /api/templates…` and `POST /api/templates/restore`. Reading and rendering templates, and sending email, is open to every signed-in user.
