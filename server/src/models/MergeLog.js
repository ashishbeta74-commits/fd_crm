import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// Record of a duplicate merge, so it can be undone: the surviving contact as it was before, the
// full documents that were deleted, and which reminders were re-pointed to the survivor.
const MergeLogSchema = new Schema(
  {
    primaryId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
    primaryBefore: { type: Schema.Types.Mixed, required: true },
    merged: { type: [Schema.Types.Mixed], default: [] },
    movedReminders: { type: [{ reminderId: Schema.Types.ObjectId, contactId: Schema.Types.ObjectId }], default: [] },
    summary: { type: String, default: '' },
    undoneAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

export const MergeLog = model('MergeLog', MergeLogSchema);

// Pairs of contacts the user marked as "not duplicates"; the finder never groups them again.
const DuplicateIgnoreSchema = new Schema(
  {
    // "<smallerId>|<largerId>"
    pair: { type: String, required: true, unique: true },
    ids: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true },
);

export const DuplicateIgnore = model('DuplicateIgnore', DuplicateIgnoreSchema);
