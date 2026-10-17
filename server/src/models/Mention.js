import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// One row per person to tell about a note: they were tagged in it (@Name / @all), or it answers a note
// they wrote (kind 'reply'). Feeds their "Tagged me" list; written by POST / PATCH
// /contacts/:id/activities (services/mentions.js) and removed with the note.
const MentionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true },
    activityId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: ['mention', 'reply'], default: 'mention' },
    // true when the note tagged @all (the list says "tagged everyone")
    all: { type: Boolean, default: false },
    byId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, default: '' },
    text: { type: String, default: '' },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

MentionSchema.index({ userId: 1, createdAt: -1 });
MentionSchema.index({ activityId: 1 });

export const Mention = model('Mention', MentionSchema);
