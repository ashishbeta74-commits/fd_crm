import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// One document per calendar day (New York): the Daily Progress Report. `metrics` is what was done that
// day (counted from the contacts' history), `snapshot` is where the pipeline stood at the end of it
// (the last capture of the day). Today's document is refreshed every few minutes and on every request;
// once the day is over it is written one last time and marked `final`.
const DailyReportSchema = new Schema(
  {
    date: { type: String, required: true, unique: true }, // "YYYY-MM-DD"
    metrics: { type: Schema.Types.Mixed, default: () => ({}) },
    snapshot: { type: Schema.Types.Mixed, default: null },
    capturedAt: { type: Date, default: null },
    final: { type: Boolean, default: false },
    // Which counting rules produced `metrics` (METRICS_VERSION in services/dailyReport.js); older reports are recounted.
    version: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false },
);

export const DailyReport = model('DailyReport', DailyReportSchema);
