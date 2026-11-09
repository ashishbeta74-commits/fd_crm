import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// Follow-up sends for one group of a workspace's "Merge duplicates" view (Reservations: one passenger, keyed by
// paxKey), across all their rows. Same sequence as Email Evaluation: Sent 1-4 by email, then Text 1-3 (n 5-7),
// each due 10 working days after the last. Nothing is sent until someone logs Sent 1.
const GroupFollowUpSchema = new Schema(
  {
    workspace: { type: String, required: true },
    key: { type: String, required: true },
    sends: { type: [{ _id: false, n: Number, date: Date, channel: String, by: String, at: Date }], default: [] },
    // derived from `sends` by services/emailEvaluation.js sendsState()
    sentCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
    nextFollowUpAt: { type: Date, default: null },
  },
  { timestamps: true },
);

GroupFollowUpSchema.index({ workspace: 1, key: 1 }, { unique: true });
GroupFollowUpSchema.index({ workspace: 1, nextFollowUpAt: 1 });

export const GroupFollowUp = model('GroupFollowUp', GroupFollowUpSchema);
