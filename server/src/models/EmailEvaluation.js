import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// Email Evaluation CRM: one row per client evaluated by email, kept in step with the team's
// "EMAIL EVALUATION" Google Sheet (services/emailEvaluation.js). The sheet's columns live on the
// document as plain fields; `sheet` holds the values as they were at the last sync, so a later sync
// can tell a change made in the sheet (overwrites the field) from one made here (kept).
export const EVAL_FIELDS = ['date', 'evaluatedFor', 'clientName', 'company', 'status', 'primaryEmail', 'secondaryEmail', 'phone', 'notes', 'followUp', 'followUpDate'];

const sheetValues = Object.fromEntries(EVAL_FIELDS.map((f) => [f, { type: String, default: '' }]));

const EmailEvaluationSchema = new Schema(
  {
    // Where the row came from: the spreadsheet + tab + a stable key (email / name within the tab).
    // Rows added in the CRM have source 'crm' and no tab; `key` is unique either way.
    source: { type: String, enum: ['sheet', 'crm'], default: 'sheet' },
    spreadsheetId: { type: String, default: '' },
    tab: { type: String, default: '' },
    rowNumber: { type: Number, default: 0 },
    key: { type: String, required: true, unique: true },

    // The sheet's columns (DATE, DATA EVALUATED FOR, CLIENT NAME, COMPANY NAME, STATUS, PRIMARY EMAIL,
    // SECONDARY EMAIL, Phone no, NOTES, FOLLOW UP, DATE OF FOLLOW UP). The second STATUS column is not kept.
    date: { type: Date, default: null }, // the DATE column when it is a real date
    dateLabel: { type: String, default: '' }, // the DATE column as written (also when it is not a date)
    evaluatedFor: { type: String, default: '' },
    clientName: { type: String, default: '' },
    company: { type: String, default: '' },
    status: { type: String, default: '' },
    primaryEmail: { type: String, default: '' },
    secondaryEmail: { type: String, default: '' },
    phone: { type: String, default: '' },
    notes: { type: String, default: '' },
    followUp: { type: String, default: '' },
    followUpDate: { type: String, default: '' },

    // Follow-up sends logged in the CRM (Sent 2, Sent 3 ... up to Sent 5); never written to the sheet.
    sends: {
      type: [{ _id: false, n: Number, date: Date, channel: String, by: String, at: Date }],
      default: [],
    },
    // Derived by services/emailEvaluation.js followUpState() from `sends`, DATE OF FOLLOW UP and DATE.
    sentCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
    nextFollowUpAt: { type: Date, default: null }, // null = not followed up (Reservations), booked, or all 5 sent

    // The same columns as last read from the sheet (text), for the three-way merge on sync.
    sheet: { type: sheetValues, default: () => ({}) },
    syncedAt: { type: Date, default: null },
    // Set when the row is no longer in the sheet but was edited here, so it is kept rather than dropped.
    missingSince: { type: Date, default: null },
    editedAt: { type: Date, default: null },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true },
);

EmailEvaluationSchema.index({ date: -1, _id: -1 });
EmailEvaluationSchema.index({ tab: 1 });
EmailEvaluationSchema.index({ evaluatedFor: 1 });
EmailEvaluationSchema.index({ clientName: 1 });
EmailEvaluationSchema.index({ primaryEmail: 1 });
EmailEvaluationSchema.index({ nextFollowUpAt: 1 });

export const EmailEvaluation = model('EmailEvaluation', EmailEvaluationSchema);
