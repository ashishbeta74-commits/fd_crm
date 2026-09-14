import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// A named set of Contacts-page filters ("Fora overdue voicemails"). `params` holds the same keys
// GET /contacts accepts (q, stage, sheet, tag, priority, followUp, booking, sort, dir).
const SavedViewSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    params: { type: Schema.Types.Mixed, default: () => ({}) },
    // Pinned views show in the sidebar under Contacts.
    pinned: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false },
);

SavedViewSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const SavedView = model('SavedView', SavedViewSchema);
