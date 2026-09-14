import mongoose from 'mongoose';
import { PRIORITY_KEYS, priorityRank } from '../fields.js';

const { Schema, model } = mongoose;

// A dated reminder on a contact ("call back about the Christmas party"). Reminders carry their own
// priority (defaults to the contact's priority when created) so the due list can be ordered
// urgent-first. `at` is a full timestamp (date + time); date-only reminders are stored at 09:00 local.
const ReminderSchema = new Schema(
  {
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
    at: { type: Date, required: true, index: true },
    note: { type: String, trim: true, default: '', maxlength: 500 },
    priority: { type: String, enum: ['', ...PRIORITY_KEYS], default: '' },
    priorityRank: { type: Number, default: 0 },
    done: { type: Boolean, default: false, index: true },
    doneAt: { type: Date, default: null },
    // Set once a browser notification was shown for it (so the bell only fires once per reminder).
    notifiedAt: { type: Date, default: null },
    // Set once a push notification was sent for it (see services/push.js).
    pushedAt: { type: Date, default: null },
    // Who set it: their browsers get the push; reminders without a creator go to everyone subscribed.
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

ReminderSchema.index({ done: 1, at: 1 });

ReminderSchema.pre('save', function preSave(next) {
  this.priorityRank = priorityRank(this.priority);
  next();
});

export const Reminder = model('Reminder', ReminderSchema);
