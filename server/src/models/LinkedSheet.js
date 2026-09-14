import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// The team's list of calling sheets: one entry per Google spreadsheet, kept in the database so it
// survives restarts and database moves. Import batches (the actual imports/syncs) are matched to an
// entry by spreadsheetId; an entry can exist before the sheet is imported (or when it is private/empty).
const LinkedSheetSchema = new Schema(
  {
    spreadsheetId: { type: String, required: true, unique: true },
    gid: { type: String, default: '' },
    url: { type: String, default: '' },
    name: { type: String, default: '' },
    // The sheet's date as the team writes it ("August 17,19,2026", "01/09/2026") + the first parsed calendar date for sorting.
    dateLabel: { type: String, default: '' },
    date: { type: Date, default: null },
    // Optional: workbook tab(s) to import for this sheet (used by scripts/import-links.js).
    tabs: { type: [String], default: [] },
    note: { type: String, default: '' },
    // Outcome of the last sync attempt (manual or automatic), so the Import page can show why a sheet is not syncing.
    lastCheckedAt: { type: Date, default: null },
    lastCheck: { type: String, enum: ['', 'synced', 'unchanged', 'error'], default: '' },
    lastError: { type: String, default: '' },
    // Two-way sync: the CRM writes its stage / priority / tags / follow-up / booking / last call
    // into "CRM ..." columns of the linked tab (and, optionally, into the mapped Stage / Follow-up
    // columns). Needs a Google service account (GOOGLE_SERVICE_ACCOUNT_FILE) with Editor access to the sheet.
    writeBack: {
      enabled: { type: Boolean, default: false },
      updateMappedColumns: { type: Boolean, default: false },
      lastPushAt: { type: Date, default: null },
      lastPushResult: { type: String, enum: ['', 'ok', 'error'], default: '' },
      lastPushError: { type: String, default: '' },
      lastPushCount: { type: Number, default: 0 },
      lastPushUnmatched: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

export const LinkedSheet = model('LinkedSheet', LinkedSheetSchema);
