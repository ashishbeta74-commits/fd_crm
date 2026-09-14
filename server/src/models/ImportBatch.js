import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const SheetResultSchema = new Schema(
  {
    name: String,
    included: { type: Boolean, default: true },
    rows: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    blank: { type: Number, default: 0 },
    noPhone: { type: Number, default: 0 },
    merged: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    errorSamples: { type: [{ row: Number, message: String }], default: [] },
    error: { type: String, default: '' },
    // Tabs that were not imported can still fill empty fields (title, location, ...) of contacts imported from the other tabs.
    enriched: { type: Number, default: 0 },
    enrichedFields: { type: [String], default: [] },
  },
  { _id: false },
);

const ImportBatchSchema = new Schema(
  {
    fileName: { type: String, default: '' },
    strategy: { type: String, enum: ['skip', 'update'], default: 'skip' },
    updateStage: { type: Boolean, default: false },
    status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
    // Where the data came from. Google Sheet sources can be re-synced with the stored plans.
    source: {
      type: { type: String, enum: ['file', 'google-sheet'], default: 'file' },
      url: { type: String, default: '' },
      spreadsheetId: { type: String, default: '' },
      gid: { type: String, default: '' },
      title: { type: String, default: '' },
      // Display name of the list in the CRM (contacts carry it as source.sheetName). Unique across sources:
      // a second "Travel Advisors" becomes "Travel Advisors 2", and so on.
      listName: { type: String, default: '' },
      // Fingerprint of the imported tabs' content; the auto-sync only re-imports when it changes.
      contentHash: { type: String, default: '' },
    },
    // Rows without a contact phone (Contact Phone 1) are not imported when true.
    requirePhone: { type: Boolean, default: true },
    // The per-sheet { name, include, mapping, defaultStage } plans used, kept for re-sync.
    plans: { type: Schema.Types.Mixed, default: null },
    resyncOf: { type: Schema.Types.ObjectId, ref: 'ImportBatch', default: null },
    syncedAt: { type: Date, default: null },
    sheets: { type: [SheetResultSchema], default: [] },
    totals: {
      rows: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      blank: { type: Number, default: 0 },
      noPhone: { type: Number, default: 0 },
      merged: { type: Number, default: 0 },
      errorCount: { type: Number, default: 0 },
      enriched: { type: Number, default: 0 },
    },
    undoneAt: { type: Date, default: null },
    deletedOnUndo: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false },
);

ImportBatchSchema.index({ 'source.spreadsheetId': 1, createdAt: -1 });

export const ImportBatch = model('ImportBatch', ImportBatchSchema);
