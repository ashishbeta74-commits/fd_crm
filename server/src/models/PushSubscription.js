import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// One browser (per user, per device) that asked for push notifications. The endpoint is unique per
// browser; a user with a laptop and a phone has two rows. Rows are dropped when the push service
// answers 404/410 (the browser unsubscribed or cleared site data).
const PushSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: '' },
    lastUsedAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
  },
  { timestamps: true },
);

export const PushSubscription = model('PushSubscription', PushSubscriptionSchema);
