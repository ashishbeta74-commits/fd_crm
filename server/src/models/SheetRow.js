import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// One row of a sheet workspace (see workspaces.js). The field values live under `values` (keyed by the
// workspace's field keys: strings, Dates for date fields, numbers for number fields) and `sheet` keeps
// the same cells as text as last read from the sheet, for the three-way merge on sync
// (services/workspaces.js). Rows added in the CRM have source 'crm' and no tab.
const SheetRowSchema = new Schema(
  {
    workspace: { type: String, required: true },
    source: { type: String, enum: ['sheet', 'crm'], default: 'sheet' },
    spreadsheetId: { type: String, default: '' },
    tab: { type: String, default: '' },
    rowNumber: { type: Number, default: 0 },
    // unique within the workspace: the key column (an enquiry id), else email / name within the tab, else the row number
    key: { type: String, required: true },
    values: { type: Schema.Types.Mixed, default: () => ({}) },
    sheet: { type: Schema.Types.Mixed, default: () => ({}) },
    // group in the workspace's `rankBy` order (0 = first group), for the default sort; 0 when the workspace has none
    rank: { type: Number, default: 0 },
    syncedAt: { type: Date, default: null },
    missingSince: { type: Date, default: null },
    editedAt: { type: Date, default: null },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true, minimize: false },
);

SheetRowSchema.index({ workspace: 1, key: 1 }, { unique: true });
SheetRowSchema.index({ workspace: 1, 'values.date': -1, _id: -1 });
SheetRowSchema.index({ workspace: 1, 'values.status': 1 });
SheetRowSchema.index({ workspace: 1, tab: 1 });
SheetRowSchema.index({ workspace: 1, rank: 1 });

export const SheetRow = model('SheetRow', SheetRowSchema);
